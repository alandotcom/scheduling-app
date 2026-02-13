import { describe, expect, test } from "bun:test";

import { filterApiKeys, resetPaginationToFirstPage } from "./settings";
import { formatWebhookPayloadPreview } from "@/components/settings/webhooks/utils/format-webhook-payload-preview";

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

describe("filterApiKeys", () => {
  const apiKeys = [
    { name: "Cloudflare", scope: "owner", start: "re_XNLYaE1x", prefix: "re_" },
    { name: "Zapier", scope: "admin", start: null, prefix: "re_" },
    { name: "Donor app", scope: "member", start: "re_VTB7WY2Y", prefix: "re_" },
  ] as const;

  test("returns all keys when query is empty and permission is all", () => {
    const result = filterApiKeys(apiKeys, {
      searchQuery: "",
      permissionFilter: "all",
    });

    expect(result).toEqual([...apiKeys]);
  });

  test("filters keys by search query across name and token fields", () => {
    const byName = filterApiKeys(apiKeys, {
      searchQuery: "zap",
      permissionFilter: "all",
    });
    const byToken = filterApiKeys(apiKeys, {
      searchQuery: "vtb7w",
      permissionFilter: "all",
    });

    expect(byName).toEqual([apiKeys[1]]);
    expect(byToken).toEqual([apiKeys[2]]);
  });

  test("filters keys by permission", () => {
    const result = filterApiKeys(apiKeys, {
      searchQuery: "",
      permissionFilter: "admin",
    });

    expect(result).toEqual([apiKeys[1]]);
  });

  test("applies query and permission filters together", () => {
    const result = filterApiKeys(apiKeys, {
      searchQuery: "re_",
      permissionFilter: "owner",
    });

    expect(result).toEqual([apiKeys[0]]);
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
