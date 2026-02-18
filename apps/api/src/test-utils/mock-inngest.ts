import { mock } from "bun:test";
import { domainEventInngest, inngest } from "../inngest/client.js";

function getEventDescriptor(payload: unknown): string {
  if (Array.isArray(payload)) {
    return getEventDescriptor(payload[0]);
  }

  if (!payload || typeof payload !== "object") {
    return "unknown event payload";
  }

  const record = payload as Record<string, unknown>;
  const nameValue = record["name"];
  const name =
    typeof nameValue === "string" && nameValue.length > 0
      ? nameValue
      : "unknown-name";
  const idValue = record["id"];
  const id =
    typeof idValue === "string" && idValue.length > 0 ? idValue : "unknown-id";

  return `${name} (${id})`;
}

function createUnexpectedSendMock(clientName: string) {
  return mock(async (payload: unknown) => {
    throw new Error(
      [
        `[tests] Unexpected ${clientName}.send() call: ${getEventDescriptor(payload)}.`,
        "Inject a requester dependency in the service under test or override client.send in this test.",
      ].join(" "),
    );
  });
}

const domainEventSendMock = createUnexpectedSendMock("domainEventInngest");
const inngestSendMock = createUnexpectedSendMock("inngest");

(
  domainEventInngest as unknown as {
    send: typeof domainEventInngest.send;
  }
).send = domainEventSendMock as typeof domainEventInngest.send;

(
  inngest as unknown as {
    send: typeof inngest.send;
  }
).send = inngestSendMock as typeof inngest.send;

export { domainEventSendMock, inngestSendMock };
