import { describe, expect, mock, test } from "bun:test";
import { orchestrateTriggerExecution } from "./workflow-trigger-orchestrator.js";

function createWaitState(
  id: string,
  executionId: string,
  waitForEvents?: string,
) {
  return {
    id,
    executionId,
    nodeId: `node_${id}`,
    hookToken: `token_${id}`,
    metadata: waitForEvents ? { waitForEvents } : null,
  };
}

describe("workflow trigger orchestrator", () => {
  test("ignores when event type is missing", async () => {
    const startExecution = mock(async () => ({
      executionId: "exec_1",
      dryRun: false,
    }));

    const result = await orchestrateTriggerExecution({
      dryRun: false,
      eventTypePath: "payload.type",
      routingDecision: { kind: "ignore", reason: "missing_event_type" },
      waitStates: [],
      enableResumes: true,
      startExecution,
      cancelWaitStates: mock(async () => ({
        cancelledExecutions: 0,
        cancelledWaits: 0,
      })),
      resumeWaitStates: mock(async () => 0),
    });

    expect(result).toEqual({
      status: "ignored",
      reason: "missing_event_type",
    });
    expect(startExecution).toHaveBeenCalledTimes(0);
  });

  test("returns no_waiting_runs for restart with no waiting states", async () => {
    const startExecution = mock(async () => ({
      executionId: "exec_1",
      dryRun: false,
    }));

    const result = await orchestrateTriggerExecution({
      dryRun: false,
      eventType: "client.updated",
      correlationKey: "abc",
      eventTypePath: "event",
      routingDecision: { kind: "restart" },
      waitStates: [],
      enableResumes: true,
      startExecution,
      cancelWaitStates: mock(async () => ({
        cancelledExecutions: 0,
        cancelledWaits: 0,
      })),
      resumeWaitStates: mock(async () => 0),
    });

    expect(result).toEqual({
      status: "ignored",
      reason: "no_waiting_runs",
    });
    expect(startExecution).toHaveBeenCalledTimes(0);
  });

  test("restart cancels waits then starts replacement execution", async () => {
    const startExecution = mock(async () => ({
      executionId: "exec_restart",
      runId: "run_restart",
      dryRun: false,
    }));
    const cancelWaitStates = mock(async () => ({
      cancelledExecutions: 2,
      cancelledWaits: 3,
      failedExecutions: ["exec_failed"],
    }));

    const result = await orchestrateTriggerExecution({
      dryRun: false,
      eventType: "client.updated",
      correlationKey: "abc",
      eventTypePath: "event",
      routingDecision: { kind: "restart" },
      waitStates: [
        createWaitState("1", "exec_wait_1"),
        createWaitState("2", "exec_wait_1"),
        createWaitState("3", "exec_wait_2"),
      ],
      enableResumes: true,
      startExecution,
      cancelWaitStates,
      resumeWaitStates: mock(async () => 0),
    });

    expect(cancelWaitStates).toHaveBeenCalledTimes(1);
    expect(startExecution).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "running",
      executionId: "exec_restart",
      runId: "run_restart",
      dryRun: false,
      cancelledExecutions: 2,
      cancelledWaits: 3,
    });
  });

  test("stop cancels waits and does not start a new run", async () => {
    const startExecution = mock(async () => ({
      executionId: "exec_start",
      dryRun: false,
    }));
    const cancelWaitStates = mock(async () => ({
      cancelledExecutions: 2,
      cancelledWaits: 3,
    }));

    const result = await orchestrateTriggerExecution({
      dryRun: false,
      eventType: "client.deleted",
      correlationKey: "abc",
      eventTypePath: "event",
      routingDecision: { kind: "stop" },
      waitStates: [
        createWaitState("1", "exec_wait_1"),
        createWaitState("2", "exec_wait_1"),
        createWaitState("3", "exec_wait_2"),
      ],
      enableResumes: true,
      startExecution,
      cancelWaitStates,
      resumeWaitStates: mock(async () => 0),
    });

    expect(cancelWaitStates).toHaveBeenCalledTimes(1);
    expect(startExecution).toHaveBeenCalledTimes(0);
    expect(result).toEqual({
      status: "cancelled",
      dryRun: false,
      cancelledExecutions: 2,
      cancelledWaits: 3,
    });
  });

  test("resumes waiting hooks for start routing before creating new run", async () => {
    const startExecution = mock(async () => ({
      executionId: "exec_start",
      dryRun: false,
    }));
    const resumeWaitStates = mock(async () => 1);

    const result = await orchestrateTriggerExecution({
      dryRun: false,
      eventType: "client.updated",
      correlationKey: "abc",
      eventTypePath: "event",
      routingDecision: { kind: "start" },
      waitStates: [
        createWaitState("1", "exec_wait_1", "client.updated,client.created"),
      ],
      enableResumes: true,
      startExecution,
      cancelWaitStates: mock(async () => ({
        cancelledExecutions: 0,
        cancelledWaits: 0,
      })),
      resumeWaitStates,
    });

    expect(resumeWaitStates).toHaveBeenCalledTimes(1);
    expect(startExecution).toHaveBeenCalledTimes(0);
    expect(result).toEqual({
      status: "resumed",
      resumedCount: 1,
    });
  });
});
