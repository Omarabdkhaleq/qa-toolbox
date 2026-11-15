// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CSP_DIRECTIVES, metaCsp } from './csp';

const directives = (csp: string) =>
  new Set(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean),
  );

describe('CSP', () => {
  it('matches the nginx header exactly (no drift between Docker and Pages)', () => {
    const conf = readFileSync(
      fileURLToPath(new URL('../docker/security-headers.conf', import.meta.url)),
      'utf8',
    );
    const header = /Content-Security-Policy "([^"]+)"/.exec(conf)?.[1];
    expect(header).toBeDefined();
    expect(directives(header!)).toEqual(new Set(CSP_DIRECTIVES));
  });

  it('drops frame-ancestors for the meta tag, which browsers ignore there', () => {
    expect(metaCsp()).not.toContain('frame-ancestors');
    expect(metaCsp()).toContain("connect-src 'self'");
  });
});
