import { describe, it, expect, beforeAll, vi } from "vitest";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mockRes } from "./helpers/supabase-mock.js";

// Every function in api/ (except the login route itself) must refuse a request
// without a valid session cookie — this is the regression guard for the
// unauthenticated-API finding of 2026-10-21.

vi.unmock("../api/_lib/auth.js");

// If a request ever slipped past the guard, the handler would hit this and the
// test would see a non-401 status instead of a database call.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    throw new Error("handler reached the database without a session");
  },
}));

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "../api");
const routes = readdirSync(apiDir).filter((f) => f.endsWith(".js") && f !== "session.js");

const { createSessionToken, COOKIE_NAME } = await import("../api/_lib/auth.js");

beforeAll(() => {
  process.env.AUTH_SECRET = "s".repeat(40);
  process.env.AUTH_USERS = JSON.stringify([{ email: "jan@actuals.io", password: "pw" }]);
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
});

describe("API auth guard", () => {
  it("covers every route file", () => {
    expect(routes.length).toBeGreaterThanOrEqual(11);
  });

  for (const file of routes) {
    describe(file, () => {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        it(`${method} without a cookie → 401`, async () => {
          const handler = (await import(`../api/${file}`)).default;
          const res = mockRes();
          await handler({ method, query: {}, body: {}, headers: {} }, res);
          expect(res.statusCode).toBe(401);
        });
      }

      it("a forged cookie → 401", async () => {
        const handler = (await import(`../api/${file}`)).default;
        const res = mockRes();
        await handler({ method: "GET", query: {}, headers: { cookie: `${COOKIE_NAME}=abc.def` } }, res);
        expect(res.statusCode).toBe(401);
      });

      it("a valid cookie gets past the guard", async () => {
        const handler = (await import(`../api/${file}`)).default;
        const res = mockRes();
        const cookie = `${COOKIE_NAME}=${encodeURIComponent(createSessionToken("jan@actuals.io"))}`;
        try {
          await handler({ method: "GET", query: {}, body: {}, headers: { cookie } }, res);
        } catch {
          // Reaching the (mocked, throwing) database is exactly "past the guard".
        }
        expect(res.statusCode).not.toBe(401);
      });
    });
  }
});
