import { describe, expect, test } from "bun:test";
import {
  isRelationWriteContentionError,
  isUniqueConstraintViolation,
} from "./db-errors.js";

describe("db-errors", () => {
  test("detects unique violations from root error code", () => {
    expect(isUniqueConstraintViolation({ code: "23505" })).toBe(true);
  });

  test("detects unique violations from nested cause code", () => {
    expect(isUniqueConstraintViolation({ cause: { code: "23505" } })).toBe(
      true,
    );
  });

  test("detects relation write contention from lock timeout", () => {
    expect(isRelationWriteContentionError({ code: "55P03" })).toBe(true);
  });

  test("detects relation write contention from deadlock", () => {
    expect(isRelationWriteContentionError({ cause: { errno: "40P01" } })).toBe(
      true,
    );
  });

  test("ignores unrelated database errors", () => {
    expect(isRelationWriteContentionError({ code: "23503" })).toBe(false);
  });
});
