const openIdClient = require('openid-client');
const { logger, encryptV2, decryptV2 } = require('@librechat/data-schemas');
const { findToken, createToken, updateToken } = require('~/models');
const { getOpenIdConfig } = require('~/strategies');

/**
 * Persists the OpenID provider (Asgardeo) tokenset for a user in the Token
 * collection (encrypted), so short-lived provider access tokens can later be
 * handed to the client — e.g. to authorize document downloads from the
 * drafter file server — and refreshed server-side when expired.
 *
 * Storage follows the existing OAuth token pattern (see ActionService):
 *   type 'oauth'          identifier `openid:<userId>`
 *   type 'oauth_refresh'  identifier `openid:<userId>:refresh`
 */

const ACCESS_TYPE = 'oauth';
const REFRESH_TYPE = 'oauth_refresh';
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_ACCESS_TTL_SECONDS = 3600;
const EXPIRY_BUFFER_MS = 60 * 1000;

const accessIdentifier = (userId) => `openid:${userId}`;
const refreshIdentifier = (userId) => `openid:${userId}:refresh`;

/** @param {object} tokenset */
function accessTokenExpiresIn(tokenset) {
  if (typeof tokenset.expires_in === 'number') {
    return tokenset.expires_in;
  }
  if (typeof tokenset.expires_at === 'number') {
    return Math.max(Math.floor(tokenset.expires_at - Date.now() / 1000), 0);
  }
  return DEFAULT_ACCESS_TTL_SECONDS;
}

async function upsertToken({ userId, type, identifier, token, expiresIn }) {
  const encrypted = await encryptV2(token);
  const existing = await findToken({ userId, type, identifier });
  if (existing) {
    return updateToken({ userId, type, identifier }, { token: encrypted, expiresIn });
  }
  return createToken({ userId, type, identifier, token: encrypted, expiresIn });
}

/**
 * Stores the provider access token (and refresh token, when the provider
 * returns one) for the user. Never throws — token persistence must not
 * break the login flow.
 *
 * @param {string} userId
 * @param {object} tokenset - openid-client token endpoint response
 */
async function storeOpenIdTokens(userId, tokenset) {
  if (!tokenset?.access_token) {
    return;
  }
  try {
    await upsertToken({
      userId,
      type: ACCESS_TYPE,
      identifier: accessIdentifier(userId),
      token: tokenset.access_token,
      expiresIn: accessTokenExpiresIn(tokenset),
    });
    if (tokenset.refresh_token) {
      await upsertToken({
        userId,
        type: REFRESH_TYPE,
        identifier: refreshIdentifier(userId),
        token: tokenset.refresh_token,
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      });
    }
  } catch (error) {
    logger.error('[OpenIdTokenService] Failed to store OpenID tokens:', error);
  }
}

/**
 * Returns a currently valid provider access token for the user, refreshing
 * it via the OpenID refresh-token grant when the stored one has expired.
 *
 * @param {string} userId
 * @returns {Promise<{ access_token: string, expires_at: string } | null>}
 */
async function getValidOpenIdAccessToken(userId) {
  const tokenData = await findToken({
    userId,
    type: ACCESS_TYPE,
    identifier: accessIdentifier(userId),
  });

  if (tokenData && tokenData.expiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS) {
    return {
      access_token: await decryptV2(tokenData.token),
      expires_at: tokenData.expiresAt.toISOString(),
    };
  }

  const refreshData = await findToken({
    userId,
    type: REFRESH_TYPE,
    identifier: refreshIdentifier(userId),
  });
  if (!refreshData) {
    return null;
  }

  try {
    const refreshToken = await decryptV2(refreshData.token);
    const refreshParams = process.env.OPENID_SCOPE ? { scope: process.env.OPENID_SCOPE } : {};
    const tokenset = await openIdClient.refreshTokenGrant(
      getOpenIdConfig(),
      refreshToken,
      refreshParams,
    );
    await storeOpenIdTokens(userId, tokenset);
    return {
      access_token: tokenset.access_token,
      expires_at: new Date(Date.now() + accessTokenExpiresIn(tokenset) * 1000).toISOString(),
    };
  } catch (error) {
    logger.error('[OpenIdTokenService] OpenID refresh-token grant failed:', error);
    return null;
  }
}

module.exports = {
  storeOpenIdTokens,
  getValidOpenIdAccessToken,
};
