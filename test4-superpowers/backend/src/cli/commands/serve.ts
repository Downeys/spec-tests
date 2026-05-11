import { buildServer } from "../../api/server.js";

export interface ServeArgs {
  host?: string;
}

export async function runServe(args: ServeArgs = {}): Promise<void> {
  const port = Number(process.env.PORT ?? 8787);
  const host = args.host ?? "127.0.0.1";
  const app = await buildServer();
  await app.listen({ port, host });
  process.stdout.write(`backend listening on http://${host}:${port}\n`);
  // Keep the process alive until killed; otherwise CLI's finally closes the pool prematurely.
  await new Promise<void>(() => {});
}
