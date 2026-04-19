const path = require('path');
const mongoose = require('mongoose');
const { checkEmailConfig } = require('@librechat/api');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { sendEmail } = require('~/server/utils');
const { createInvite } = require('~/models/inviteUser');
const connect = require('./connect');

(async () => {
  await connect();

  const email = process.argv[2];
  const customSubject = process.argv[3];

  if (!email || !customSubject) {
    console.error('Usage: node config/send-custom-invite.js <email> <subject>');
    process.exit(1);
  }

  if (!checkEmailConfig()) {
    console.error('Error: Email service is not enabled');
    process.exit(1);
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    console.error('Error: A user with that email already exists');
    process.exit(1);
  }

  const token = await createInvite(email);
  if (!token || typeof token !== 'string') {
    console.error('Error: Failed to create invite token');
    process.exit(1);
  }

  const inviteLink = `${process.env.DOMAIN_CLIENT}/register?token=${token}`;

  await sendEmail({
    email,
    subject: customSubject,
    payload: {
      appName: process.env.APP_TITLE || 'LibreChat',
      inviteLink,
      year: new Date().getFullYear(),
    },
    template: 'inviteUser.handlebars',
  });

  console.log(JSON.stringify({ email, inviteLink }));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
