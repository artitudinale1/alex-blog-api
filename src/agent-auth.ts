import { createHash, timingSafeEqual } from 'node:crypto';
import type { AuthFailure } from './editor-auth.js';

const MIN_SECRET_LENGTH = 32;

export interface AgentAuthConfig {
  secret: string | null;
}

export function readAgentAuthConfig(env: NodeJS.ProcessEnv, editorSecret: string | null): AgentAuthConfig {
  const secret = env.AGENT_API_SECRET?.trim() ?? '';
  if (secret.length < MIN_SECRET_LENGTH || (editorSecret !== null && secret === editorSecret)) return { secret: null };
  return { secret };
}

export function resolveAgentAuthorization(header: string | null, config: AgentAuthConfig): { agent: boolean; agentFailure: AuthFailure | null } {
  if (!header) return { agent: false, agentFailure: null };
  if (!config.secret) return { agent: false, agentFailure: 'unconfigured' };
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match || !sameSecret(config.secret, match[1])) return { agent: false, agentFailure: 'invalid' };
  return { agent: true, agentFailure: null };
}

function sameSecret(expected: string, received: string): boolean {
  const left = createHash('sha256').update(expected).digest();
  const right = createHash('sha256').update(received).digest();
  return timingSafeEqual(left, right);
}
