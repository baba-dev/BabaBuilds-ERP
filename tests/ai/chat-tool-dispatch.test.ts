import { describe, expect, it } from 'vitest';
import {
  TOOL_EXECUTION_KIND,
  TOOL_NAMES,
  ToolPolicyError,
  isKnownTool,
  isMutatingTool,
  isReadTool,
  parseToolArguments,
} from '@/lib/ai/chat/tool-policy';

describe('AI chat tool dispatch allowlist (PRA-002)', () => {
  it('classifies every advertised tool exactly once, and nothing else', () => {
    expect(Object.keys(TOOL_EXECUTION_KIND).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it('routes each tool to exactly one execution path', () => {
    for (const name of TOOL_NAMES) {
      const kinds = [isReadTool(name), isMutatingTool(name), TOOL_EXECUTION_KIND[name] === 'inline'];
      expect(kinds.filter(Boolean)).toHaveLength(1);
    }
  });

  it('keeps every mutation behind the confirmation path and no read tool mutating', () => {
    const mutations = TOOL_NAMES.filter((n) => TOOL_EXECUTION_KIND[n] === 'mutation');
    expect(mutations.length).toBeGreaterThan(0);
    for (const name of mutations) expect(isMutatingTool(name)).toBe(true);
    for (const name of TOOL_NAMES.filter((n) => isReadTool(n))) expect(isMutatingTool(name)).toBe(false);
  });

  it('rejects unsupported tool names with a ToolPolicyError instead of executing', () => {
    for (const name of ['drop_database', '__proto__', 'constructor', 'toString', '']) {
      expect(isKnownTool(name)).toBe(false);
      expect(isReadTool(name)).toBe(false);
      expect(isMutatingTool(name)).toBe(false);
      expect(() => parseToolArguments(name, {})).toThrow(ToolPolicyError);
    }
  });
});
