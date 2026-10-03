import Fastify from "fastify";
import {
  ConversationTurnRequestSchema,
  ConversationTurnResponseSchema,
  DatasetStatusSchema,
  ParseBriefRequestSchema,
  ParseBriefResponseSchema,
  RecruitmentProgressSchema,
  ScoutInputSchema,
  type RecruitmentProgress,
} from "./domain/schemas.js";
import { createScoutRunner, dataRepository } from "./agent/graph.js";
import { createRecruitmentCheckpointStore } from "./agent/checkpoint-store.js";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { PlayerRepository } from "./data/provider.js";
import { BriefParserUnavailableError, parseRecruitmentBrief } from "./agent/brief-parser.js";
import { RecruitmentCaseStateExpiredError, RecruitmentModelUnavailableError, configuredRecruitmentConversation, createRecruitmentConversation, type RecruitmentConversation, type RecruitmentPlanner } from "./agent/conversation.js";
import { createLocalKnowledgeBase, type KnowledgeBase, type KnowledgeRepository } from "./knowledge/index.js";
import { KnowledgeStatusSchema } from "./knowledge/schemas.js";
import { createPlayerObservationLibrary, PlayerObservationNotFoundError, type PlayerObservationLibrary } from "./observations/library.js";
import { PlayerObservationInputSchema, PlayerObservationListSchema, PlayerObservationSchema } from "./observations/schemas.js";

type AppKnowledgeBase = KnowledgeRepository & Pick<KnowledgeBase, "status" | "ingest" | "removeDocument">;

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  try {
    const host = new URL(`http://${hostHeader}`);
    return !host.username && !host.password && isLoopbackHostname(host.hostname.toLocaleLowerCase());
  } catch {
    return false;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:")
      && !url.username
      && !url.password
      && isLoopbackHostname(url.hostname.toLocaleLowerCase());
  } catch {
    return false;
  }
}

export function createApp(options: {
  playerRepository?: PlayerRepository;
  recruitmentConversation?: RecruitmentConversation;
  recruitmentPlanner?: RecruitmentPlanner;
  knowledgeBase?: AppKnowledgeBase;
  playerObservationLibrary?: PlayerObservationLibrary;
  playerObservationsPath?: string;
  checkpointer?: BaseCheckpointSaver;
  checkpointPath?: string;
} = {}) {
  const app = Fastify({ logger: true });
  const playerRepository = options.playerRepository ?? dataRepository;
  const knowledgeBase = options.knowledgeBase ?? createLocalKnowledgeBase();
  const playerObservationLibrary = options.playerObservationLibrary ?? createPlayerObservationLibrary({
    index: knowledgeBase,
    storagePath: options.playerObservationsPath,
  });
  const checkpointStore = options.recruitmentConversation || options.checkpointer
    ? undefined
    : createRecruitmentCheckpointStore(options.checkpointPath);
  const checkpointer = options.checkpointer ?? checkpointStore?.checkpointer;
  const recruitmentProgressByCase = new Map<string, RecruitmentProgress>();
  const recruitmentConversation = options.recruitmentConversation ?? (options.recruitmentPlanner
    ? createRecruitmentConversation({
      repository: playerRepository,
      planner: options.recruitmentPlanner,
      knowledgeBase,
      checkpointer,
    })
    : configuredRecruitmentConversation(playerRepository, knowledgeBase, undefined, checkpointer));
  const runScout = createScoutRunner(playerRepository);
  app.addHook("onRequest", async (request, reply) => {
    if (!isLoopbackHostHeader(request.headers.host)) {
      return reply.code(403).send({ error: "仅允许从本机访问 TactiScout。" });
    }
    if (request.headers.origin && !isLoopbackOrigin(request.headers.origin)) {
      return reply.code(403).send({ error: "已拒绝来自非本机网页的请求。" });
    }
    if (request.headers["sec-fetch-site"] === "cross-site") {
      return reply.code(403).send({ error: "已拒绝跨站请求。" });
    }
  });
  if (checkpointStore) app.addHook("onClose", async () => checkpointStore.close());

  app.get("/health", async () => ({ status: "ok", service: "tactiscout-api" }));
  app.get("/api/v1/dataset", async () => DatasetStatusSchema.parse({
    mode: playerRepository.mode,
    source: playerRepository.sourceName,
  }));
  app.get("/api/v1/knowledge/status", async () => KnowledgeStatusSchema.parse(await knowledgeBase.status()));
  app.get("/api/v1/player-observations", async () => PlayerObservationListSchema.parse(await playerObservationLibrary.list()));

  app.post("/api/v1/player-observations", async (request, reply) => {
    const parsed = PlayerObservationInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "球探观察资料不完整或未同意本地保存。", details: parsed.error.flatten() });
    try {
      return reply.code(201).send(PlayerObservationSchema.parse(await playerObservationLibrary.save(null, parsed.data)));
    } catch (error) {
      request.log.error({ err: error }, "Player observation could not be saved");
      return reply.code(502).send({ error: error instanceof Error ? error.message : "球探观察暂时无法保存。" });
    }
  });

  app.put<{ Params: { observationId: string } }>("/api/v1/player-observations/:observationId", async (request, reply) => {
    const parsed = PlayerObservationInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "球探观察资料不完整或未同意本地保存。", details: parsed.error.flatten() });
    try {
      return PlayerObservationSchema.parse(await playerObservationLibrary.save(request.params.observationId, parsed.data));
    } catch (error) {
      if (error instanceof PlayerObservationNotFoundError) return reply.code(404).send({ error: error.message });
      request.log.error({ err: error }, "Player observation could not be updated");
      return reply.code(502).send({ error: error instanceof Error ? error.message : "球探观察暂时无法更新。" });
    }
  });

  app.delete<{ Params: { observationId: string } }>("/api/v1/player-observations/:observationId", async (request, reply) => {
    try {
      await playerObservationLibrary.delete(request.params.observationId);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof PlayerObservationNotFoundError) return reply.code(404).send({ error: error.message });
      request.log.error({ err: error }, "Player observation could not be deleted");
      return reply.code(502).send({ error: error instanceof Error ? error.message : "球探观察暂时无法删除。" });
    }
  });

  app.get<{ Params: { caseId: string } }>("/api/v1/recruitment/cases/:caseId/progress", async (request, reply) => {
    const progress = recruitmentProgressByCase.get(request.params.caseId);
    if (!progress || Date.now() - Date.parse(progress.updatedAt) > 30 * 60 * 1000) {
      return reply.code(404).send({ error: "当前案件没有可用的进行状态。" });
    }
    return RecruitmentProgressSchema.parse(progress);
  });

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
      const updateProgress = (update: Pick<RecruitmentProgress, "stage" | "message" | "completedSteps">) => {
        recruitmentProgressByCase.set(caseId, RecruitmentProgressSchema.parse({
          ...update,
          active: true,
          updatedAt: new Date().toISOString(),
        }));
      };
      for (const [knownCaseId, progress] of recruitmentProgressByCase) {
        if (Date.now() - Date.parse(progress.updatedAt) > 30 * 60 * 1000) recruitmentProgressByCase.delete(knownCaseId);
      }
      while (recruitmentProgressByCase.size >= 250) {
        const oldestCaseId = recruitmentProgressByCase.keys().next().value;
        if (!oldestCaseId) break;
        recruitmentProgressByCase.delete(oldestCaseId);
      }
      updateProgress({ stage: "starting", message: "已启动本轮球探调查", completedSteps: 0 });
      const response = await recruitmentConversation.turn({
        threadId: caseId,
        message: parsed.data.message,
        expectsExistingState: parsed.data.expectsExistingState,
        onProgress: updateProgress,
      });
      updateProgress({
        stage: response.status === "needs_input" ? "asking_user" : "completed",
        message: response.status === "needs_input" ? "本轮调查已完成，等你补充信息后继续" : "调查完成，报告已生成",
        completedSteps: recruitmentProgressByCase.get(caseId)?.completedSteps ?? 0,
      });
      recruitmentProgressByCase.set(caseId, RecruitmentProgressSchema.parse({
        ...recruitmentProgressByCase.get(caseId),
        active: false,
      }));
      return ConversationTurnResponseSchema.parse(response);
    } catch (error) {
      const progress = recruitmentProgressByCase.get(caseId);
      if (progress) {
        recruitmentProgressByCase.set(caseId, RecruitmentProgressSchema.parse({
          ...progress,
          active: false,
          stage: "failed",
          message: "本轮调查遇到问题，详情见下方错误信息",
          updatedAt: new Date().toISOString(),
        }));
      }
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
