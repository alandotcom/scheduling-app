import { describe, expect, test } from "bun:test";
import type {
  WorkflowCatalogResponse,
  WorkflowGraphDocument,
} from "@scheduling/dto";
import {
  adaptCanonicalCatalogToReferenceCatalog,
  canonicalGraphToReferenceGraph,
  createDefaultReferenceTriggerConfig,
  createDefaultReferenceWorkflowGraph,
  mapCanonicalRunStatusToReferenceRunStatus,
  ReferenceAdapterError,
  referenceGraphToCanonicalGraph,
  type ReferenceWorkflowGraph,
} from "./reference-adapter";

const domainEventReferenceFixture: ReferenceWorkflowGraph = {
  nodes: [
    {
      id: "trigger",
      type: "trigger",
      position: { x: 0, y: 80 },
      data: {
        type: "trigger",
        label: "",
        description: "",
        config: {
          triggerType: "Webhook",
          domain: "appointment",
          webhookEventPath: "event",
          webhookCorrelationPath: "data.id",
          webhookCreateEvents: "appointment.created",
          webhookUpdateEvents: "appointment.updated, appointment.rescheduled",
          webhookDeleteEvents: "appointment.cancelled",
        },
      },
    },
    {
      id: "send_reminder",
      type: "action",
      position: { x: 300, y: 80 },
      data: {
        type: "action",
        label: "Emit Reminder",
        config: {
          actionType: "core.emitInternalEvent",
          actionId: "core.emitInternalEvent",
          input: {
            eventType: "workflow.intent.reminder",
            payload: {
              channel: "email",
            },
          },
        },
      },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "trigger",
      target: "send_reminder",
    },
  ],
};

const domainEventCanonicalFixture: WorkflowGraphDocument = {
  schemaVersion: 1,
  trigger: {
    type: "domain_event",
    domain: "appointment",
    startEvents: ["appointment.created"],
    restartEvents: ["appointment.updated", "appointment.rescheduled"],
    stopEvents: ["appointment.cancelled"],
  },
  nodes: [
    {
      id: "send_reminder",
      kind: "action",
      actionId: "core.emitInternalEvent",
      input: {
        eventType: "workflow.intent.reminder",
        payload: {
          channel: "email",
        },
      },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "trigger",
      target: "send_reminder",
    },
  ],
};

const scheduleReferenceFixture: ReferenceWorkflowGraph = {
  nodes: [
    {
      id: "trigger",
      type: "trigger",
      position: { x: 0, y: 80 },
      data: {
        type: "trigger",
        label: "",
        description: "",
        config: {
          triggerType: "Schedule",
          scheduleExpression: "0 9 * * *",
          scheduleCron: "0 9 * * *",
          scheduleTimezone: "America/New_York",
        },
      },
    },
    {
      id: "wait_before",
      type: "action",
      position: { x: 300, y: 80 },
      data: {
        type: "action",
        label: "Wait",
        config: {
          actionType: "Wait",
          waitDuration: "PT30M",
          referenceField: "appointment.startAt",
          offsetDirection: "before",
        },
      },
    },
    {
      id: "emit_followup",
      type: "action",
      position: { x: 560, y: 80 },
      data: {
        type: "action",
        label: "Emit Follow Up",
        config: {
          actionType: "core.emitInternalEvent",
          actionId: "core.emitInternalEvent",
          input: {
            eventType: "workflow.intent.scheduleRun",
            payload: {
              source: "daily",
            },
          },
        },
      },
    },
  ],
  edges: [
    { id: "e1", source: "trigger", target: "wait_before" },
    { id: "e2", source: "wait_before", target: "emit_followup" },
  ],
};

const scheduleCanonicalFixture: WorkflowGraphDocument = {
  schemaVersion: 1,
  trigger: {
    type: "schedule",
    expression: "0 9 * * *",
    timezone: "America/New_York",
    replacement: {
      mode: "allow_parallel",
      cancelOnTerminalState: false,
    },
  },
  nodes: [
    {
      id: "emit_followup",
      kind: "action",
      actionId: "core.emitInternalEvent",
      input: {
        eventType: "workflow.intent.scheduleRun",
        payload: {
          source: "daily",
        },
      },
    },
    {
      id: "wait_before",
      kind: "wait",
      wait: {
        mode: "relative",
        duration: "PT30M",
        referenceField: "appointment.startAt",
        offsetDirection: "before",
      },
    },
  ],
  edges: [
    { id: "e1", source: "trigger", target: "wait_before" },
    { id: "e2", source: "wait_before", target: "emit_followup" },
  ],
};

const branchingReferenceFixture: ReferenceWorkflowGraph = {
  nodes: [
    {
      id: "trigger",
      type: "trigger",
      position: { x: 0, y: 80 },
      data: {
        type: "trigger",
        label: "",
        description: "",
        config: {
          triggerType: "Webhook",
          domain: "appointment",
          webhookCreateEvents: "appointment.created",
          webhookUpdateEvents: "appointment.updated",
          webhookDeleteEvents: "appointment.cancelled",
        },
      },
    },
    {
      id: "if_confirmed",
      type: "action",
      position: { x: 250, y: 80 },
      data: {
        type: "action",
        label: "Condition",
        config: {
          actionType: "Condition",
          guard: {
            combinator: "all",
            conditions: [
              {
                field: "appointment.status",
                operator: "eq",
                value: "confirmed",
              },
            ],
          },
        },
      },
    },
    {
      id: "wait_1h",
      type: "action",
      position: { x: 500, y: 20 },
      data: {
        type: "action",
        label: "Wait",
        config: {
          actionType: "Wait",
          waitDuration: "PT1H",
        },
      },
    },
    {
      id: "send_yes",
      type: "action",
      position: { x: 760, y: 20 },
      data: {
        type: "action",
        label: "Emit Reminder",
        config: {
          actionType: "core.emitInternalEvent",
          actionId: "core.emitInternalEvent",
          input: {
            eventType: "workflow.intent.confirmedReminder",
            payload: { branch: "true" },
          },
        },
      },
    },
    {
      id: "send_no",
      type: "action",
      position: { x: 500, y: 170 },
      data: {
        type: "action",
        label: "Emit Cancel",
        config: {
          actionType: "core.emitInternalEvent",
          actionId: "core.emitInternalEvent",
          input: {
            eventType: "workflow.intent.cancelFlow",
            payload: { branch: "false" },
          },
        },
      },
    },
  ],
  edges: [
    { id: "e1", source: "trigger", target: "if_confirmed" },
    { id: "e2", source: "if_confirmed", target: "wait_1h" },
    {
      id: "e3",
      source: "if_confirmed",
      target: "send_no",
      data: { branch: "false" },
    },
    { id: "e4", source: "wait_1h", target: "send_yes" },
  ],
};

const branchingCanonicalFixture: WorkflowGraphDocument = {
  schemaVersion: 1,
  trigger: {
    type: "domain_event",
    domain: "appointment",
    startEvents: ["appointment.created"],
    restartEvents: ["appointment.updated"],
    stopEvents: ["appointment.cancelled"],
  },
  nodes: [
    {
      id: "if_confirmed",
      kind: "condition",
      guard: {
        combinator: "all",
        conditions: [
          {
            field: "appointment.status",
            operator: "eq",
            value: "confirmed",
          },
        ],
      },
    },
    {
      id: "send_no",
      kind: "action",
      actionId: "core.emitInternalEvent",
      input: {
        eventType: "workflow.intent.cancelFlow",
        payload: { branch: "false" },
      },
    },
    {
      id: "send_yes",
      kind: "action",
      actionId: "core.emitInternalEvent",
      input: {
        eventType: "workflow.intent.confirmedReminder",
        payload: { branch: "true" },
      },
    },
    {
      id: "wait_1h",
      kind: "wait",
      wait: {
        mode: "relative",
        duration: "PT1H",
        offsetDirection: "after",
      },
    },
  ],
  edges: [
    { id: "e1", source: "trigger", target: "if_confirmed" },
    { id: "e2", source: "if_confirmed", target: "wait_1h", branch: "true" },
    { id: "e3", source: "if_confirmed", target: "send_no", branch: "false" },
    { id: "e4", source: "wait_1h", target: "send_yes" },
  ],
};

function expectCanonicalRoundTripStable(
  referenceGraph: ReferenceWorkflowGraph,
) {
  const canonical = referenceGraphToCanonicalGraph(referenceGraph);
  const referenceRoundTrip = canonicalGraphToReferenceGraph(canonical);
  const canonicalRoundTrip = referenceGraphToCanonicalGraph(referenceRoundTrip);
  expect(canonicalRoundTrip).toEqual(canonical);
}

describe("reference workflow adapter", () => {
  test("provides default reference trigger config with appointment.created", () => {
    expect(createDefaultReferenceTriggerConfig()).toEqual({
      triggerType: "Webhook",
      domain: "appointment",
      webhookEventPath: "event",
      webhookCorrelationPath: "data.id",
      webhookCreateEvents: ["appointment.created"],
      webhookUpdateEvents: [],
      webhookDeleteEvents: [],
    });
  });

  test("provides default reference workflow graph with trigger node", () => {
    expect(createDefaultReferenceWorkflowGraph()).toEqual({
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          position: { x: 0, y: 80 },
          data: {
            type: "trigger",
            label: "",
            description: "",
            status: "idle",
            enabled: true,
            config: {
              triggerType: "Webhook",
              domain: "appointment",
              webhookEventPath: "event",
              webhookCorrelationPath: "data.id",
              webhookCreateEvents: ["appointment.created"],
              webhookUpdateEvents: [],
              webhookDeleteEvents: [],
            },
          },
        },
      ],
      edges: [],
    });
  });

  test("maps domain-event trigger graph from reference -> canonical", () => {
    const canonical = referenceGraphToCanonicalGraph(
      domainEventReferenceFixture,
    );
    expect(canonical).toEqual(domainEventCanonicalFixture);
    expectCanonicalRoundTripStable(domainEventReferenceFixture);
  });

  test("maps schedule trigger graph from reference -> canonical", () => {
    const canonical = referenceGraphToCanonicalGraph(scheduleReferenceFixture);
    expect(canonical).toEqual(scheduleCanonicalFixture);
    expectCanonicalRoundTripStable(scheduleReferenceFixture);
  });

  test("maps condition + wait branching graph with true/false branch semantics", () => {
    const canonical = referenceGraphToCanonicalGraph(branchingReferenceFixture);
    expect(canonical).toEqual(branchingCanonicalFixture);

    const roundTripReference = canonicalGraphToReferenceGraph(canonical);
    const trueBranchEdge = roundTripReference.edges.find(
      (edge) => edge.id === "e2",
    );
    const falseBranchEdge = roundTripReference.edges.find(
      (edge) => edge.id === "e3",
    );

    expect(trueBranchEdge?.data).toBeUndefined();
    expect(falseBranchEdge?.data).toEqual({ branch: "false" });

    expectCanonicalRoundTripStable(branchingReferenceFixture);
  });

  test("defaults canonical->reference trigger config to appointment.created when trigger is missing", () => {
    const reference = canonicalGraphToReferenceGraph({
      schemaVersion: 1,
      nodes: [],
      edges: [],
    });

    const triggerNode = reference.nodes.find((node) => node.id === "trigger");
    expect(triggerNode?.data?.config).toEqual({
      triggerType: "Webhook",
      domain: "appointment",
      webhookEventPath: "event",
      webhookCorrelationPath: "data.id",
      webhookCreateEvents: ["appointment.created"],
      webhookUpdateEvents: [],
      webhookDeleteEvents: [],
    });

    const canonical = referenceGraphToCanonicalGraph(reference);
    expect(canonical.trigger).toEqual({
      type: "domain_event",
      domain: "appointment",
      startEvents: ["appointment.created"],
      restartEvents: [],
      stopEvents: [],
    });
  });

  test("defaults reference->canonical trigger to appointment.created when trigger node is missing", () => {
    const canonical = referenceGraphToCanonicalGraph({
      nodes: [
        {
          id: "send_reminder",
          type: "action",
          data: {
            type: "action",
            config: {
              actionType: "core.emitInternalEvent",
              actionId: "core.emitInternalEvent",
              input: {
                eventType: "workflow.intent.reminder",
                payload: { channel: "email" },
              },
            },
          },
        },
      ],
      edges: [],
    });

    expect(canonical.trigger).toEqual({
      type: "domain_event",
      domain: "appointment",
      startEvents: ["appointment.created"],
      restartEvents: [],
      stopEvents: [],
    });
  });

  test("fails closed for unknown trigger type", () => {
    expect(() =>
      referenceGraphToCanonicalGraph({
        nodes: [
          {
            id: "trigger",
            type: "trigger",
            data: {
              type: "trigger",
              config: {
                triggerType: "UnknownTrigger",
              },
            },
          },
        ],
        edges: [],
      }),
    ).toThrow(ReferenceAdapterError);
  });

  test("adapts canonical trigger/action catalog for reference UI selectors", () => {
    const canonicalCatalog: WorkflowCatalogResponse = {
      triggers: [
        {
          type: "domain_event",
          domain: "appointment",
          events: [
            "appointment.created",
            "appointment.updated",
            "appointment.cancelled",
          ],
          defaultStartEvents: ["appointment.created"],
          defaultRestartEvents: ["appointment.updated"],
          defaultStopEvents: ["appointment.cancelled"],
        },
        {
          type: "domain_event",
          domain: "client",
          events: ["client.created", "client.updated", "client.deleted"],
          defaultStartEvents: ["client.created"],
          defaultRestartEvents: ["client.updated"],
          defaultStopEvents: ["client.deleted"],
        },
        {
          type: "schedule",
          label: "Schedule",
          defaultTimezone: "America/Los_Angeles",
        },
      ],
      actions: [
        {
          id: "core.emitInternalEvent",
          label: "Emit Internal Event",
          description: "Emit a structured workflow event",
          category: "Core",
          configFields: [],
          outputFields: [],
        },
      ],
    };

    const adapted = adaptCanonicalCatalogToReferenceCatalog(canonicalCatalog);

    expect(adapted).toEqual({
      triggerTypes: [
        {
          id: "Webhook",
          label: "Webhook",
          defaultEventPath: "event",
          defaultCorrelationPath: "data.id",
          domains: [
            {
              domain: "appointment",
              startEvents: ["appointment.created"],
              restartEvents: ["appointment.updated"],
              stopEvents: ["appointment.cancelled"],
            },
            {
              domain: "client",
              startEvents: ["client.created"],
              restartEvents: ["client.updated"],
              stopEvents: ["client.deleted"],
            },
          ],
        },
        {
          id: "Schedule",
          label: "Schedule",
          defaultTimezone: "America/Los_Angeles",
        },
      ],
      actions: [
        {
          id: "core.emitInternalEvent",
          label: "Emit Internal Event",
          description: "Emit a structured workflow event",
          category: "Core",
          configFields: [],
          outputFields: [],
        },
      ],
    });
  });

  test("maps canonical run status to reference run status", () => {
    expect(mapCanonicalRunStatusToReferenceRunStatus("pending")).toBe(
      "pending",
    );
    expect(mapCanonicalRunStatusToReferenceRunStatus("running")).toBe(
      "running",
    );
    expect(mapCanonicalRunStatusToReferenceRunStatus("completed")).toBe(
      "success",
    );
    expect(mapCanonicalRunStatusToReferenceRunStatus("failed")).toBe("error");
    expect(mapCanonicalRunStatusToReferenceRunStatus("cancelled")).toBe(
      "cancelled",
    );
    expect(mapCanonicalRunStatusToReferenceRunStatus("unknown")).toBe("error");
  });
});
