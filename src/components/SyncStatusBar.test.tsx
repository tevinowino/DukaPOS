import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { SyncStatusBar } from "./SyncStatusBar";

const messages = {
  sync: {
    offline: "Offline — changes will sync when you're back online",
    syncing: "Syncing…",
    failed: "Sync failed — will retry",
    lastSynced: "Last synced at {time}",
    idle: "Up to date",
    syncNowButton: "Sync now",
  },
};

function renderBar(props: {
  status: "idle" | "syncing" | "synced" | "failed" | "offline";
  lastSyncedAt: number | null;
  syncNow?: () => void;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SyncStatusBar
        status={props.status}
        lastSyncedAt={props.lastSyncedAt}
        syncNow={props.syncNow ?? vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe("SyncStatusBar", () => {
  it("shows the offline message when status is offline", () => {
    renderBar({ status: "offline", lastSyncedAt: null });
    expect(screen.getByText("Offline — changes will sync when you're back online")).toBeInTheDocument();
  });

  it("shows a syncing message while status is syncing", () => {
    renderBar({ status: "syncing", lastSyncedAt: null });
    expect(screen.getByText("Syncing…")).toBeInTheDocument();
  });

  it("shows a failed message when status is failed", () => {
    renderBar({ status: "failed", lastSyncedAt: null });
    expect(screen.getByText("Sync failed — will retry")).toBeInTheDocument();
  });

  it("shows the last-synced time when status is synced with a timestamp", () => {
    const fixedTime = new Date("2026-01-01T14:30:00").getTime();
    renderBar({ status: "synced", lastSyncedAt: fixedTime });
    expect(screen.getByText(/Last synced at/)).toBeInTheDocument();
  });

  it("falls back to the idle message when status is idle (or synced with no timestamp yet)", () => {
    renderBar({ status: "idle", lastSyncedAt: null });
    expect(screen.getByText("Up to date")).toBeInTheDocument();
  });

  it("calls syncNow when the Sync now button is clicked", async () => {
    const syncNow = vi.fn();
    const user = userEvent.setup();
    renderBar({ status: "idle", lastSyncedAt: null, syncNow });

    await user.click(screen.getByRole("button", { name: "Sync now" }));

    expect(syncNow).toHaveBeenCalledTimes(1);
  });
});
