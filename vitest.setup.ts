import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// vitest.config.ts doesn't enable `test.globals`, so Testing Library's
// own auto-cleanup (which detects a global `afterEach`) never registers.
// Without this, each test's render() output accumulates in `document.body`
// across tests in the same file, causing false "multiple elements found"
// query failures.
afterEach(() => {
  cleanup();
});
