# Source content stored in Postgres `bytea`, not the filesystem

Full-tier **Sources** (`status='full'` per [ADR-0008](0008-source-ingestion-two-tier.md)) hold the verbatim source bytes — typically PDFs, pasted text, structured datasets — that **Citation** `span_hash` is computed over. We store those bytes in a `content_bytes BYTEA` column on the `sources` table rather than splitting blob storage to the filesystem with a `content_path` reference. At personal-use scale (one business plan: hundreds of sources, total ≲ a few GB), the operational simplicity of one-file-backups and transactional row+blob writes outweighs the dump-time cost.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Backup story in [memory-architecture.md](../principles/memory-architecture.md#L104).

## Considered Options

- **A — `content_bytes BYTEA` on the `sources` row (chosen).** Postgres TOAST handles up-to-1GB-per-row binary fine. `pg_dump` captures everything in one file. Insert is one transactional INSERT, no two-step blob+row commit.
- **B — Filesystem split: `content_path TEXT` on the row, files under `data/openbrain/blobs/<hash>`.** Cheaper `pg_dump` (DB stays small). Backups split into DB + blob dir. Two-step commit risks orphan files if blob write succeeds and row insert fails. Rejected at this scale; revisit if DB grows past ~50GB.
- **C — Object storage (S3-compatible) with `content_uri TEXT`.** Right answer at multi-tenant scale. Wrong answer for a personal-use, attended product where there's no operations team and adding a third storage tier (Postgres + filesystem + S3) is pure overhead.

## Consequences

- **`pg_dump` size scales with corpus size.** A 5GB OpenBrain takes minutes to dump and restore; acceptable. Backups (queued separately per [memory-architecture.md](../principles/memory-architecture.md#L104)) should compress (`pg_dump -Fc`) and be incremental-aware where possible.
- **`SELECT *` discipline.** Repo methods never `SELECT * FROM sources` — they list explicit columns. The default `findById` loads metadata + `content_hash` only; bytes are loaded by an explicit `findContentById` to avoid pulling megabytes by accident.
- **Migration to filesystem-split is reversible.** If the corpus grows past comfort, a migration walks `sources`, writes `content_bytes` to disk under `<hash>`, sets `content_path`, NULLs `content_bytes`. The `previous_version_id` append-only chain isn't disturbed because we're rewriting blob locations, not history.
- **Citation `span_hash` recomputation** continues to work — the bytes load from the same column for the same row, transactionally.
