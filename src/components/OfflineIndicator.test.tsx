import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineIndicator } from "./OfflineIndicator";
import type { SyncStatus } from "@/lib/sync/useOnlineSync";

const messages = {
  offlineIndicator: {
    offlineBadge: "You're offline — changes are saved on this device",
  },
};

function renderIndicator(status: SyncStatus) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OfflineIndicator status={status} />
    </NextIntlClientProvider>,
  );
}

describe("OfflineIndicator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the offline badge immediately when already offline at mount", () => {
    renderIndicator("offline");

    expect(screen.getByRole("status")).toHaveTextContent(
      "You're offline — changes are saved on this device",
    );
  });

  it("renders nothing when the sync status is online (idle/synced/syncing/failed) at mount", () => {
    renderIndicator("idle");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("debounces a mid-session online-to-offline transition instead of flipping instantly", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { rerender } = renderIndicator("idle");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OfflineIndicator status="offline" />
      </NextIntlClientProvider>,
    );

    // Still within the 1500ms debounce window — the badge must not have flipped on yet.
    // Timer advancement must be wrapped in `act()`: the `setTimeout` callback
    // calls `setDebouncedOffline` outside of React's normal event/commit
    // cycle, so without `act()` the state update is scheduled but never
    // flushed to the DOM before the test's next assertion reads it.
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(screen.getByRole("status")).toHaveTextContent(
      "You're offline — changes are saved on this device",
    );
  });
});
