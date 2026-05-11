import type pg from "pg";
import { getPool } from "../db/pool.js";

export interface OrientationLogEvent {
  kind: "compilation_run" | "claim_created" | "source_created";
  at: Date;
  summary: string;
}

export interface OrientationMap {
  tags: { slug: string; display: string; claimCount: number }[];
  totals: {
    sources: number;
    claims: number;
    openHypotheses: number;
    unresolvedContradictions: number;
  };
  recentEvents: OrientationLogEvent[];
  lastCompilationAt: Date | null;
}

function client(c?: pg.PoolClient): pg.PoolClient | pg.Pool {
  return c ?? getPool();
}

export async function getOrientationMap(c?: pg.PoolClient): Promise<OrientationMap> {
  const conn = client(c);

  const [tagRows, totalsRow, contradictionsRow, lastCompilationRow, eventsRows] =
    await Promise.all([
      conn.query<{ slug: string; display: string; claim_count: string }>(
        `SELECT t.slug, t.display, COUNT(ct.claim_id)::text AS claim_count
           FROM tags t
           LEFT JOIN claim_tags ct ON ct.tag_id = t.id
           GROUP BY t.id
           ORDER BY t.slug`
      ),
      conn.query<{
        sources: string;
        claims: string;
        open_hypotheses: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM sources)             AS sources,
           (SELECT count(*)::text FROM claims)              AS claims,
           (SELECT count(*)::text FROM claims
              WHERE type='hypothesis' AND status='open')    AS open_hypotheses`
      ),
      conn.query<{ unresolved: string }>(
        `SELECT count(*)::text AS unresolved
           FROM relations r
           JOIN claims a ON a.id = r.from_claim
           JOIN claims b ON b.id = r.to_claim
           WHERE r.type='contradicts'
             AND a.status NOT IN ('retired','superseded')
             AND b.status NOT IN ('retired','superseded')`
      ),
      conn.query<{ finished_at: Date | null }>(
        `SELECT finished_at FROM compilation_runs
           WHERE status='success'
           ORDER BY finished_at DESC NULLS LAST
           LIMIT 1`
      ),
      conn.query<{ kind: string; at: Date; summary: string }>(
        `(SELECT 'compilation_run'::text AS kind,
                  COALESCE(finished_at, started_at) AS at,
                  ('compilation ' || status ||
                   ' (pages_written=' || pages_written ||
                   ', pages_skipped=' || pages_skipped || ')') AS summary
            FROM compilation_runs
            ORDER BY started_at DESC LIMIT 5)
         UNION ALL
         (SELECT 'claim_created'::text AS kind,
                  created_at AS at,
                  ('claim added: ' || left(statement, 80)) AS summary
            FROM claims
            ORDER BY created_at DESC LIMIT 5)
         UNION ALL
         (SELECT 'source_created'::text AS kind,
                  ingested_at AS at,
                  ('source ingested: ' || title) AS summary
            FROM sources
            ORDER BY ingested_at DESC LIMIT 5)
         ORDER BY at DESC LIMIT 10`
      )
    ]);

  return {
    tags: tagRows.rows.map((r) => ({
      slug: r.slug,
      display: r.display,
      claimCount: Number(r.claim_count)
    })),
    totals: {
      sources: Number(totalsRow.rows[0]!.sources),
      claims: Number(totalsRow.rows[0]!.claims),
      openHypotheses: Number(totalsRow.rows[0]!.open_hypotheses),
      unresolvedContradictions: Number(contradictionsRow.rows[0]!.unresolved)
    },
    recentEvents: eventsRows.rows.map((r) => ({
      kind: r.kind as OrientationLogEvent["kind"],
      at: r.at,
      summary: r.summary
    })),
    lastCompilationAt: lastCompilationRow.rows[0]?.finished_at ?? null
  };
}
