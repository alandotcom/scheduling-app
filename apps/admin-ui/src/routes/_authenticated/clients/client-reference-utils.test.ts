import { describe, expect, test } from "bun:test";
import type { CreateClientInput } from "@scheduling/dto";
import {
  buildClientDetailDescription,
  sanitizeClientMutationInput,
} from "@/routes/_authenticated/clients/client-reference-utils";

describe("buildClientDetailDescription", () => {
  test("includes email and reference ID when both are present", () => {
    const result = buildClientDetailDescription({
      email: "john@example.com",
      formattedPhone: null,
      referenceId: "EXT-123",
    });

    expect(result).toBe("john@example.com • EXT-123");
  });

  test("includes phone and reference ID when email is missing", () => {
    const result = buildClientDetailDescription({
      email: null,
      formattedPhone: "(555) 111-2222",
      referenceId: "EXT-123",
    });

    expect(result).toBe("(555) 111-2222 • EXT-123");
  });

  test("shows reference ID only when no primary contact exists", () => {
    const result = buildClientDetailDescription({
      email: null,
      formattedPhone: null,
      referenceId: "EXT-123",
    });

    expect(result).toBe("EXT-123");
  });

  test("preserves existing behavior when reference ID is not present", () => {
    const withEmail = buildClientDetailDescription({
      email: "john@example.com",
      formattedPhone: "(555) 111-2222",
      referenceId: null,
    });
    const withPhone = buildClientDetailDescription({
      email: null,
      formattedPhone: "(555) 111-2222",
      referenceId: null,
    });
    const withNeither = buildClientDetailDescription({
      email: null,
      formattedPhone: null,
      referenceId: null,
    });

    expect(withEmail).toBe("john@example.com");
    expect(withPhone).toBe("(555) 111-2222");
    expect(withNeither).toBeUndefined();
  });
});

describe("sanitizeClientMutationInput", () => {
  test("removes injected referenceId from client create/update payloads", () => {
    const input: CreateClientInput = {
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      phone: "+15551112222",
      phoneCountry: "US",
      referenceId: "INJECTED-REF",
      customAttributes: {
        vip: true,
      },
    };

    const result = sanitizeClientMutationInput(input);

    expect("referenceId" in result).toBe(false);
    expect(result).toEqual({
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      phone: "+15551112222",
      phoneCountry: "US",
      customAttributes: {
        vip: true,
      },
    });
  });
});
