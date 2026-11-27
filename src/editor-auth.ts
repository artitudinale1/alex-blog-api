import { createHmac, timingSafeEqual } from 'node:crypto';

export const EDITOR_TOKEN_TTL_SECONDS = 5 * 60;
const CLOCK_SKEW_SECONDS = 30;
const MIN_SECRET_LENGTH = 32;

export interface EditorIdentity {
  githubId: string;
}

export interface EditorAuthConfig {
  secret: string | null;
  adminGithubIds: ReadonlySet<string>;
}

export type AuthFailure = 'invalid' | 'forbidden' | 'unconfigured';

export interface EditorAuthState {
  editor: EditorIdentity | null;
  authFailure: AuthFailure | null;
}

export interface AppContext extends EditorAuthState {
  agent: boolean;
  agentFailure: AuthFailure | null;
}

export function readEditorAuthConfig(env: NodeJS.ProcessEnv): EditorAuthConfig {
  const secret = env.EDITOR_AUTH_SECRET?.trim() ?? '';
  const adminGithubIds = new Set(
    (env.ADMIN_GITHUB_IDS ?? '').split(',').map((id) => id.trim()).filter((id) => /^[0-9]+$/.test(id)),
  );
  return { secret: secret.length >= MIN_SECRET_LENGTH ? secret : null, adminGithubIds };
}

export function signEditorToken(secret: string, githubId: string, now = Date.now()): string {
  if (!/^[0-9]+$/.test(githubId)) throw new Error('githubId must be the numeric GitHub user id');
  const iat = Math.floor(now / 1000);
  const exp = iat + EDITOR_TOKEN_TTL_SECONDS;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: githubId, iat, exp })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

export function verifyEditorToken(secret: string, token: string, now = Date.now()): EditorIdentity | null {
  if (secret.length < MIN_SECRET_LENGTH || token.length === 0 || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signature] = parts;
  const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest('base64url');
  if (!safeEqual(expected, signature)) return null;
  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: unknown };
    if (header.alg !== 'HS256') return null;
    const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as {
      sub?: unknown;
      iat?: unknown;
      exp?: unknown;
    };
    if (typeof claims.sub !== 'string' || !/^[0-9]+$/.test(claims.sub)) return null;
    if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) return null;
    const iat = claims.iat as number;
    const exp = claims.exp as number;
    if (exp - iat <= 0 || exp - iat > EDITOR_TOKEN_TTL_SECONDS) return null;
    const nowSeconds = Math.floor(now / 1000);
    if (iat > nowSeconds + CLOCK_SKEW_SECONDS) return null;
    if (exp < nowSeconds - CLOCK_SKEW_SECONDS) return null;
    return { githubId: claims.sub };
  } catch {
    return null;
  }
}

export function resolveAuthorization(authorization: string | null, config: EditorAuthConfig, now = Date.now()): EditorAuthState {
  if (!authorization) return { editor: null, authFailure: null };
  if (!config.secret || config.adminGithubIds.size === 0) return { editor: null, authFailure: 'unconfigured' };
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (!match) return { editor: null, authFailure: 'invalid' };
  const editor = verifyEditorToken(config.secret, match[1], now);
  if (!editor) return { editor: null, authFailure: 'invalid' };
  if (!config.adminGithubIds.has(editor.githubId)) return { editor: null, authFailure: 'forbidden' };
  return { editor, authFailure: null };
}

function safeEqual(expected: string, received: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
