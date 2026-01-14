const path = require('path');
const bcrypt = require('bcryptjs');
const { webcrypto } = require('node:crypto');
require('module-alias/register');
const moduleAlias = require('module-alias');

const basePath = path.resolve(__dirname, '..', 'api');
moduleAlias.addAlias('~', basePath);

const connect = require('./connect');

const createTokenHash = () => {
  const token = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const hash = bcrypt.hashSync(token, 10);
  return [token, hash];
};

const sendPasswordReset = async (email) => {
  try {
    await connect();

    const { findUser, createToken, deleteTokens } = require('~/models');
    const { sendEmail } = require('~/server/utils');
    const { checkEmailConfig } = require('@librechat/api');

    const DOMAIN_CLIENT = process.env.DOMAIN_CLIENT;

    if (!email) {
      console.error('Usage: node send-password-reset.js <email>');
      process.exit(1);
    }

    console.log(`Looking up user: ${email}`);
    const user = await findUser({ email }, 'email _id name username');

    if (!user) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    console.log(`Found user: ${user.name || user.username} (${user.email})`);

    // Delete any existing tokens for this user
    await deleteTokens({ userId: user._id });

    // Create new reset token
    const [resetToken, hash] = createTokenHash();

    await createToken({
      userId: user._id,
      token: hash,
      createdAt: Date.now(),
      expiresIn: 900, // 15 minutes
    });

    const link = `${DOMAIN_CLIENT}/reset-password?token=${resetToken}&userId=${user._id}`;

    const emailEnabled = checkEmailConfig();

    if (emailEnabled) {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset Request',
        payload: {
          appName: process.env.APP_TITLE || 'LibreChat',
          name: user.name || user.username || user.email,
          link: link,
          year: new Date().getFullYear(),
        },
        template: 'requestPasswordReset.handlebars',
      });
      console.log(`Password reset email sent to: ${email}`);
    } else {
      console.log('Email not configured. Password reset link:');
      console.log(link);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error sending password reset:', err);
    process.exit(1);
  }
};

const email = process.argv[2];
sendPasswordReset(email);
