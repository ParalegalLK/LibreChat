const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { createInvite } = require('~/models/inviteUser');
const { sendEmail } = require('~/server/utils');
const connect = require('./connect');

// Check if email configuration is set (inline version)
function checkEmailConfig() {
  const hasMailgunConfig =
    !!process.env.MAILGUN_API_KEY && !!process.env.MAILGUN_DOMAIN && !!process.env.EMAIL_FROM;
  const hasSMTPConfig =
    (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
    !!process.env.EMAIL_USERNAME &&
    !!process.env.EMAIL_PASSWORD &&
    !!process.env.EMAIL_FROM;
  return hasMailgunConfig || hasSMTPConfig;
}

(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('Bulk invite users!');
  console.purple('--------------------------');

  // Check email config
  const emailEnabled = checkEmailConfig();
  if (emailEnabled) {
    console.green('Email service is configured - invites will be emailed');
  } else {
    console.yellow('Email service not configured - invite links will only be saved to CSV');
  }

  // Get input file path from command line or use default
  const inputFile = process.argv[2] || path.resolve(__dirname, '../desaram-accounts/user-details.txt');
  const outputFile = process.argv[3] || path.resolve(__dirname, '../desaram-accounts/invite-results.csv');

  if (!fs.existsSync(inputFile)) {
    console.red(`Error: Input file not found: ${inputFile}`);
    process.exit(1);
  }

  console.orange(`Reading from: ${inputFile}`);
  console.orange(`Output will be saved to: ${outputFile}`);

  // Read and parse the input file
  const content = fs.readFileSync(inputFile, 'utf-8');
  const lines = content.trim().split('\n');

  // Skip header row
  const header = lines[0];
  const dataLines = lines.slice(1).filter(line => line.trim());

  console.purple(`Found ${dataLines.length} user(s) to invite`);
  console.purple('--------------------------');

  const results = [];
  const domain = process.env.DOMAIN_CLIENT || 'http://localhost:3080';
  const appName = process.env.APP_TITLE || 'LibreChat';

  for (const line of dataLines) {
    // Parse CSV line (handle potential spaces after commas)
    const [email, fullName] = line.split(',').map(s => s.trim());

    if (!email || !email.includes('@')) {
      console.red(`Skipping invalid email: ${email}`);
      results.push({ email, fullName, status: 'SKIPPED', reason: 'Invalid email', inviteLink: '', emailSent: false });
      continue;
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      console.yellow(`User already exists: ${email}`);
      results.push({ email, fullName, status: 'EXISTS', reason: 'User already exists', inviteLink: '', emailSent: false });
      continue;
    }

    try {
      const token = await createInvite(email);
      const inviteLink = `${domain}/register?token=${token}`;
      let emailSent = false;

      // Send email if configured
      if (emailEnabled) {
        try {
          await sendEmail({
            email: email,
            subject: `You're Invited to Join chat.paralegal.lk`,
            payload: {
              appName: appName,
              inviteLink: inviteLink,
              name: fullName,
              year: new Date().getFullYear(),
            },
            template: 'inviteUser.handlebars',
          });
          emailSent = true;
          console.green(`Invited & emailed: ${email} (${fullName})`);
        } catch (emailError) {
          console.yellow(`Invited but email failed: ${email} - ${emailError.message}`);
        }
      } else {
        console.green(`Invited: ${email} (${fullName})`);
      }

      results.push({ email, fullName, status: 'INVITED', reason: '', inviteLink, emailSent });
    } catch (error) {
      console.red(`Error inviting ${email}: ${error.message}`);
      results.push({ email, fullName, status: 'ERROR', reason: error.message, inviteLink: '', emailSent: false });
    }
  }

  // Write results to CSV
  const csvHeader = 'email,full_name,status,reason,invite_link,email_sent\n';
  const csvRows = results.map(r =>
    `"${r.email}","${r.fullName}","${r.status}","${r.reason}","${r.inviteLink}","${r.emailSent}"`
  ).join('\n');

  fs.writeFileSync(outputFile, csvHeader + csvRows);

  console.purple('--------------------------');
  console.purple('Summary:');
  console.green(`  Invited: ${results.filter(r => r.status === 'INVITED').length}`);
  if (emailEnabled) {
    console.green(`  Emails sent: ${results.filter(r => r.emailSent).length}`);
  }
  console.yellow(`  Already exist: ${results.filter(r => r.status === 'EXISTS').length}`);
  console.red(`  Errors: ${results.filter(r => r.status === 'ERROR').length}`);
  console.orange(`  Skipped: ${results.filter(r => r.status === 'SKIPPED').length}`);
  console.purple('--------------------------');
  console.green(`Results saved to: ${outputFile}`);

  process.exit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }
  process.exit(1);
});
