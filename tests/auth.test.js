import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockRes } from "./helpers/supabase-mock.js";

vi.unmock("../api/_lib/auth.js");

const auth = await import("../api/_lib/auth.js");
const session = (await import("../api/session.js")).default;

const SECRET = "s".repeat(40);

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  process.env.AUTH_USERS = JSON.stringify([{ email: "Jan@Actuals.io", password: "pw-1" }]);
});

function cookieFrom(res) {
  return res.headers["Set-Cookie"].split(";")[0];
}

describe("credentials", () => {
  it("accepts the right email (case-insensitive) + password", () => {
    expect(auth.verifyCredentials(" jan@actuals.io ", "pw-1")).toEqual({ email: "jan@actuals.io" });
  });

  it("rejects a wrong password, an unknown email and non-string input", () => {
    expect(auth.verifyCredentials("jan@actuals.io", "pw-2")).toBeNull();
    expect(auth.verifyCredentials("x@actuals.io", "pw-1")).toBeNull();
    expect(auth.verifyCredentials("jan@actuals.io", undefined)).toBeNull();
  });

  it("treats a malformed AUTH_USERS as no users", () => {
    process.env.AUTH_USERS = "not json";
    expect(auth.verifyCredentials("jan@actuals.io", "pw-1")).toBeNull();
  });
});

describe("session tokens", () => {
  it("round-trips a valid token", () => {
    const t = auth.createSessionToken("jan@actuals.io", 1000);
    expect(auth.verifySessionToken(t, 2000)).toEqual({ email: "jan@actuals.io" });
  });

  it("rejects a tampered payload or signature", () => {
    const t = auth.createSessionToken("jan@actuals.io");
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ e: "jan@actuals.io", x: Date.now() + 1e12 })).toString("base64url");
    expect(auth.verifySessionToken(`${forged}.${sig}`)).toBeNull();
    expect(auth.verifySessionToken(`${payload}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(auth.verifySessionToken("garbage")).toBeNull();
  });

  it("rejects an expired token", () => {
    const t = auth.createSessionToken("jan@actuals.io", 0);
    expect(auth.verifySessionToken(t, auth.SESSION_TTL_MS + 1)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const t = auth.createSessionToken("jan@actuals.io");
    process.env.AUTH_SECRET = "o".repeat(40);
    expect(auth.verifySessionToken(t)).toBeNull();
  });

  it("revokes the session when the user is removed from AUTH_USERS", () => {
    const t = auth.createSessionToken("jan@actuals.io");
    process.env.AUTH_USERS = "[]";
    expect(auth.verifySessionToken(t)).toBeNull();
  });

  it("refuses to sign without a long enough AUTH_SECRET", () => {
    process.env.AUTH_SECRET = "short";
    expect(() => auth.createSessionToken("jan@actuals.io")).toThrow(/AUTH_SECRET/);
  });
});

describe("/api/session", () => {
  it("POST with valid credentials sets an HttpOnly, Secure, SameSite cookie", async () => {
    const res = mockRes();
    await session({ method: "POST", body: { email: "jan@actuals.io", password: "pw-1" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ user: { email: "jan@actuals.io" } });
    const cookie = res.headers["Set-Cookie"];
    expect(cookie).toMatch(/^leadflow_session=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("POST with a wrong password returns 401 and no cookie", async () => {
    const res = mockRes();
    await session({ method: "POST", body: { email: "jan@actuals.io", password: "nope" } }, res);
    expect(res.statusCode).toBe(401);
    expect(res.headers["Set-Cookie"]).toBeUndefined();
  });

  it("GET reports the user for a valid cookie and 401 without one", async () => {
    const login = mockRes();
    await session({ method: "POST", body: { email: "jan@actuals.io", password: "pw-1" } }, login);
    const ok = mockRes();
    await session({ method: "GET", headers: { cookie: `other=1; ${cookieFrom(login)}` } }, ok);
    expect(ok.body).toEqual({ user: { email: "jan@actuals.io" } });

    const anon = mockRes();
    await session({ method: "GET", headers: {} }, anon);
    expect(anon.statusCode).toBe(401);
  });

  it("DELETE clears the cookie", async () => {
    const res = mockRes();
    await session({ method: "DELETE" }, res);
    expect(res.headers["Set-Cookie"]).toContain("Max-Age=0");
  });
});
