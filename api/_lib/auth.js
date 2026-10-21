import { createHmac, createHash, timingSafeEqual } from "node:crypto";

// Server-side session auth. The underscore directory keeps this out of Vercel's
// function count (Hobby: max 12 functions per deployment).
//
// AUTH_USERS  JSON array [{ "email": "...", "password": "..." }] — server env, never VITE_*.
// AUTH_SECRET random string (>= 32 chars) used to sign the session cookie.
//
// Cookie value: base64url(JSON {e: email, x: expiresAtMs}) + "." + base64url(HMAC-SHA256).
// Removing a user from AUTH_USERS revokes their sessions on the next request.

export const COOKIE_NAME = "leadflow_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET missing or shorter than 32 chars");
  return s;
}

function users() {
  try {
    const parsed = JSON.parse(process.env.AUTH_USERS || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Hash both sides first so timingSafeEqual gets equal-length buffers.
function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function normEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function verifyCredentials(email, password) {
  const e = normEmail(email);
  if (!e || typeof password !== "string") return null;
  // Check every user so timing does not reveal which emails exist.
  let match = null;
  for (const u of users()) {
    const emailOk = safeEqual(normEmail(u.email), e);
    const pwOk = safeEqual(u.password ?? "", password);
    if (emailOk && pwOk) match = { email: normEmail(u.email) };
  }
  return match;
}

export function createSessionToken(email, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ e: normEmail(email), x: now + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token, now = Date.now()) {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(payload))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof data?.e !== "string" || typeof data?.x !== "number" || data.x <= now) return null;
  if (!users().some((u) => normEmail(u.email) === data.e)) return null;
  return { email: data.e };
}

export function readCookie(req, name = COOKIE_NAME) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function getSession(req) {
  return verifySessionToken(readCookie(req));
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearedSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// Wrap a route handler: OPTIONS preflights pass, everything else needs a valid
// session cookie or gets 401. A misconfigured server (no AUTH_SECRET) fails closed.
export function withAuth(handler) {
  return async function authed(req, res) {
    if (req.method === "OPTIONS") return handler(req, res);
    let session;
    try {
      session = getSession(req);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Auth misconfigured" });
    }
    if (!session) return res.status(401).json({ error: "Niet ingelogd" });
    req.user = session;
    return handler(req, res);
  };
}
