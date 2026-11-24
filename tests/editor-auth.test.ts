import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EDITOR_TOKEN_TTL_SECONDS,
  readEditorAuthConfig,
  resolveAuthorization,
  signEditorToken,
  verifyEditorToken,
} from '../src/editor-auth.js';

const secret = '0123456789abcdef0123456789abcdef';
const now = Date.parse('2026-11-24T10:00:00Z');

function signed(claims: Record<string, unknown>, key = secret, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }): string {
  const headerPart = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadPart = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = createHmac('sha256', key).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

describe('editor tokens', () => {
  it('accepts a token signed for a numeric GitHub id', () => {
    const token = signEditorToken(secret, '12345', now);
    expect(verifyEditorToken(secret, token, now)).toEqual({ githubId: '12345' });
  });

  it('rejects a login, a bad signature, the wrong secret, expiry, and an over-long lifetime', () => {
    const iat = Math.floor(now / 1000);
    expect(() => signEditorToken(secret, 'artitudinale1', now)).toThrow(/numeric/);
    expect(verifyEditorToken(secret, signed({ sub: 'artitudinale1', iat, exp: iat + 60 }), now)).toBeNull();
    const token = signEditorToken(secret, '12345', now);
    expect(verifyEditorToken('abcdefghijklmnopqrstuvwxyz012345', token, now)).toBeNull();
    expect(verifyEditorToken(secret, `${token}x`, now)).toBeNull();
    expect(verifyEditorToken(secret, token, now + (EDITOR_TOKEN_TTL_SECONDS + 31) * 1000)).toBeNull();
    expect(verifyEditorToken(secret, signed({ sub: '12345', iat, exp: iat + EDITOR_TOKEN_TTL_SECONDS + 1 }), now)).toBeNull();
    expect(verifyEditorToken(secret, signed({ sub: '12345', iat, exp: iat + 60 }, secret, { alg: 'none', typ: 'JWT' }), now)).toBeNull();
  });

  it('keeps logins and short secrets out of the server config', () => {
    const config = readEditorAuthConfig({
      EDITOR_AUTH_SECRET: 'too-short',
      ADMIN_GITHUB_IDS: 'artitudinale1, 12345, ',
    });
    expect(config.secret).toBeNull();
    expect([...config.adminGithubIds]).toEqual(['12345']);
    const configured = readEditorAuthConfig({ EDITOR_AUTH_SECRET: secret, ADMIN_GITHUB_IDS: '12345' });
    expect(resolveAuthorization(null, configured, now)).toEqual({ editor: null, authFailure: null });
    expect(resolveAuthorization('Bearer not-a-token', configured, now).authFailure).toBe('invalid');
    expect(resolveAuthorization(`Bearer ${signEditorToken(secret, '999', now)}`, configured, now).authFailure).toBe('forbidden');
    expect(resolveAuthorization(`Bearer ${signEditorToken(secret, '12345', now)}`, configured, now)).toEqual({
      editor: { githubId: '12345' },
      authFailure: null,
    });
    expect(resolveAuthorization('Bearer anything', { secret: null, adminGithubIds: new Set(['12345']) }, now).authFailure).toBe('unconfigured');
  });
});
