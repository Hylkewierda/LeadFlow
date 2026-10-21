import {
  verifyCredentials,
  createSessionToken,
  getSession,
  sessionCookie,
  clearedSessionCookie,
} from "./_lib/auth.js";

// GET    → { user } when the session cookie is valid, else 401
// POST   { email, password } → sets the HttpOnly session cookie
// DELETE → clears the cookie (logout)
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const session = getSession(req);
      if (!session) return res.status(401).json({ error: "Niet ingelogd" });
      return res.status(200).json({ user: session });
    }

    if (req.method === "POST") {
      const { email, password } = req.body || {};
      const user = verifyCredentials(email, password);
      if (!user) return res.status(401).json({ error: "Ongeldige inloggegevens" });
      res.setHeader("Set-Cookie", sessionCookie(createSessionToken(user.email)));
      return res.status(200).json({ user });
    }

    if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", clearedSessionCookie());
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Auth error" });
  }
}
