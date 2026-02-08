import { describe, expect, test } from "bun:test";
import { getSafeRedirectHref, validateLoginSearch } from "./auth-redirect";

describe("validateLoginSearch", () => {
  test("accepts redirect when it is a string", () => {
    expect(
      validateLoginSearch({
        redirect: "http://localhost:5173/appointments?view=week#today",
      }),
    ).toEqual({
      redirect: "http://localhost:5173/appointments?view=week#today",
    });
  });

  test("drops redirect when it is not a string", () => {
    expect(validateLoginSearch({ redirect: 123 })).toEqual({});
  });
});

describe("getSafeRedirectHref", () => {
  const origin = "http://localhost:5173";

  test("returns / when redirect is missing", () => {
    expect(getSafeRedirectHref(undefined, origin)).toBe("/");
  });

  test("keeps same-origin absolute redirects with query/hash", () => {
    expect(
      getSafeRedirectHref(
        "http://localhost:5173/appointments?view=week#today",
        origin,
      ),
    ).toBe("/appointments?view=week#today");
  });

  test("keeps same-origin relative redirects with query/hash", () => {
    expect(getSafeRedirectHref("/clients?tab=history#notes", origin)).toBe(
      "/clients?tab=history#notes",
    );
  });

  test("rejects external redirects", () => {
    expect(getSafeRedirectHref("https://evil.example/path", origin)).toBe("/");
  });

  test("rejects malformed redirects", () => {
    expect(getSafeRedirectHref("http://%zz", origin)).toBe("/");
  });

  test("rejects redirects back to login", () => {
    expect(getSafeRedirectHref("/login?redirect=/appointments", origin)).toBe(
      "/",
    );
  });
});
