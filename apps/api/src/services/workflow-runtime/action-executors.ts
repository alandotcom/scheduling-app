import { getLogger } from "@logtape/logtape";
import type { DomainEventType } from "@scheduling/dto";
import type { WorkflowExecution } from "../../repositories/workflows.js";
import { resolveWaitUntil } from "../workflow-wait-time.js";
import { workflowExecutionEventType } from "../workflow-execution-events.js";
import type {
  WorkflowRunRequestedInput,
  WorkflowRunRequestedRuntime,
} from "./contracts.js";
import type { WorkflowRuntimePersistence } from "./persistence.js";
import type {
  NodeActionOutcome,
  ParsedNode,
  RuntimeContext,
  SwitchBranch,
} from "./types.js";

const workflowRunRequestedLogger = getLogger(["workflow", "run-requested"]);

type StandardActionDependencies = {
  valueToInterpolatedString: (value: unknown) => string;
  evaluateConditionExpression: (input: {
    condition: unknown;
    context: RuntimeContext;
  }) => boolean;
  executeHttpRequestAction: (
    config: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  getEventSwitchBranch: (
    eventType: DomainEventType,
  ) => SwitchBranch | undefined;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
}

export async function executeStandardNodeAction(input: {
  workflowInput: WorkflowRunRequestedInput;
  node: ParsedNode;
  actionType: string | undefined;
  resolvedActionConfig: Record<string, unknown>;
  runtimeContext: RuntimeContext;
  persistence: WorkflowRuntimePersistence;
  dependencies: StandardActionDependencies;
}): Promise<NodeActionOutcome> {
  if (input.node.kind === "trigger") {
    return {
      haltBranch: false,
      output: {
        accepted: true,
        eventType: input.workflowInput.eventContext.eventType,
        data: input.workflowInput.triggerInput,
      },
    };
  }

  if (!input.actionType) {
    throw new Error(`Action type is missing for node '${input.node.label}'.`);
  }

  if (input.actionType === "switch") {
    return {
      haltBranch: false,
      output: {
        branch: input.dependencies.getEventSwitchBranch(
          input.workflowInput.eventContext.eventType,
        ),
      },
    };
  }

  if (input.actionType === "condition") {
    const condition = input.resolvedActionConfig["condition"];
    const passed = input.dependencies.evaluateConditionExpression({
      condition,
      context: input.runtimeContext,
    });

    return {
      haltBranch: !passed,
      output: {
        passed,
        expression: condition,
      },
    };
  }

  if (input.actionType === "http-request") {
    return {
      haltBranch: false,
      output: await input.dependencies.executeHttpRequestAction(
        input.resolvedActionConfig,
      ),
    };
  }

  if (input.actionType === "logger") {
    const messageValue = input.resolvedActionConfig["message"];
    const message = input.dependencies.valueToInterpolatedString(messageValue);
    const eventMessage = `[${input.node.label}] ${message}`;

    workflowRunRequestedLogger.info("Workflow logger action: {message}", {
      message,
    });

    await input.persistence.appendExecutionEvent({
      workflowId: input.workflowInput.workflowId,
      executionId: input.workflowInput.executionId,
      eventType: workflowExecutionEventType.runLog,
      message: eventMessage,
      metadata: {
        nodeId: input.node.id,
        nodeName: input.node.label,
        rawMessage: message,
      },
    });

    return {
      haltBranch: false,
      output: {
        logged: true,
        message,
      },
    };
  }

  throw new Error(`Unsupported action type '${input.actionType}'.`);
}

export async function executeWaitNodeAction(input: {
  workflowInput: WorkflowRunRequestedInput;
  execution: WorkflowExecution;
  node: ParsedNode;
  resolvedActionConfig: Record<string, unknown>;
  runtime: WorkflowRunRequestedRuntime;
  persistence: WorkflowRuntimePersistence;
  stepId: string;
  startedAt: Date;
}): Promise<NodeActionOutcome> {
  const prepareResult = await input.runtime.runStep(
    `${input.stepId}-wait-prepare`,
    async () => {
      const waitDuration = input.resolvedActionConfig["waitDuration"];
      const waitUntilRaw = input.resolvedActionConfig["waitUntil"];
      const waitOffset = input.resolvedActionConfig["waitOffset"];
      const waitTimezoneValue = input.resolvedActionConfig["waitTimezone"];
      const waitTimezone =
        typeof waitTimezoneValue === "string" ? waitTimezoneValue : null;

      const resolved = resolveWaitUntil({
        now: input.startedAt,
        waitDuration,
        waitUntil: waitUntilRaw,
        waitOffset,
        ...(waitTimezone ? { waitTimezone } : {}),
      });

      const waitUntil = resolved.waitUntil;
      if (!waitUntil) {
        throw new Error(resolved.error ?? "Failed to resolve wait timestamp.");
      }

      const waitGateMode =
        typeof input.resolvedActionConfig["waitGateMode"] === "string"
          ? input.resolvedActionConfig["waitGateMode"]
          : "off";

      const waitingStates = await input.persistence.listExecutionWaitingStates(
        input.workflowInput.executionId,
      );
      let waitState =
        waitingStates.find((state) => state.nodeId === input.node.id) ?? null;

      if (!waitState) {
        const delayMs = waitUntil.getTime() - Date.now();

        if (waitGateMode === "require_actual_wait" && delayMs <= 0) {
          return {
            shouldSleep: false,
            haltBranch: true,
            output: {
              skipped: true,
              reason: "wait_already_due",
            },
          };
        }

        if (delayMs <= 0) {
          return {
            shouldSleep: false,
            haltBranch: false,
            output: {
              waited: false,
              reason: "wait_already_due",
            },
          };
        }

        const markedWaiting = await input.persistence.markExecutionWaiting(
          input.workflowInput.executionId,
        );

        if (!markedWaiting && input.execution.status !== "waiting") {
          return {
            shouldSleep: false,
            haltBranch: true,
            output: {
              skipped: true,
              reason: "execution_not_running",
            },
          };
        }

        waitState = await input.persistence.createWaitState({
          executionId: input.workflowInput.executionId,
          workflowId: input.workflowInput.workflowId,
          runId: input.execution.workflowRunId ?? input.execution.id,
          nodeId: input.node.id,
          nodeName: input.node.label,
          waitType: "delay",
          status: "waiting",
          waitUntil,
          correlationKey:
            input.workflowInput.eventContext.correlationKey ?? null,
          metadata: {
            waitDuration,
            waitUntil: waitUntilRaw,
            waitOffset,
            ...(waitTimezoneValue !== undefined
              ? { waitTimezone: waitTimezoneValue }
              : {}),
            waitGateMode,
          },
        });

        await input.persistence.appendExecutionEvent({
          workflowId: input.workflowInput.workflowId,
          executionId: input.workflowInput.executionId,
          eventType: workflowExecutionEventType.runWaiting,
          message: `Run waiting in delay node '${input.node.label}'`,
          metadata: {
            nodeId: input.node.id,
            nodeName: input.node.label,
            waitUntil: waitUntil.toISOString(),
            waitDuration,
            waitOffset,
          },
        });
      }

      if (!waitState) {
        return {
          shouldSleep: false,
          haltBranch: true,
          output: {
            skipped: true,
            reason: "wait_state_missing",
          },
        };
      }

      const effectiveWaitUntil = waitState.waitUntil ?? waitUntil;
      return {
        shouldSleep: true,
        waitStateId: waitState.id,
        waitUntil: effectiveWaitUntil.toISOString(),
      };
    },
  );

  if (prepareResult["shouldSleep"] !== true) {
    return {
      haltBranch: prepareResult["haltBranch"] === true,
      output: asRecord(prepareResult["output"]) ?? {},
    };
  }

  const waitUntilValue = prepareResult["waitUntil"];
  const waitStateId = prepareResult["waitStateId"];
  if (typeof waitUntilValue !== "string" || typeof waitStateId !== "string") {
    throw new Error("Wait step preparation returned invalid state.");
  }

  const waitUntil = new Date(waitUntilValue);
  const delayMs = Math.max(0, waitUntil.getTime() - Date.now());
  await input.runtime.sleep(`${input.stepId}-wait-sleep`, delayMs);

  const resumeResult = await input.runtime.runStep(
    `${input.stepId}-wait-resume`,
    async () => {
      const latestExecution = await input.persistence.loadExecution(
        input.workflowInput.executionId,
      );

      if (!latestExecution || latestExecution.status === "cancelled") {
        return {
          haltBranch: true,
          output: {
            skipped: true,
            reason: "execution_cancelled",
          },
        };
      }

      const resumed = await input.persistence.markWaitStateResumed(waitStateId);
      if (resumed) {
        await input.persistence.markExecutionRunning(
          input.workflowInput.executionId,
        );
        await input.persistence.appendExecutionEvent({
          workflowId: input.workflowInput.workflowId,
          executionId: input.workflowInput.executionId,
          eventType: workflowExecutionEventType.runResumed,
          message: `Run resumed after delay node '${input.node.label}'`,
          metadata: {
            nodeId: input.node.id,
            nodeName: input.node.label,
          },
        });
      }

      return {
        haltBranch: false,
        output: {
          waited: true,
          waitUntil: waitUntil.toISOString(),
          delayMs,
        },
      };
    },
  );

  return {
    haltBranch: resumeResult["haltBranch"] === true,
    output: asRecord(resumeResult["output"]) ?? {},
  };
}
