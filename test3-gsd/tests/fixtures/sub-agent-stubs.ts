// tests/fixtures/sub-agent-stubs.ts
// Schema-conformant + malformed ResearchOutput JSON blobs.
// Consumed by tests/agents/schema-malformed-output.spec.ts.
// (Distinct from tests/setup/voyage-mock.ts — that one is a vi.mock setup file;
// this is a fixture-data export. Same module-shape principle.)

export const VALID_RESEARCH_OUTPUT = {
  summary: 'Acme charges $99/mo per seat. Enterprise tier negotiable.',
  claim_ids_written: [
    '01J9X0000000000000000000A1',
    '01J9X0000000000000000000A2',
  ],
  notable_contradictions: [],
  proposed_tags: { topic: ['pricing'], framework: [] },
} as const;

// Malformed: claim_ids_written is null (Zod expects array)
export const MALFORMED_RESEARCH_OUTPUT_NULL_CLAIMS = {
  summary: '...',
  claim_ids_written: null,
  notable_contradictions: [],
  proposed_tags: { topic: [], framework: [] },
} as const;

// Malformed: missing required field proposed_tags
export const MALFORMED_RESEARCH_OUTPUT_BAD_SHAPE = {
  summary: '...',
  claim_ids_written: [],
  notable_contradictions: [],
} as const;
