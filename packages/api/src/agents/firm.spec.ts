import { getFirmName, parseFirmDomainMap, replaceFirmVar } from './firm';

const env = {
  FIRM_NAME_DEFAULT: 'D. L. & F. de Saram',
  FIRM_NAME_BY_EMAIL_DOMAIN:
    'corporateadvisory.lk=Corporate Advisory Services (Private) Limited; desaram.com=D. L. & F. de Saram',
} as NodeJS.ProcessEnv;

describe('parseFirmDomainMap', () => {
  it('parses entries, trimming whitespace and lowercasing domains', () => {
    const map = parseFirmDomainMap(' Foo.LK = Foo Ltd ;bar.com=Bar=Baz;bad;=x;y=');
    expect(map.get('foo.lk')).toBe('Foo Ltd');
    expect(map.get('bar.com')).toBe('Bar=Baz');
    expect(map.size).toBe(2);
  });

  it('returns an empty map for undefined input', () => {
    expect(parseFirmDomainMap(undefined).size).toBe(0);
  });
});

describe('getFirmName', () => {
  it('maps a known email domain case-insensitively', () => {
    expect(getFirmName('anupama@CorporateAdvisory.lk', env)).toBe(
      'Corporate Advisory Services (Private) Limited',
    );
  });

  it('falls back to the default for unknown domains or missing email', () => {
    expect(getFirmName('someone@gmail.com', env)).toBe('D. L. & F. de Saram');
    expect(getFirmName(undefined, env)).toBe('D. L. & F. de Saram');
  });

  it('returns an empty string when nothing is configured', () => {
    expect(getFirmName('someone@gmail.com', {} as NodeJS.ProcessEnv)).toBe('');
  });
});

describe('replaceFirmVar', () => {
  it('replaces every occurrence of {{current_firm}}', () => {
    expect(replaceFirmVar('{{current_firm}} / {{CURRENT_FIRM}}', 'a@corporateadvisory.lk', env)).toBe(
      'Corporate Advisory Services (Private) Limited / Corporate Advisory Services (Private) Limited',
    );
  });

  it('leaves text untouched when no firm resolves', () => {
    expect(replaceFirmVar('for {{current_firm}}', 'a@x.com', {} as NodeJS.ProcessEnv)).toBe(
      'for {{current_firm}}',
    );
  });

  it('leaves text without the variable untouched', () => {
    expect(replaceFirmVar('plain text', 'a@corporateadvisory.lk', env)).toBe('plain text');
  });
});
