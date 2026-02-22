import { z } from "zod";
import {
  cancelJourneyRunResponseSchema,
  cancelJourneyRunsResponseSchema,
  createJourneySchema,
  deleteJourneyResponseSchema,
  journeyRunDetailResponseSchema,
  journeyRunListResponseSchema,
  journeyListResponseSchema,
  journeyResponseSchema,
  listJourneyRunsByEntityQuerySchema,
  listJourneyRunsQuerySchema,
  publishJourneyResponseSchema,
  publishJourneySchema,
  setJourneyModeSchema,
  startJourneyTestRunResponseSchema,
  startJourneyTestRunSchema,
  updateJourneySchema,
} from "@scheduling/dto";
import { authed, adminOnly } from "./base.js";
import { journeyService } from "../services/journeys.js";

const journeyIdInputSchema = z.object({ id: z.uuid() });
const runIdInputSchema = z.object({ runId: z.uuid() });

export const list = authed
  .route({ method: "GET", path: "/journeys" })
  .output(journeyListResponseSchema)
  .handler(async ({ context }) => {
    return journeyService.list({
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const get = authed
  .route({ method: "GET", path: "/journeys/{id}" })
  .input(journeyIdInputSchema)
  .output(journeyResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const create = adminOnly
  .route({ method: "POST", path: "/journeys", successStatus: 201 })
  .input(createJourneySchema)
  .output(journeyResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.create(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const update = adminOnly
  .route({ method: "PATCH", path: "/journeys/{id}" })
  .input(
    z.object({
      id: z.uuid(),
      data: updateJourneySchema,
    }),
  )
  .output(journeyResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.update(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const publish = adminOnly
  .route({ method: "POST", path: "/journeys/{id}/publish" })
  .input(
    z.object({
      id: z.uuid(),
      data: publishJourneySchema,
    }),
  )
  .output(publishJourneyResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.publish(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const pause = adminOnly
  .route({ method: "POST", path: "/journeys/{id}/pause" })
  .input(journeyIdInputSchema)
  .output(journeyResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.pause(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const resume = adminOnly
  .route({ method: "POST", path: "/journeys/{id}/resume" })
  .input(journeyIdInputSchema)
  .output(journeyResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.resume(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const setMode = adminOnly
  .route({ method: "POST", path: "/journeys/{id}/mode" })
  .input(
    z.object({
      id: z.uuid(),
      data: setJourneyModeSchema,
    }),
  )
  .output(journeyResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.setMode(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const remove = adminOnly
  .route({ method: "DELETE", path: "/journeys/{id}" })
  .input(journeyIdInputSchema)
  .output(deleteJourneyResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.delete(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const startTestRun = adminOnly
  .route({ method: "POST", path: "/journeys/{id}/test-start" })
  .input(
    z.object({
      id: z.uuid(),
      data: startJourneyTestRunSchema,
    }),
  )
  .output(startJourneyTestRunResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.startTestRun(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const listRuns = authed
  .route({ method: "GET", path: "/journeys/{id}/runs" })
  .input(
    journeyIdInputSchema.extend({
      mode: listJourneyRunsQuerySchema.shape.mode.optional(),
      limit: listJourneyRunsQuerySchema.shape.limit.optional(),
    }),
  )
  .output(journeyRunListResponseSchema)
  .handler(async ({ input, context }) => {
    const query = listJourneyRunsQuerySchema.parse({
      mode: input.mode,
      limit: input.limit,
    });

    return journeyService.listRuns(input.id, query, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const listRunsByEntity = authed
  .route({ method: "GET", path: "/journeys/runs/by-entity" })
  .input(listJourneyRunsByEntityQuerySchema)
  .output(journeyRunListResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.listRunsByEntity(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const getRun = authed
  .route({ method: "GET", path: "/journeys/runs/{runId}" })
  .input(runIdInputSchema)
  .output(journeyRunDetailResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.getRun(input.runId, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const cancelRun = adminOnly
  .route({ method: "POST", path: "/journeys/runs/{runId}/cancel" })
  .input(runIdInputSchema)
  .output(cancelJourneyRunResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.cancelRun(input.runId, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const cancelRuns = adminOnly
  .route({ method: "POST", path: "/journeys/{id}/runs/cancel" })
  .input(journeyIdInputSchema)
  .output(cancelJourneyRunsResponseSchema)
  .handler(async ({ input, context }) => {
    return journeyService.cancelRuns(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const runs = {
  list: listRuns,
  listByEntity: listRunsByEntity,
  get: getRun,
  cancel: cancelRun,
};

export const journeyRoutes = {
  list,
  get,
  create,
  update,
  publish,
  pause,
  resume,
  setMode,
  remove,
  startTestRun,
  listRuns,
  listRunsByEntity,
  getRun,
  cancelRun,
  cancelRuns,
  runs,
};
