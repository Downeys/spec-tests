import type { MigrationBuilder } from "node-pg-migrate";

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("tags", { metadata: { type: "jsonb" } });

  // Extend compilation_runs.trigger CHECK to include 'agent'
  pgm.dropConstraint("compilation_runs", "compilation_runs_trigger_chk");
  pgm.addConstraint("compilation_runs", "compilation_runs_trigger_chk", {
    check: "trigger IN ('cli','api','cron','agent')"
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint("compilation_runs", "compilation_runs_trigger_chk");
  pgm.addConstraint("compilation_runs", "compilation_runs_trigger_chk", {
    check: "trigger IN ('cli','api','cron')"
  });
  pgm.dropColumn("tags", "metadata");
}
