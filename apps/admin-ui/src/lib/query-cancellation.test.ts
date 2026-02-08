import { CancelledError } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";
import {
  isActiveOrganizationRequiredError,
  isAuthenticationRequiredError,
  isIgnorableRouteLoaderError,
  isQueryCancelledError,
  swallowIgnorableRouteLoaderError,
} from "./query-cancellation";

describe("query cancellation helpers", () => {
  test("detects tanstack cancelled errors", () => {
    const error = new CancelledError();
    expect(isQueryCancelledError(error)).toBe(true);
    expect(isIgnorableRouteLoaderError(error)).toBe(true);
  });

  test("detects active organization required errors", () => {
    const error = new Error("UNAUTHORIZED: Active organization required");
    expect(isActiveOrganizationRequiredError(error)).toBe(true);
    expect(isIgnorableRouteLoaderError(error)).toBe(true);
  });

  test("does not classify unrelated errors as ignorable", () => {
    const error = new Error("Network timeout");
    expect(isQueryCancelledError(error)).toBe(false);
    expect(isActiveOrganizationRequiredError(error)).toBe(false);
    expect(isAuthenticationRequiredError(error)).toBe(false);
    expect(isIgnorableRouteLoaderError(error)).toBe(false);
  });

  test("detects authentication required errors", () => {
    const error = new Error("UNAUTHORIZED: Authentication required");
    expect(isAuthenticationRequiredError(error)).toBe(true);
    expect(isIgnorableRouteLoaderError(error)).toBe(true);
  });

  test("swallows cancellation errors", async () => {
    await expect(
      swallowIgnorableRouteLoaderError(Promise.reject(new CancelledError())),
    ).resolves.toBeUndefined();
  });

  test("swallows active organization required errors", async () => {
    await expect(
      swallowIgnorableRouteLoaderError(
        Promise.reject(new Error("Active organization required")),
      ),
    ).resolves.toBeUndefined();
  });

  test("swallows authentication required errors", async () => {
    await expect(
      swallowIgnorableRouteLoaderError(
        Promise.reject(new Error("Authentication required")),
      ),
    ).resolves.toBeUndefined();
  });

  test("rethrows non-ignorable errors", async () => {
    await expect(
      swallowIgnorableRouteLoaderError(Promise.reject(new Error("Boom"))),
    ).rejects.toThrow("Boom");
  });
});
