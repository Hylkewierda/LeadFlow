// Reads the live Actuals knowledge base (kb/actuals/*.md) from the
// lead-discovery-service repo via the GitHub API — the same source the qualifier
// and the KnowledgeBase editor (api/kb.js) use. Server-side only (needs GITHUB_PAT).

const REPO = "Hylkewierda/lead-discovery-service";
const BRANCH = "main";
const KB_PREFIX = "kb/actuals/";
const GH = "https://api.github.com";
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

let cache = null; // { rawText, at }

function ghHeaders(pat) {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch(url, pat) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers: ghHeaders(pat), signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function contentsUrl(path) {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  return `${GH}/repos/${REPO}/contents/${enc}?ref=${BRANCH}`;
}

/**
 * Fetch and concatenate kb/actuals/*.md. Returns { text, truncated }.
 * Caches per warm process for CACHE_TTL_MS. Throws on missing pat or GitHub error.
 */
export async function fetchKbText(pat, { maxChars = 12000 } = {}) {
  if (!pat) throw new Error("Missing GITHUB_PAT");

  let rawText;
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    rawText = cache.rawText;
  } else {
    const treeRes = await ghFetch(`${GH}/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, pat);
    if (!treeRes.ok) throw new Error(`GitHub tree failed (${treeRes.status})`);
    const tree = await treeRes.json();
    const paths = (tree.tree ?? [])
      .filter((n) => n.type === "blob" && n.path.startsWith(KB_PREFIX) && n.path.endsWith(".md"))
      .map((n) => n.path)
      .sort();

    const parts = [];
    for (const path of paths) {
      const r = await ghFetch(contentsUrl(path), pat);
      if (!r.ok) throw new Error(`GitHub read failed for ${path} (${r.status})`);
      const json = await r.json();
      const body = Buffer.from(json.content ?? "", "base64").toString("utf8");
      parts.push(`## ${path}\n${body.trim()}`);
    }
    rawText = parts.join("\n\n");
    cache = { rawText, at: Date.now() };
  }

  const truncated = rawText.length > maxChars;
  const text = truncated ? rawText.slice(0, maxChars) : rawText;
  return { text, truncated };
}
