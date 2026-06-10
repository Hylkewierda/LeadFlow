// GitHub-backed Knowledge Base endpoints for the KnowledgeBase page.
// The KB is canonically the kb/actuals/ folder of the lead-discovery-service
// repo on main: every cloud run checks that repo out fresh, so a commit here
// is live on the next run without any deploy.
const REPO = "Hylkewierda/lead-discovery-service";
const BRANCH = "main";
const KB_PREFIX = "kb/actuals/";
const GH = "https://api.github.com";
const MAX_NOTE = 2000;

function ghHeaders(pat) {
  return {
    Authorization: `token ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

function isSafePath(p) {
  return (
    typeof p === "string" &&
    p.startsWith(KB_PREFIX) &&
    p.endsWith(".md") &&
    !p.includes("..") &&
    p.length > KB_PREFIX.length + 3
  );
}

// Contents-API URL; encode each segment but keep the slashes.
function contentsUrl(path) {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  return `${GH}/repos/${REPO}/contents/${enc}`;
}

async function commitFile({ pat, path, content, sha, message }) {
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };
  return fetch(contentsUrl(path), { method: "PUT", headers: ghHeaders(pat), body: JSON.stringify(body) });
}

export default async function handler(req, res) {
  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: "Missing GITHUB_PAT env var" });

  if (req.method === "GET") {
    const op = req.query?.op;

    if (op === "tree") {
      const r = await fetch(`${GH}/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, { headers: ghHeaders(pat) });
      if (!r.ok) return res.status(502).json({ error: `GitHub tree failed (${r.status})` });
      const data = await r.json();
      const files = (data.tree ?? [])
        .filter((n) => n.type === "blob" && n.path.startsWith(KB_PREFIX) && n.path.endsWith(".md"))
        .map((n) => ({ path: n.path }));
      return res.status(200).json({ files });
    }

    if (op === "file") {
      const path = req.query?.path;
      if (!isSafePath(path)) return res.status(400).json({ error: "Invalid path" });
      const r = await fetch(`${contentsUrl(path)}?ref=${BRANCH}`, { headers: ghHeaders(pat) });
      if (r.status === 404) return res.status(404).json({ error: "Not found" });
      if (!r.ok) return res.status(502).json({ error: `GitHub read failed (${r.status})` });
      const data = await r.json();
      const content = Buffer.from(data.content ?? "", "base64").toString("utf8");
      return res.status(200).json({ path, sha: data.sha, content });
    }

    return res.status(400).json({ error: "Unknown op" });
  }

  if (req.method === "PUT") {
    const { path, content, sha } = req.body ?? {};
    if (!isSafePath(path)) return res.status(400).json({ error: "Invalid path" });
    if (typeof content !== "string" || typeof sha !== "string" || !sha) {
      return res.status(400).json({ error: "content and sha are required" });
    }
    const r = await commitFile({ pat, path, content, sha, message: `kb: update ${path} via LeadFlow app` });
    if (r.status === 409 || r.status === 422) {
      return res.status(409).json({ error: "Bestand is intussen gewijzigd — herlaad en probeer opnieuw" });
    }
    if (!r.ok) return res.status(502).json({ error: `GitHub commit failed (${r.status})` });
    const data = await r.json();
    return res.status(200).json({ path, sha: data.content?.sha ?? null });
  }

  if (req.method === "POST") {
    const op = req.body?.op;

    if (op === "create") {
      const { path, content } = req.body ?? {};
      if (!isSafePath(path)) return res.status(400).json({ error: "Invalid path" });
      if (typeof content !== "string") return res.status(400).json({ error: "content is required" });
      const r = await commitFile({ pat, path, content, message: `kb: create ${path} via LeadFlow app` });
      if (r.status === 422) return res.status(409).json({ error: "Bestand bestaat al" });
      if (!r.ok) return res.status(502).json({ error: `GitHub commit failed (${r.status})` });
      const data = await r.json();
      return res.status(200).json({ path, sha: data.content?.sha ?? null });
    }

    if (op === "quick-update") {
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
      if (!note) return res.status(400).json({ error: "Notitie is leeg" });
      if (note.length > MAX_NOTE) return res.status(400).json({ error: `Notitie is te lang (max ${MAX_NOTE} tekens)` });
      const category = typeof req.body?.category === "string" && req.body.category.trim() ? ` — ${req.body.category.trim()}` : "";
      const path = `${KB_PREFIX}updates.md`;

      const cur = await fetch(`${contentsUrl(path)}?ref=${BRANCH}`, { headers: ghHeaders(pat) });
      let sha;
      let existing = "";
      if (cur.ok) {
        const d = await cur.json();
        sha = d.sha;
        existing = Buffer.from(d.content ?? "", "base64").toString("utf8");
      } else if (cur.status !== 404) {
        return res.status(502).json({ error: `GitHub read failed (${cur.status})` });
      }

      const date = new Date().toISOString().slice(0, 10);
      const head = existing.trim()
        ? `${existing.replace(/\s+$/, "")}\n\n`
        : "# Updates\n\nRecente ontwikkelingen binnen Actuals, toegevoegd vanuit de LeadFlow app.\n\n";
      const next = `${head}## ${date}${category}\n\n${note}\n`;

      const r = await commitFile({ pat, path, content: next, sha, message: "kb: snelle update via LeadFlow app" });
      if (r.status === 409 || r.status === 422) {
        return res.status(409).json({ error: "Updates-bestand is intussen gewijzigd — probeer opnieuw" });
      }
      if (!r.ok) return res.status(502).json({ error: `GitHub commit failed (${r.status})` });
      return res.status(200).json({ path, ok: true });
    }

    return res.status(400).json({ error: "Unknown op" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
