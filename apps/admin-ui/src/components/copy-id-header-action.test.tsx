/// <reference lib="dom" />

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { CopyIdHeaderAction } from "@/components/copy-id-header-action";

const originalToastSuccess = toast.success;
const originalToastError = toast.error;
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

afterEach(() => {
  cleanup();

  Object.assign(toast, {
    success: originalToastSuccess,
    error: originalToastError,
  });

  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    delete (navigator as { clipboard?: unknown }).clipboard;
  }
});

beforeEach(() => {
  const successSpy = mock((..._args: Parameters<typeof toast.success>) => 1);
  const errorSpy = mock((..._args: Parameters<typeof toast.error>) => 1);

  Object.assign(toast, {
    success: successSpy,
    error: errorSpy,
  });
});

describe("CopyIdHeaderAction", () => {
  test("copies raw id and uses inline success state without success toast", async () => {
    const writeText = mock((_value: string) => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const view = render(
      <CopyIdHeaderAction
        id="018f3f7e-4c83-7e95-8df4-10ccf0f44f45"
        entityLabel="client"
      />,
    );

    const button = view.getByRole("button", { name: "Copy client ID" });
    expect(button.getAttribute("title")).toBe("Copy ID");
    fireEvent.click(button);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "018f3f7e-4c83-7e95-8df4-10ccf0f44f45",
      );
    });
    expect(toast.success).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(button.getAttribute("aria-label")).toBe("Copied client ID");
    });

    await waitFor(
      () => {
        expect(button.getAttribute("aria-label")).toBe("Copy client ID");
      },
      { timeout: 2500 },
    );
  });

  test("shows error feedback when clipboard write fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: mock((_value: string) =>
          Promise.reject(new Error("Permission denied")),
        ),
      },
    });

    const view = render(
      <CopyIdHeaderAction
        id="018f3f7e-4c83-7e95-8df4-10ccf0f44f45"
        entityLabel="appointment"
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Copy appointment ID" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not copy ID");
    });
  });
});
