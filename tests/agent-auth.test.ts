import { describe, expect, it } from 'vitest';
import { readAgentAuthConfig, resolveAgentAuthorization } from '../src/agent-auth.js';
import { resolveAuthorization, signEditorToken } from '../src/editor-auth.js';

const agentSecret = 'agent-secret-0123456789abcdef0123456789';
const editorSecret = 'editor-secret-0123456789abcdef012345';

describe('agent credentials', () => {
  it('rejects a missing, short, or editor-reused secret', () => {
    expect(readAgentAuthConfig({}, null)).toEqual({ secret: null });
    expect(readAgentAuthConfig({ AGENT_API_SECRET: 'too-short' }, null)).toEqual({ secret: null });
    expect(readAgentAuthConfig({ AGENT_API_SECRET: editorSecret }, editorSecret)).toEqual({ secret: null });
    expect(readAgentAuthConfig({ AGENT_API_SECRET: agentSecret }, editorSecret).secret).toBe(agentSecret);
  });

  it('accepts only the agent bearer secret', () => {
    const config = { secret: agentSecret };
    expect(resolveAgentAuthorization(null, config)).toEqual({ agent: false, agentFailure: null });
    expect(resolveAgentAuthorization(`Bearer ${agentSecret}`, config)).toEqual({ agent: true, agentFailure: null });
    expect(resolveAgentAuthorization('Bearer wrong-secret-0123456789abcdef0123', config).agentFailure).toBe('invalid');
    expect(resolveAgentAuthorization(`Bearer ${signEditorToken(editorSecret, '12345')}`, config).agentFailure).toBe('invalid');
    expect(resolveAgentAuthorization('Basic ' + agentSecret, config).agentFailure).toBe('invalid');
    expect(resolveAgentAuthorization(`Bearer ${agentSecret}`, { secret: null }).agentFailure).toBe('unconfigured');
  });

  it('does not accept the agent secret as an editor token', () => {
    const editor = resolveAuthorization(`Bearer ${agentSecret}`, { secret: editorSecret, adminGithubIds: new Set(['12345']) });
    expect(editor.editor).toBeNull();
    expect(editor.authFailure).toBe('invalid');
  });
});
