import { describe, expect, test } from "bun:test";

import { resetPaginationToFirstPage } from "./settings";

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
