import { describe, expect, test } from "bun:test";

import { resetPaginationToFirstPage } from "./settings";
import { formatWebhookPayloadPreview } from "./-settings-webhooks";

describe("settings pagination helpers", () => {
  test("keeps pagination object unchanged when already on first page", () => {
    const pagination = {
      pageIndex: 0,
      pageSize: 20,
    };

    const result = resetPaginationToFirstPage(pagination);

    expect(result).toBe(pagination);
  });

  test("resets pagination to first page while preserving page size", () => {
    const pagination = {
      pageIndex: 2,
      pageSize: 20,
    };

    const result = resetPaginationToFirstPage(pagination);

    expect(result).toEqual({
      pageIndex: 0,
      pageSize: 20,
    });
  });
});

describe("formatWebhookPayloadPreview", () => {
  test("formats object payloads as pretty JSON", () => {
    const result = formatWebhookPayloadPreview({
      eventId: "evt_1",
      nested: { ok: true },
    });

    expect(result).toBe(
      '{\n  "eventId": "evt_1",\n  "nested": {\n    "ok": true\n  }\n}',
    );
  });

  test("parses JSON strings and pretty prints them", () => {
    const result = formatWebhookPayloadPreview('{"status":"ok","count":2}');

    expect(result).toBe('{\n  "status": "ok",\n  "count": 2\n}');
  });

  test("returns raw strings when not valid JSON", () => {
    const result = formatWebhookPayloadPreview("plain-text-payload");

    expect(result).toBe("plain-text-payload");
  });

  test("returns empty string for undefined payload", () => {
    const result = formatWebhookPayloadPreview(undefined);

    expect(result).toBe("");
  });
});
