import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { registerLifecycleRoutes } from "./lifecycle.js";
import { registerChatRoute } from "./chat.js";
import { registerCompileRoute } from "./compile.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    credentials: false
  });
  await registerLifecycleRoutes(app);
  await registerChatRoute(app);
  await registerCompileRoute(app);
  return app;
}
