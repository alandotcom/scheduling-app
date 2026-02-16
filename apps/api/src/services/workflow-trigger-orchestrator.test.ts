import { describe, expect, mock, test } from "bun:test";
import { orchestrateTriggerExecution } from "./workflow-trigger-orchestrator.js";

function createWaitState(id: string, executionId: string) {
  return {
    id,
    executionId,
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
      startExecution,
      cancelWaitStates: mock(async () => ({
        cancelledExecutions: 0,
        cancelledWaits: 0,
      })),
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
      startExecution,
      cancelWaitStates: mock(async () => ({
        cancelledExecutions: 0,
        cancelledWaits: 0,
      })),
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
      startExecution,
      cancelWaitStates,
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

  test("dry-run restart simulates cancellation summary before replacement run", async () => {
    const startExecution = mock(async () => ({
      executionId: "exec_restart_dry",
      runId: "run_restart_dry",
      dryRun: true,
    }));
    const cancelWaitStates = mock(async () => ({
      cancelledExecutions: 9,
      cancelledWaits: 9,
    }));

    const result = await orchestrateTriggerExecution({
      dryRun: true,
      eventType: "client.updated",
      correlationKey: "abc",
      eventTypePath: "event",
      routingDecision: { kind: "restart" },
      waitStates: [
        createWaitState("1", "exec_wait_1"),
        createWaitState("2", "exec_wait_1"),
        createWaitState("3", "exec_wait_2"),
      ],
      startExecution,
      cancelWaitStates,
    });

    expect(cancelWaitStates).toHaveBeenCalledTimes(0);
    expect(startExecution).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "running",
      executionId: "exec_restart_dry",
      runId: "run_restart_dry",
      dryRun: true,
      cancelledExecutions: 2,
      cancelledWaits: 3,
      simulated: true,
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
      startExecution,
      cancelWaitStates,
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

  test("dry-run stop simulates cancellations without dispatching cancel requests", async () => {
    const startExecution = mock(async () => ({
      executionId: "exec_start",
      dryRun: true,
    }));
    const cancelWaitStates = mock(async () => ({
      cancelledExecutions: 2,
      cancelledWaits: 3,
    }));

    const result = await orchestrateTriggerExecution({
      dryRun: true,
      eventType: "client.deleted",
      correlationKey: "abc",
      eventTypePath: "event",
      routingDecision: { kind: "stop" },
      waitStates: [
        createWaitState("1", "exec_wait_1"),
        createWaitState("2", "exec_wait_1"),
        createWaitState("3", "exec_wait_2"),
      ],
      startExecution,
      cancelWaitStates,
    });

    expect(cancelWaitStates).toHaveBeenCalledTimes(0);
    expect(startExecution).toHaveBeenCalledTimes(0);
    expect(result).toEqual({
      status: "cancelled",
      dryRun: true,
      simulated: true,
      cancelledExecutions: 2,
      cancelledWaits: 3,
    });
  });

  test("starts a run when event type is missing for event_not_configured routing", async () => {
    const startExecution = mock(async () => ({
      executionId: "exec_fallback",
      runId: "run_fallback",
      dryRun: false,
    }));

    const result = await orchestrateTriggerExecution({
      dryRun: false,
      routingDecision: { kind: "ignore", reason: "event_not_configured" },
      waitStates: [],
      startExecution,
      cancelWaitStates: mock(async () => ({
        cancelledExecutions: 0,
        cancelledWaits: 0,
      })),
    });

    expect(startExecution).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "running",
      executionId: "exec_fallback",
      runId: "run_fallback",
      dryRun: false,
    });
  });
});
