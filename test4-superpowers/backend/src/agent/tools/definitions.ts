export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "searchClaims",
    description:
      "Search OpenBrain claims by semantic similarity to a query, optionally filtered by tags, status, type, or source. Returns ranked claims with provenance.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language query" },
        topK: { type: "integer", default: 8, minimum: 1, maximum: 50 },
        filter: {
          type: "object",
          properties: {
            tags: { type: "array", items: { type: "string" } },
            status: {
              type: "array",
              items: {
                type: "string",
                enum: ["open", "validated", "refuted", "superseded", "retired"]
              }
            },
            type: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "finding",
                  "hypothesis",
                  "decision",
                  "observation",
                  "estimate"
                ]
              }
            },
            sourceId: { type: "string", format: "uuid" }
          }
        }
      },
      required: ["query"]
    }
  },
  {
    name: "getClaim",
    description:
      "Fetch a claim by id with full provenance: source meta, attached tags, and active inbound/outbound relations.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"]
    }
  },
  {
    name: "getSource",
    description:
      "Fetch a source by id including full extracted content. Use when you need the underlying article text, not just the citation.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"]
    }
  },
  {
    name: "getConcept",
    description:
      "Read the synthesized vault concept page for a tag slug. Returns the markdown content of vault/concepts/<slug>.md, or a clean 'not generated yet' result.",
    input_schema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          pattern: "^[a-z0-9][a-z0-9-]*$",
          description: "Lowercase, hyphenated"
        }
      },
      required: ["slug"]
    }
  },
  {
    name: "getContradictions",
    description:
      "List unresolved contradiction pairs (where both claims are still active).",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "listTags",
    description:
      "List every tag in OpenBrain with display name and current claim count.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "getRecentLog",
    description:
      "Fetch the most recent log events (compilation runs, claim creations, source ingestions).",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", default: 10, minimum: 1, maximum: 50 }
      }
    }
  },
  {
    name: "addClaim",
    description:
      "Create a new claim in OpenBrain with created_by='agent'. Use type='decision' when capturing an explicit user choice. Optionally attach tags inline.",
    input_schema: {
      type: "object",
      properties: {
        statement: { type: "string", minLength: 1 },
        type: {
          type: "string",
          enum: [
            "finding",
            "hypothesis",
            "decision",
            "observation",
            "estimate"
          ],
          default: "observation"
        },
        sourceId: { type: ["string", "null"], format: "uuid" },
        sourceExcerpt: { type: ["string", "null"] },
        sourceLocator: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["statement"]
    }
  },
  {
    name: "tagClaim",
    description:
      "Attach a tag to a claim. If the tag does not exist, it is created with metadata.created_in_chat=true. Idempotent — adding the same tag twice is a no-op.",
    input_schema: {
      type: "object",
      properties: {
        claimId: { type: "string", format: "uuid" },
        tagSlug: {
          type: "string",
          pattern: "^[a-z0-9][a-z0-9-]*$",
          description: "Lowercase, hyphenated"
        },
        displayHint: { type: "string" }
      },
      required: ["claimId", "tagSlug"]
    }
  },
  {
    name: "addRelation",
    description:
      "Create a relation between two claims. Allowed types: supports, contradicts, refines, related_to. The 'supersedes' type is reserved for status-promotion workflows and is not callable here.",
    input_schema: {
      type: "object",
      properties: {
        fromClaim: { type: "string", format: "uuid" },
        toClaim: { type: "string", format: "uuid" },
        type: {
          type: "string",
          enum: ["supports", "contradicts", "refines", "related_to"]
        },
        note: { type: ["string", "null"] }
      },
      required: ["fromClaim", "toClaim", "type"]
    }
  },
  {
    name: "triggerCompilation",
    description:
      "Run the compilation agent now. Regenerates the vault from current OpenBrain state. Returns a run summary with pages_written and pages_skipped.",
    input_schema: { type: "object", properties: {} }
  }
];

export const TOOL_NAMES: ReadonlyArray<string> = TOOL_DEFINITIONS.map((t) => t.name);
