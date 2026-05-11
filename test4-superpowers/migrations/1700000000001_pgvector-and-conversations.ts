import type { MigrationBuilder } from "node-pg-migrate";

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // pgvector extension
  pgm.createExtension("vector", { ifNotExists: true });

  // Embeddings on claims (additive, nullable)
  pgm.addColumns("claims", {
    embedding: { type: "vector(1024)" },
    embedded_at: { type: "timestamptz" },
    embedding_model: { type: "text" }
  });

  // HNSW index for cosine similarity
  pgm.sql(
    `CREATE INDEX claims_embedding_hnsw_idx
       ON claims
       USING hnsw (embedding vector_cosine_ops)`
  );

  // Conversations
  pgm.createTable("conversations", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    started_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });

  // Messages
  pgm.createTable("messages", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    conversation_id: {
      type: "uuid",
      notNull: true,
      references: "conversations(id)",
      onDelete: "CASCADE"
    },
    role: { type: "text", notNull: true },
    content: { type: "jsonb", notNull: true },
    token_count: { type: "integer" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });
  pgm.createIndex("messages", ["conversation_id", "created_at"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("messages");
  pgm.dropTable("conversations");
  pgm.sql(`DROP INDEX IF EXISTS claims_embedding_hnsw_idx`);
  pgm.dropColumns("claims", ["embedding", "embedded_at", "embedding_model"]);
  pgm.dropExtension("vector", { ifExists: true });
}
