import cors from "@fastify/cors";
import Fastify from "fastify";
import { ParseBriefRequestSchema, ScoutInputSchema } from "./domain/schemas.js";
import { runScout } from "./agent/graph.js";
import { dataRepository } from "./agent/graph.js";
import { BriefParserUnavailableError, parseRecruitmentBrief } from "./agent/brief-parser.js";

export function createApp() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok", service: "tactiscout-api" }));
  app.get("/api/v1/dataset", async () => ({
    mode: dataRepository.mode,
    source: dataRepository.sourceName,
  }));

  app.post("/api/v1/requirements/parse", async (request, reply) => {
    const parsed = ParseBriefRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "请填写至少 5 个字符的需求描述。",
        details: parsed.error.flatten(),
      });
    }
    try {
      const draft = await parseRecruitmentBrief(parsed.data.brief);
      const missingFields = [
        ...(!draft.targetTeam?.trim() ? ["targetTeam" as const] : []),
        ...(!draft.position ? ["position" as const] : []),
      ];
      return { draft, missingFields };
    } catch (error) {
      const message = error instanceof Error ? error.message : "需求解析失败。";
      if (error instanceof BriefParserUnavailableError) return reply.code(503).send({ error: message });
      request.log.error({ err: error }, "Brief parsing failed");
      return reply.code(502).send({ error: message });
    }
  });

  app.post("/api/v1/scout", async (request, reply) => {
    const parsed = ScoutInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid scouting request",
        details: parsed.error.flatten(),
      });
    }
    try {
      return await runScout(parsed.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      request.log.error({ err: error }, "Scouting workflow failed");
      return reply.code(422).send({ error: message });
    }
  });

  return app;
}
