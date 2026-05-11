import type { FastifyReply } from "fastify";

export class SseWriter {
  constructor(private readonly reply: FastifyReply) {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
  }

  write(event: string, data: unknown): void {
    this.reply.raw.write(`event: ${event}\n`);
    this.reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  end(): void {
    this.reply.raw.end();
  }
}
