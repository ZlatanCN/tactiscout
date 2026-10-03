import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  ConversationTurnRequestSchema,
  ConversationTurnResponseSchema,
  DatasetStatusSchema,
  ParseBriefRequestSchema,
  ParseBriefResponseSchema,
  ScoutInputSchema,
} from "./domain/schemas.js";
import { createScoutRunner, dataRepository } from "./agent/graph.js";
import { createRecruitmentCheckpointStore } from "./agent/checkpoint-store.js";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { PlayerRepository } from "./data/provider.js";
import { BriefParserUnavailableError, parseRecruitmentBrief } from "./agent/brief-parser.js";
import { RecruitmentCaseStateExpiredError, RecruitmentModelUnavailableError, configuredRecruitmentConversation, createRecruitmentConversation, type RecruitmentConversation, type RecruitmentPlanner } from "./agent/conversation.js";
import { createLocalKnowledgeBase, type KnowledgeBase, type KnowledgeRepository } from "./knowledge/index.js";
import { KnowledgeStatusSchema } from "./knowledge/schemas.js";

type AppKnowledgeBase = KnowledgeRepository & Pick<KnowledgeBase, "status">;

export function createApp(options: {
  playerRepository?: PlayerRepository;
  recruitmentConversation?: RecruitmentConversation;
  recruitmentPlanner?: RecruitmentPlanner;
  knowledgeBase?: AppKnowledgeBase;
  checkpointer?: BaseCheckpointSaver;
  checkpointPath?: string;
} = {}) {
  const app = Fastify({ logger: true });
  const playerRepository = options.playerRepository ?? dataRepository;
  const knowledgeBase = options.knowledgeBase ?? createLocalKnowledgeBase();
  const checkpointStore = options.recruitmentConversation || options.checkpointer
    ? undefined
    : createRecruitmentCheckpointStore(options.checkpointPath);
  const checkpointer = options.checkpointer ?? checkpointStore?.checkpointer;
  const recruitmentConversation = options.recruitmentConversation ?? (options.recruitmentPlanner
    ? createRecruitmentConversation({
      repository: playerRepository,
      planner: options.recruitmentPlanner,
      knowledgeBase,
      checkpointer,
    })
    : configuredRecruitmentConversation(playerRepository, knowledgeBase, undefined, checkpointer));
  const runScout = createScoutRunner(playerRepository);
  app.register(cors, { origin: true });
  if (checkpointStore) app.addHook("onClose", async () => checkpointStore.close());

  app.get("/health", async () => ({ status: "ok", service: "tactiscout-api" }));
  app.get("/api/v1/dataset", async () => DatasetStatusSchema.parse({
    mode: playerRepository.mode,
    source: playerRepository.sourceName,
  }));
  app.get("/api/v1/knowledge/status", async () => KnowledgeStatusSchema.parse(await knowledgeBase.status()));

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
      return ParseBriefResponseSchema.parse({ draft, missingFields });
    } catch (error) {
      const message = error instanceof Error ? error.message : "需求解析失败。";
      if (error instanceof BriefParserUnavailableError) return reply.code(503).send({ error: message });
      request.log.error({ err: error }, "Brief parsing failed");
      return reply.code(502).send({ error: message });
    }
  });

  app.post<{ Params: { caseId: string } }>("/api/v1/recruitment/cases/:caseId/turns", async (request, reply) => {
    const caseId = request.params.caseId.trim();
    const parsed = ConversationTurnRequestSchema.safeParse(request.body);
    if (!caseId || caseId.length > 128 || !parsed.success) {
      return reply.code(400).send({ error: "请提供有效的案件编号和 1–4000 字的消息。" });
    }

    try {
      const response = await recruitmentConversation.turn({
        threadId: caseId,
        message: parsed.data.message,
        expectsExistingState: parsed.data.expectsExistingState,
      });
      return ConversationTurnResponseSchema.parse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "招募对话暂时无法继续。";
      if (error instanceof RecruitmentModelUnavailableError) return reply.code(503).send({ error: message });
      if (error instanceof RecruitmentCaseStateExpiredError) return reply.code(409).send({ error: message });
      request.log.error({ err: error, caseId }, "Recruitment conversation failed");
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
