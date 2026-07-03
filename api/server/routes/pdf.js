const express = require('express');
const { get } = require('lodash');
const { logger } = require('@librechat/data-schemas');
const jwtDecode = require('jsonwebtoken/decode');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();

const S3_URL_PATTERN = /^https:\/\/paralegal-(prod|decisions)\.s3(\.[a-z0-9-]+)?\.amazonaws\.com\//;
const READER_URL_PREFIX = 'https://reader.paralegal.lk/?file=';
const DEFAULT_PDF_GENERATOR_URL = 'https://www.dev.paralegal.lk/api/pdf/get-pdf-url';

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

const getAsgardeoAccessToken = (req) =>
  req.user?.federatedTokens?.access_token ||
  req.session?.openidTokens?.accessToken ||
  req.cookies?.openid_access_token ||
  '';

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

const checkAsgardeoGroupAccess = (req) => {
  const requiredRoles = splitList(process.env.OPENID_REQUIRED_ROLE || '');

  if (requiredRoles.length === 0) {
    return { allowed: true, source: 'not_configured' };
  }

  if (req.user?.provider !== 'openid') {
    return { allowed: false, source: 'non_openid_user', requiredRoles };
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
  const asgardeoAccessToken = getAsgardeoAccessToken(req);

  if (!asgardeoAccessToken) {
    logger.warn('[pdf.open] Missing Asgardeo access token for PDF generator', {
      user: req.user?.email,
      userId: req.user?.id || req.user?._id?.toString(),
      provider: req.user?.provider,
    });
    return res.status(401).json({
      success: false,
      message: 'Asgardeo access token required',
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${asgardeoAccessToken}`,
  };

  try {
    logger.info('[pdf.open] Requesting presigned PDF URL', {
      user: req.user?.email,
      userId: req.user?.id || req.user?._id?.toString(),
      generatorUrl,
      hasAsgardeoAccessToken: Boolean(asgardeoAccessToken),
    });

    const response = await fetch(generatorUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ link }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.success || !data?.presigned_url) {
      logger.error('[pdf.open] PDF generator failed', {
        user: req.user?.email,
        userId: req.user?.id || req.user?._id?.toString(),
        status: response.status,
        generatorSuccess: data?.success,
        generatorError: data?.error || data?.message,
      });
      const status = response.status === 401 || response.status === 403 ? response.status : 502;
      return res.status(status).json({
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
