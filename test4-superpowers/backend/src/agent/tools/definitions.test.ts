import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS, TOOL_NAMES } from "./definitions.js";

describe("TOOL_DEFINITIONS", () => {
  it("exposes 11 tools with the expected names", () => {
    expect(TOOL_DEFINITIONS.length).toBe(11);
    expect(new Set(TOOL_NAMES)).toEqual(
      new Set([
        "searchClaims",
        "getClaim",
        "getSource",
        "getConcept",
        "getContradictions",
        "listTags",
        "getRecentLog",
        "addClaim",
        "tagClaim",
        "addRelation",
        "triggerCompilation"
      ])
    );
  });

  it("every tool has a name, description, and input_schema with type=object", () => {
    for (const t of TOOL_DEFINITIONS) {
      expect(t.name).toBeTypeOf("string");
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.input_schema.type).toBe("object");
      expect(t.input_schema.properties).toBeTypeOf("object");
    }
  });
});
