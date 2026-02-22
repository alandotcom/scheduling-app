import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type SvixEventDefinition = {
  name: string;
  description: string;
  groupName: string;
  schemas: {
    v1: unknown;
  };
};

const createMock = mock(
  async (_eventDefinition: SvixEventDefinition) => undefined,
);
const updateMock = mock(
  async (_eventTypeName: string, _eventDefinition: SvixEventDefinition) =>
    undefined,
);
const deleteMock = mock(
  async (_eventTypeName: string, _options: { expunge: boolean }) => undefined,
);
const listMock = mock(
  async (): Promise<{
    data: Array<{ name: string; description: string }>;
    done: boolean;
    iterator?: string;
  }> => ({ data: [], done: true }),
);

mock.module("svix", () => {
  class ApiException extends Error {
    code: number;

    constructor(code: number) {
      super("svix-api-exception");
      this.code = code;
    }
  }

  class Svix {
    eventType = {
      create: createMock,
      update: updateMock,
      delete: deleteMock,
      list: listMock,
    };
  }

  return { ApiException, Svix };
});

const { config } = await import("../config.js");
const { syncSvixEventCatalog } = await import("./svix-event-catalog.js");

type WebhooksConfig = {
  enabled: boolean;
  authToken?: string;
  baseUrl?: string;
};

const mutableConfig = config as unknown as {
  webhooks: WebhooksConfig;
};

describe("syncSvixEventCatalog", () => {
  const originalWebhooksConfig: WebhooksConfig = { ...mutableConfig.webhooks };

  beforeEach(() => {
    createMock.mockClear();
    updateMock.mockClear();
    deleteMock.mockClear();
    listMock.mockClear();

    mutableConfig.webhooks.enabled = true;
    mutableConfig.webhooks.authToken = "test-token";
    delete mutableConfig.webhooks.baseUrl;

    listMock.mockResolvedValue({
      data: [
        {
          name: "appointment.created",
          description:
            "appointment.created webhook event for scheduling resources (v1 envelope).",
        },
        {
          name: "appointment.updated",
          description:
            "appointment.updated webhook event for scheduling resources (v1 envelope).",
        },
        {
          name: "appointment.deleted",
          description:
            "appointment.deleted webhook event for scheduling resources (v1 envelope).",
        },
      ],
      done: true,
    });
  });

  afterEach(() => {
    mutableConfig.webhooks = { ...originalWebhooksConfig };
  });

  test("creates only canonical appointment lifecycle events and prunes legacy aliases", async () => {
    await syncSvixEventCatalog();

    const createdEventNames = createMock.mock.calls.map(
      (call) => call[0]?.name,
    );

    expect(createdEventNames).toContain("appointment.scheduled");
    expect(createdEventNames).toContain("appointment.confirmed");
    expect(createdEventNames).toContain("appointment.rescheduled");
    expect(createdEventNames).toContain("appointment.canceled");
    expect(createdEventNames).toContain("appointment.no_show");
    expect(createdEventNames).not.toContain("appointment.created");
    expect(createdEventNames).not.toContain("appointment.updated");
    expect(createdEventNames).not.toContain("appointment.deleted");

    const deletedEventNames = deleteMock.mock.calls.map((call) => call[0]);

    expect(deletedEventNames).toContain("appointment.created");
    expect(deletedEventNames).toContain("appointment.updated");
    expect(deletedEventNames).toContain("appointment.deleted");
  });
});
