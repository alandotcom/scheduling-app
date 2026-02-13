import { describe, expect, test } from "bun:test";
import { processTemplates, type NodeOutputs } from "./templates";

describe("processTemplates", () => {
  test("replaces a basic template variable", () => {
    const outputs: NodeOutputs = {
      trigger: { label: "Trigger", data: { email: "user@example.com" } },
    };
    const result = processTemplates(
      { to: "{{@trigger:Trigger.email}}" },
      outputs,
    );
    expect(result["to"]).toBe("user@example.com");
  });

  test("replaces nested field access", () => {
    const outputs: NodeOutputs = {
      node1: {
        label: "Fetch Client",
        data: { client: { address: { city: "Portland" } } },
      },
    };
    const result = processTemplates(
      { city: "{{@node1:Fetch Client.client.address.city}}" },
      outputs,
    );
    expect(result["city"]).toBe("Portland");
  });

  test("auto-unwraps standardized { success, data, error } output", () => {
    const outputs: NodeOutputs = {
      send_email: {
        label: "Send Email",
        data: { success: true, data: { messageId: "msg_123" }, error: null },
      },
    };
    const result = processTemplates(
      { id: "{{@send_email:Send Email.messageId}}" },
      outputs,
    );
    expect(result["id"]).toBe("msg_123");
  });

  test("does not auto-unwrap when accessing success/data/error directly", () => {
    const outputs: NodeOutputs = {
      node1: {
        label: "Node",
        data: { success: true, data: { value: 42 }, error: null },
      },
    };
    expect(
      processTemplates({ v: "{{@node1:Node.success}}" }, outputs)["v"],
    ).toBe("true");
    expect(processTemplates({ v: "{{@node1:Node.data}}" }, outputs)["v"]).toBe(
      JSON.stringify({ value: 42 }),
    );
    expect(processTemplates({ v: "{{@node1:Node.error}}" }, outputs)["v"]).toBe(
      "",
    );
  });

  test("returns original template when node is missing", () => {
    const result = processTemplates({ to: "{{@missing:Missing.email}}" }, {});
    expect(result["to"]).toBe("{{@missing:Missing.email}}");
  });

  test("returns empty string when field is missing from output", () => {
    const outputs: NodeOutputs = {
      node1: { label: "Node", data: { name: "Alice" } },
    };
    const result = processTemplates(
      { v: "{{@node1:Node.nonexistent}}" },
      outputs,
    );
    expect(result["v"]).toBe("");
  });

  test("returns empty string when output data is null", () => {
    const outputs: NodeOutputs = {
      node1: { label: "Node", data: null },
    };
    const result = processTemplates({ v: "{{@node1:Node.field}}" }, outputs);
    expect(result["v"]).toBe("");
  });

  test("passes through non-string values unchanged", () => {
    const outputs: NodeOutputs = {
      trigger: { label: "Trigger", data: { count: 5 } },
    };
    const result = processTemplates(
      { count: 42, enabled: true, tags: ["a", "b"] },
      outputs,
    );
    expect(result["count"]).toBe(42);
    expect(result["enabled"]).toBe(true);
    expect(result["tags"]).toEqual(["a", "b"]);
  });

  test("replaces multiple templates in one string", () => {
    const outputs: NodeOutputs = {
      trigger: {
        label: "Trigger",
        data: { firstName: "Alice", lastName: "Smith" },
      },
    };
    const result = processTemplates(
      {
        greeting:
          "Hello {{@trigger:Trigger.firstName}} {{@trigger:Trigger.lastName}}!",
      },
      outputs,
    );
    expect(result["greeting"]).toBe("Hello Alice Smith!");
  });

  test("sanitizes node IDs with special characters", () => {
    const outputs: NodeOutputs = {
      node_1_abc: { label: "Node", data: { value: "found" } },
    };
    // nodeId "node-1-abc" gets sanitized to "node_1_abc"
    const result = processTemplates(
      { v: "{{@node-1-abc:Node.value}}" },
      outputs,
    );
    expect(result["v"]).toBe("found");
  });

  test("returns entire output data when no field path", () => {
    const outputs: NodeOutputs = {
      node1: { label: "Node", data: { a: 1, b: 2 } },
    };
    const result = processTemplates({ v: "{{@node1:Node}}" }, outputs);
    expect(result["v"]).toBe(JSON.stringify({ a: 1, b: 2 }));
  });

  test("JSON-stringifies object field values", () => {
    const outputs: NodeOutputs = {
      node1: { label: "Node", data: { nested: { x: 1, y: 2 } } },
    };
    const result = processTemplates({ v: "{{@node1:Node.nested}}" }, outputs);
    expect(result["v"]).toBe(JSON.stringify({ x: 1, y: 2 }));
  });

  test("handles numeric field values as strings in template", () => {
    const outputs: NodeOutputs = {
      node1: { label: "Node", data: { count: 42 } },
    };
    const result = processTemplates(
      { v: "Total: {{@node1:Node.count}} items" },
      outputs,
    );
    expect(result["v"]).toBe("Total: 42 items");
  });
});
