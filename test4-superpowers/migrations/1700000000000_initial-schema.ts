import type { MigrationBuilder } from "node-pg-migrate";

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  // sources
  pgm.createTable("sources", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    type: { type: "text", notNull: true },
    url: { type: "text" },
    title: { type: "text", notNull: true },
    author: { type: "text" },
    published_at: { type: "timestamptz" },
    content: { type: "text" },
    content_hash: { type: "text" },
    ingested_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    ingested_by: { type: "text" },
    metadata: { type: "jsonb" }
  });
  pgm.createIndex("sources", "ingested_at");
  pgm.createIndex("sources", "content_hash");

  // claims
  pgm.createTable("claims", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    statement: { type: "text", notNull: true },
    type: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "open" },
    confidence: { type: "integer" },
    source_id: { type: "uuid", references: "sources(id)", onDelete: "SET NULL" },
    source_excerpt: { type: "text" },
    source_locator: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    created_by: { type: "text" },
    status_changed_at: { type: "timestamptz" },
    status_reason: { type: "text" },
    metadata: { type: "jsonb" }
  });
  pgm.addConstraint("claims", "claims_status_chk", {
    check: "status IN ('open','validated','refuted','superseded','retired')"
  });
  pgm.addConstraint("claims", "claims_type_chk", {
    check: "type IN ('finding','hypothesis','decision','observation','estimate')"
  });
  pgm.createIndex("claims", "status");
  pgm.createIndex("claims", "type");
  pgm.createIndex("claims", "source_id");
  pgm.createIndex("claims", "created_at");

  // relations
  pgm.createTable("relations", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    from_claim: { type: "uuid", notNull: true, references: "claims(id)", onDelete: "CASCADE" },
    to_claim: { type: "uuid", notNull: true, references: "claims(id)", onDelete: "CASCADE" },
    type: { type: "text", notNull: true },
    note: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    created_by: { type: "text" }
  });
  pgm.addConstraint("relations", "relations_no_self_loop", {
    check: "from_claim <> to_claim"
  });
  pgm.addConstraint("relations", "relations_type_chk", {
    check: "type IN ('supports','contradicts','refines','supersedes','related_to')"
  });
  pgm.addConstraint("relations", "relations_unique_edge", {
    unique: ["from_claim", "to_claim", "type"]
  });
  pgm.createIndex("relations", "from_claim");
  pgm.createIndex("relations", "to_claim");
  pgm.createIndex("relations", "type");

  // tags
  pgm.createTable("tags", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    slug: { type: "text", notNull: true, unique: true },
    display: { type: "text", notNull: true },
    description: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });
  pgm.createIndex("tags", "slug");

  // claim_tags
  pgm.createTable("claim_tags", {
    claim_id: { type: "uuid", notNull: true, references: "claims(id)", onDelete: "CASCADE" },
    tag_id: { type: "uuid", notNull: true, references: "tags(id)", onDelete: "CASCADE" }
  });
  pgm.addConstraint("claim_tags", "claim_tags_pk", { primaryKey: ["claim_id", "tag_id"] });

  // compilation_runs
  pgm.createTable("compilation_runs", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    trigger: { type: "text", notNull: true },
    started_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    finished_at: { type: "timestamptz" },
    status: { type: "text", notNull: true, default: "running" },
    pages_written: { type: "integer", default: 0 },
    pages_skipped: { type: "integer", default: 0 },
    notes: { type: "text" },
    error_message: { type: "text" }
  });
  pgm.addConstraint("compilation_runs", "compilation_runs_trigger_chk", {
    check: "trigger IN ('cli','api','cron')"
  });
  pgm.addConstraint("compilation_runs", "compilation_runs_status_chk", {
    check: "status IN ('running','success','error')"
  });
  pgm.createIndex("compilation_runs", "started_at");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("compilation_runs");
  pgm.dropTable("claim_tags");
  pgm.dropTable("tags");
  pgm.dropTable("relations");
  pgm.dropTable("claims");
  pgm.dropTable("sources");
}
