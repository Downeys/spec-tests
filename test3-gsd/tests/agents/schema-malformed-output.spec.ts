// tests/agents/schema-malformed-output.spec.ts
// Wave 0 probe — VALIDATION row AGENT-02 (D-04 strict-output contract).
// Tests the schema-layer guarantee that ResearchOutputSchema rejects malformed sub-agent
// output and surfaces a structured error naming the failed Zod path. The SDK's retry-once
// wiring is a separate concern verified in plan 02-05 (full coordinator integration).
import { describe, it, expect } from 'vitest';
import { ResearchOutputSchema } from '@/onebrain/types';
import {
  VALID_RESEARCH_OUTPUT,
  MALFORMED_RESEARCH_OUTPUT_NULL_CLAIMS,
  MALFORMED_RESEARCH_OUTPUT_BAD_SHAPE,
} from '../fixtures/sub-agent-stubs.js';

describe('ResearchOutputSchema strict parse (AGENT-02 / D-04)', () => {
  it('accepts a schema-conformant output', () => {
    const result = ResearchOutputSchema.safeParse(VALID_RESEARCH_OUTPUT);
    expect(result.success).toBe(true);
  });

  it('rejects null claim_ids_written and surfaces the failed Zod path', () => {
    const result = ResearchOutputSchema.safeParse(
      MALFORMED_RESEARCH_OUTPUT_NULL_CLAIMS,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      // Zod's error issues array contains the failed path
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('claim_ids_written');
    }
  });

  it('rejects missing proposed_tags and surfaces the failed Zod path', () => {
    const result = ResearchOutputSchema.safeParse(
      MALFORMED_RESEARCH_OUTPUT_BAD_SHAPE,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('proposed_tags');
    }
  });

  it('rejects claim_ids_written exceeding the D-01 cap of 10', () => {
    const tooMany = {
      ...VALID_RESEARCH_OUTPUT,
      claim_ids_written: Array.from(
        { length: 11 },
        (_, i) => `01J9X${String(i).padStart(21, '0')}`,
      ),
    };
    const result = ResearchOutputSchema.safeParse(tooMany);
    expect(result.success).toBe(false);
  });

  it('rejects summary exceeding the 900-char (~150 word) cap', () => {
    const tooLong = { ...VALID_RESEARCH_OUTPUT, summary: 'x'.repeat(901) };
    const result = ResearchOutputSchema.safeParse(tooLong);
    expect(result.success).toBe(false);
  });
});
