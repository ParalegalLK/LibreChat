const express = require('express');
const request = require('supertest');

jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());

const S3_LINK = 'https://paralegal-prod.s3.ap-south-1.amazonaws.com/decisions/sample.pdf';
const GENERATOR_URL = 'https://generator.test/api/pdf/get-pdf-url';
const TOKEN_URL = 'https://api.asgardeo.io/t/paralegallk/oauth2/token';

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const ENV_KEYS = [
  'PDF_GENERATOR_URL',
  'PDF_GENERATOR_BASE_URL',
  'PDF_GENERATOR_TOKEN_URL',
  'PDF_GENERATOR_SERVICE_TOKEN',
  'PDF_GENERATOR_SERVICE_SCOPE',
  'PDF_GENERATOR_CLIENT_ID',
  'PDF_GENERATOR_CLIENT_SECRET',
  'PDF_ACCESS_ALLOWED_ROLES',
  'PDF_ACCESS_ALLOWED_EMAILS',
  'OPENID_ISSUER',
  'OPENID_CLIENT_ID',
  'OPENID_CLIENT_SECRET',
  'OPENID_REQUIRED_ROLE',
  'OPENID_REQUIRED_ROLE_TOKEN_KIND',
  'OPENID_REQUIRED_ROLE_PARAMETER_PATH',
];

describe('POST /api/pdf/open', () => {
  let originalEnv;
  let originalFetch;

  const buildApp = (user, extras = {}) => {
    // Fresh module each time so the service-token cache starts empty.
    jest.resetModules();
    const pdfRouter = require('../pdf');

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = user;
      req.cookies = extras.cookies || {};
      req.session = extras.session;
      next();
    });
    app.use('/api/pdf', pdfRouter);
    return app;
  };

  const generatorCalls = () => global.fetch.mock.calls.filter(([url]) => url === GENERATOR_URL);
  const tokenCalls = () => global.fetch.mock.calls.filter(([url]) => url === TOKEN_URL);

  beforeAll(() => {
    originalEnv = { ...process.env };
    originalFetch = global.fetch;
  });

  beforeEach(() => {
    ENV_KEYS.forEach((key) => delete process.env[key]);
    process.env.PDF_GENERATOR_URL = GENERATOR_URL;
    process.env.OPENID_ISSUER = TOKEN_URL;
    process.env.OPENID_REQUIRED_ROLE = 'chat-pro-users';
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('forwards the SSO user’s own Asgardeo token', async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        presigned_url: 'https://signed.example/1',
        expires_in_seconds: 60,
      }),
    );
    const app = buildApp({
      id: 'u1',
      provider: 'openid',
      federatedTokens: { access_token: 'user-token' },
    });

    const res = await request(app).post('/api/pdf/open').send({ link: S3_LINK });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      presigned_url: 'https://signed.example/1',
      expires_in_seconds: 60,
    });
    expect(tokenCalls()).toHaveLength(0);
    const [, options] = generatorCalls()[0];
    expect(options.headers.Authorization).toBe('Bearer user-token');
    expect(JSON.parse(options.body)).toEqual({ link: S3_LINK });
  });

  it('still reaches the generator for a local (password) user with no credentials configured', async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ success: true, presigned_url: 'https://signed.example/2' }),
    );
    const app = buildApp({ id: 'u2', provider: 'local', email: 'lawyer@example.com' });

    const res = await request(app).post('/api/pdf/open').send({ link: S3_LINK });

    expect(res.status).toBe(200);
    expect(res.body.presigned_url).toBe('https://signed.example/2');
    expect(generatorCalls()).toHaveLength(1);
    expect(generatorCalls()[0][1].headers.Authorization).toBeUndefined();
  });

  it('uses PDF_GENERATOR_SERVICE_TOKEN when the user has no Asgardeo token', async () => {
    process.env.PDF_GENERATOR_SERVICE_TOKEN = 'static-service-token';
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ success: true, presigned_url: 'https://signed.example/3' }),
    );
    // provider: openid but signed in via password → no token on the session
    const app = buildApp({ id: 'u3', provider: 'openid' });

    const res = await request(app).post('/api/pdf/open').send({ link: S3_LINK });

    expect(res.status).toBe(200);
    expect(tokenCalls()).toHaveLength(0);
    expect(generatorCalls()[0][1].headers.Authorization).toBe('Bearer static-service-token');
  });

  it('obtains and caches a client-credentials token from Asgardeo', async () => {
    process.env.OPENID_CLIENT_ID = 'client-id';
    process.env.OPENID_CLIENT_SECRET = 'client-secret';
    global.fetch.mockImplementation(async (url) => {
      if (url === TOKEN_URL) {
        return jsonResponse({ access_token: 'cc-token', expires_in: 3600 });
      }
      return jsonResponse({ success: true, presigned_url: 'https://signed.example/4' });
    });
    const app = buildApp({ id: 'u4', provider: 'local' });

    const first = await request(app).post('/api/pdf/open').send({ link: S3_LINK });
    const second = await request(app).post('/api/pdf/open').send({ link: S3_LINK });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(tokenCalls()).toHaveLength(1);
    const [, tokenOptions] = tokenCalls()[0];
    expect(tokenOptions.method).toBe('POST');
    expect(tokenOptions.body.get('grant_type')).toBe('client_credentials');
    expect(tokenOptions.body.get('client_id')).toBe('client-id');
    expect(generatorCalls()).toHaveLength(2);
    generatorCalls().forEach(([, options]) => {
      expect(options.headers.Authorization).toBe('Bearer cc-token');
    });
  });

  it('drops the cached service token when the generator rejects it', async () => {
    process.env.OPENID_CLIENT_ID = 'client-id';
    process.env.OPENID_CLIENT_SECRET = 'client-secret';
    let tokenRequests = 0;
    global.fetch.mockImplementation(async (url) => {
      if (url === TOKEN_URL) {
        tokenRequests += 1;
        return jsonResponse({ access_token: `cc-token-${tokenRequests}`, expires_in: 3600 });
      }
      return jsonResponse({ success: false, error: 'expired' }, 401);
    });
    const app = buildApp({ id: 'u5', provider: 'local' });

    const first = await request(app).post('/api/pdf/open').send({ link: S3_LINK });
    const second = await request(app).post('/api/pdf/open').send({ link: S3_LINK });

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(tokenCalls()).toHaveLength(2);
  });

  it('falls through to an unauthenticated request when the token grant fails', async () => {
    process.env.OPENID_CLIENT_ID = 'client-id';
    process.env.OPENID_CLIENT_SECRET = 'client-secret';
    global.fetch.mockImplementation(async (url) => {
      if (url === TOKEN_URL) {
        return jsonResponse({ error: 'unauthorized_client' }, 401);
      }
      return jsonResponse({ success: true, presigned_url: 'https://signed.example/6' });
    });
    const app = buildApp({ id: 'u6', provider: 'local' });

    const res = await request(app).post('/api/pdf/open').send({ link: S3_LINK });

    expect(res.status).toBe(200);
    expect(generatorCalls()).toHaveLength(1);
    expect(generatorCalls()[0][1].headers.Authorization).toBeUndefined();
  });

  it('still enforces the Asgardeo group claim for SSO sessions', async () => {
    // header.payload.signature with payload {"groups":["other-group"]}
    const payload = Buffer.from(JSON.stringify({ groups: ['other-group'] })).toString('base64url');
    const idToken = `eyJhbGciOiJub25lIn0.${payload}.sig`;
    const app = buildApp(
      { id: 'u7', provider: 'openid' },
      { session: { openidTokens: { idToken, accessToken: 'user-token' } } },
    );

    const res = await request(app).post('/api/pdf/open').send({ link: S3_LINK });

    expect(res.status).toBe(403);
    expect(generatorCalls()).toHaveLength(0);
  });

  it('rejects links outside the paralegal S3 buckets', async () => {
    const app = buildApp({ id: 'u8', provider: 'local' });

    const res = await request(app)
      .post('/api/pdf/open')
      .send({ link: 'https://evil.example/file.pdf' });

    expect(res.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
