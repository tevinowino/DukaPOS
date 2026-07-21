import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarcodeScanner } from "./BarcodeScanner";

const messages = {
  scanner: {
    starting: "Starting camera…",
    permissionDenied: "Camera access was denied. You can still add this product manually.",
    enterManually: "Enter manually",
    enterManuallyInstead: "Enter manually instead",
  },
};

function renderScanner(onDetect = vi.fn(), onManualEntry = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BarcodeScanner onDetect={onDetect} onManualEntry={onManualEntry} />
    </NextIntlClientProvider>,
  );
  return { onDetect, onManualEntry };
}

describe("BarcodeScanner", () => {
  afterEach(() => {
    // @ts-expect-error -- test-only cleanup of a property this suite defines
    delete navigator.mediaDevices;
  });

  it("shows a permission-denied message and manual-entry affordance when getUserMedia rejects, without ever calling onDetect", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")) },
      configurable: true,
    });

    const { onDetect } = renderScanner();

    expect(
      await screen.findByText(
        "Camera access was denied. You can still add this product manually.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter manually" })).toBeInTheDocument();
    expect(onDetect).not.toHaveBeenCalled();
  });
});
