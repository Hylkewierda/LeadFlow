import { vi } from "vitest";

// Route tests exercise handler logic, not the session check: let withAuth pass
// requests straight through. tests/auth.test.js and tests/api-auth-guard.test.js
// unmock this to test the real cookie check.
vi.mock("../api/_lib/auth.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, withAuth: (handler) => handler };
});
