import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineIndicator } from "./OfflineIndicator";
import { useOnlineSync, type UseOnlineSyncResult } from "@/lib/sync/useOnlineSync";

vi.mock("@/lib/sync/useOnlineSync", () => ({
  useOnlineSync: vi.fn(),
}));

const messages = {
  offlineIndicator: {
    offlineBadge: "You're offline — changes are saved on this device",
  },
};

function mockSyncStatus(status: UseOnlineSyncResult["status"]) {
  vi.mocked(useOnlineSync).mockReturnValue({ status, lastSyncedAt: null, syncNow: vi.fn() });
}

function renderIndicator() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OfflineIndicator />
    </NextIntlClientProvider>,
  );
}

describe("OfflineIndicator", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows the offline badge immediately when already offline at mount", () => {
    mockSyncStatus("offline");

    renderIndicator();

    expect(screen.getByRole("status")).toHaveTextContent(
      "You're offline — changes are saved on this device",
    );
  });

  it("renders nothing when the sync status is online (idle/synced/syncing/failed) at mount", () => {
    mockSyncStatus("idle");

    renderIndicator();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("debounces a mid-session online-to-offline transition instead of flipping instantly", async () => {
    mockSyncStatus("idle");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { rerender } = renderIndicator();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    mockSyncStatus("offline");
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OfflineIndicator />
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
