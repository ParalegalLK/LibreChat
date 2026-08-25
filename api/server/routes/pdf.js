const express = require('express');
const { get } = require('lodash');
const { logger } = require('@librechat/data-schemas');
const jwtDecode = require('jsonwebtoken/decode');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();

const S3_URL_PATTERN = /^https:\/\/paralegal-(prod|decisions)\.s3(\.[a-z0-9-]+)?\.amazonaws\.com\//;
const READER_URL_PREFIX = 'https://reader.paralegal.lk/?file=';
const DEFAULT_PDF_GENERATOR_URL = 'https://www.dev.paralegal.lk/api/pdf/get-pdf-url';
/** Refresh the cached service token this long before it actually expires. */
const SERVICE_TOKEN_SKEW_MS = 30 * 1000;
/** Lifetime to assume when the token endpoint omits `expires_in`. */
const SERVICE_TOKEN_DEFAULT_TTL_SECONDS = 300;

const getGeneratorUrl = () =>
  process.env.PDF_GENERATOR_URL ||
  `${process.env.PDF_GENERATOR_BASE_URL || 'https://www.dev.paralegal.lk'}/api/pdf/get-pdf-url`;

const normalizePdfLink = (link) => {
  if (typeof link !== 'string') {
    return '';
  }

  const trimmed = link.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith(READER_URL_PREFIX)) {
    return trimmed.replace(READER_URL_PREFIX, '');
  }

  return trimmed;
};

const isAllowedPdfLink = (link) => {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && S3_URL_PATTERN.test(url.toString());
  } catch {
    return false;
  }
};

/**
 * Asgardeo access token belonging to the signed-in user. Only present when the
 * session was established through the OpenID login (not email + password).
 */
const getUserAsgardeoAccessToken = (req) =>
  req.user?.federatedTokens?.access_token ||
  req.session?.openidTokens?.accessToken ||
  req.cookies?.openid_access_token ||
  '';

let serviceTokenCache = { token: '', expiresAt: 0 };

const clearServiceTokenCache = () => {
  serviceTokenCache = { token: '', expiresAt: 0 };
};

const resolveTokenEndpoint = async () => {
  if (process.env.PDF_GENERATOR_TOKEN_URL) {
    return process.env.PDF_GENERATOR_TOKEN_URL;
  }

  const issuer = process.env.OPENID_ISSUER;
  if (!issuer) {
    return '';
  }

  // Asgardeo's issuer *is* its token endpoint (…/oauth2/token).
  if (/\/oauth2\/token\/?$/.test(issuer)) {
    return issuer;
  }

  const discoveryUrl = new URL(
    '.well-known/openid-configuration',
    issuer.endsWith('/') ? issuer : `${issuer}/`,
  );
  const response = await fetch(discoveryUrl);
  const config = await response.json().catch(() => ({}));
  return config?.token_endpoint || '';
};

/**
 * Service-level credential used when the user has no Asgardeo token of their own
 * (email + password sign-ins, break-glass admin, etc.). Resolution order:
 *   1. `PDF_GENERATOR_SERVICE_TOKEN` (static bearer token)
 *   2. OAuth2 client-credentials grant against Asgardeo, using
 *      `PDF_GENERATOR_CLIENT_ID/SECRET` or falling back to `OPENID_CLIENT_ID/SECRET`
 * Returns '' when nothing is configured or the grant fails; the request is still
 * forwarded to the generator without an Authorization header.
 */
const getServiceAccessToken = async () => {
  if (process.env.PDF_GENERATOR_SERVICE_TOKEN) {
    return process.env.PDF_GENERATOR_SERVICE_TOKEN;
  }

  const clientId = process.env.PDF_GENERATOR_CLIENT_ID || process.env.OPENID_CLIENT_ID;
  const clientSecret = process.env.PDF_GENERATOR_CLIENT_SECRET || process.env.OPENID_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return '';
  }

  if (serviceTokenCache.token && serviceTokenCache.expiresAt > Date.now()) {
    return serviceTokenCache.token;
  }

  try {
    const tokenEndpoint = await resolveTokenEndpoint();
    if (!tokenEndpoint) {
      logger.warn('[pdf.open] No token endpoint available for service credentials');
      return '';
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });
    if (process.env.PDF_GENERATOR_SERVICE_SCOPE) {
      body.set('scope', process.env.PDF_GENERATOR_SERVICE_SCOPE);
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.access_token) {
      logger.warn('[pdf.open] Service credential token request failed', {
        status: response.status,
        error: data?.error || data?.error_description,
      });
      return '';
    }

    const ttlSeconds = Number(data.expires_in) || SERVICE_TOKEN_DEFAULT_TTL_SECONDS;
    serviceTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + ttlSeconds * 1000 - SERVICE_TOKEN_SKEW_MS,
    };
    return serviceTokenCache.token;
  } catch (error) {
    logger.warn('[pdf.open] Error requesting service credential token', {
      error: error?.message,
    });
    return '';
  }
};

/**
 * Picks the bearer token to present to the generator.
 * @returns {Promise<{ token: string, source: 'user' | 'service' | 'none' }>}
 */
const resolveGeneratorAccessToken = async (req) => {
  const userToken = getUserAsgardeoAccessToken(req);
  if (userToken) {
    return { token: userToken, source: 'user' };
  }

  const serviceToken = await getServiceAccessToken();
  if (serviceToken) {
    return { token: serviceToken, source: 'service' };
  }

  return { token: '', source: 'none' };
};

const splitList = (value = '') =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const getRoleValues = (roles) => {
  if (Array.isArray(roles)) {
    return roles;
  }

  if (typeof roles === 'string') {
    return roles.split(/[\s,]+/).filter(Boolean);
  }

  return [];
};

const getOpenIdRoleToken = (req) => {
  const requiredRoleTokenKind = process.env.OPENID_REQUIRED_ROLE_TOKEN_KIND || 'id';

  if (requiredRoleTokenKind === 'access') {
    return req.session?.openidTokens?.accessToken || req.cookies?.openid_access_token || '';
  }

  return req.session?.openidTokens?.idToken || req.cookies?.openid_id_token || '';
};

/**
 * Re-checks the Asgardeo group claim for SSO sessions. Users who signed in with
 * email + password have no Asgardeo claims to check; they are governed by
 * `requireJwtAuth` and the local allowlist instead.
 */
const checkAsgardeoGroupAccess = (req) => {
  const requiredRoles = splitList(process.env.OPENID_REQUIRED_ROLE || '');

  if (requiredRoles.length === 0) {
    return { allowed: true, source: 'not_configured' };
  }

  if (req.user?.provider !== 'openid') {
    return { allowed: true, source: 'local_login', requiredRoles };
  }

  const token = getOpenIdRoleToken(req);

  if (!token) {
    return { allowed: true, source: 'openid_login_gate', requiredRoles };
  }

  const requiredRoleParameterPath = process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH || 'groups';
  const decodedToken = jwtDecode(token);
  const roles = get(decodedToken, requiredRoleParameterPath);
  const roleValues = getRoleValues(roles);

  return {
    allowed: requiredRoles.some((role) => roleValues.includes(role)),
    source: 'token_claim',
    requiredRoles,
  };
};

const isUserAllowedByLocalAllowlist = (user) => {
  const allowedRoles = splitList(process.env.PDF_ACCESS_ALLOWED_ROLES || '');
  const allowedEmails = splitList(process.env.PDF_ACCESS_ALLOWED_EMAILS || '').map((email) =>
    email.toLowerCase(),
  );

  if (allowedRoles.length === 0 && allowedEmails.length === 0) {
    return true;
  }

  const roleAllowed = user?.role && allowedRoles.includes(user.role);
  const emailAllowed = user?.email && allowedEmails.includes(user.email.toLowerCase());
  return Boolean(roleAllowed || emailAllowed);
};

router.use(requireJwtAuth);

router.post('/open', async (req, res) => {
  const link = normalizePdfLink(req.body?.link);
  const asgardeoAccess = checkAsgardeoGroupAccess(req);

  if (!asgardeoAccess.allowed) {
    logger.warn('[pdf.open] PDF access denied by Asgardeo group gate', {
      user: req.user?.email,
      userId: req.user?.id || req.user?._id?.toString(),
      provider: req.user?.provider,
      requiredRoles: asgardeoAccess.requiredRoles,
      source: asgardeoAccess.source,
    });
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  if (!isUserAllowedByLocalAllowlist(req.user)) {
    logger.warn('[pdf.open] PDF access denied by local allowlist', {
      user: req.user?.email,
      userId: req.user?.id || req.user?._id?.toString(),
    });
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  if (!link || !isAllowedPdfLink(link)) {
    logger.warn('[pdf.open] Invalid PDF link requested', {
      user: req.user?.email,
      userId: req.user?.id || req.user?._id?.toString(),
    });
    return res.status(404).json({ success: false, message: 'PDF link not found' });
  }

  const generatorUrl = getGeneratorUrl() || DEFAULT_PDF_GENERATOR_URL;
  const { token: accessToken, source: tokenSource } = await resolveGeneratorAccessToken(req);

  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    logger.info('[pdf.open] Requesting presigned PDF URL', {
      user: req.user?.email,
      userId: req.user?.id || req.user?._id?.toString(),
      provider: req.user?.provider,
      generatorUrl,
      tokenSource,
    });

    const response = await fetch(generatorUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ link }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.success || !data?.presigned_url) {
      const isAuthFailure = response.status === 401 || response.status === 403;
      if (isAuthFailure && tokenSource === 'service') {
        // Token was rejected upstream; don't keep serving it from cache.
        clearServiceTokenCache();
      }

      logger.error('[pdf.open] PDF generator failed', {
        user: req.user?.email,
        userId: req.user?.id || req.user?._id?.toString(),
        status: response.status,
        tokenSource,
        generatorSuccess: data?.success,
        generatorError: data?.error || data?.message,
      });
      return res.status(isAuthFailure ? response.status : 502).json({
        success: false,
        message: 'Failed to generate PDF link',
      });
    }

    return res.json({
      success: true,
      presigned_url: data.presigned_url,
      expires_in_seconds: data.expires_in_seconds,
    });
  } catch (error) {
    logger.error('[pdf.open] Error requesting presigned PDF URL', {
      user: req.user?.email,
      userId: req.user?.id || req.user?._id?.toString(),
      error: error?.message,
    });
    return res.status(502).json({
      success: false,
      message: 'Failed to generate PDF link',
    });
  }
});

module.exports = router;
