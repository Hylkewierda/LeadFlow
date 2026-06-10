import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchCalls = [];
let fetchResponses = [];
const fetchMock = vi.fn(async (url, opts) => {
  fetchCalls.push({ url, opts });
  const next = fetchResponses.shift() ?? { status: 200, body: {} };
  return {
    ok: next.status >= 200 && next.status < 300,
    status: next.status,
    json: async () => next.body,
    text: async () => JSON.stringify(next.body),
  };
});
vi.stubGlobal("fetch", fetchMock);

let handler;
beforeEach(async () => {
  fetchCalls.length = 0;
  fetchResponses = [];
  process.env.GITHUB_PAT = "ghp_test";
  handler = (await import("../api/kb.js")).default;
});

function makeReqRes(method, body, query = {}) {
  const res = {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
  return [{ method, body, query }, res];
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

describe("GET /api/kb", () => {
  it("op=tree returns only kb/actuals markdown files", async () => {
    fetchResponses = [{ status: 200, body: { tree: [
      { path: "kb/actuals/icp.md", type: "blob" },
      { path: "kb/actuals/MOCs/MOC - Product.md", type: "blob" },
      { path: "src/index.ts", type: "blob" },
      { path: "kb/actuals/raw", type: "tree" },
      { path: "kb/actuals/.gitignore", type: "blob" },
    ] } }];
    const [req, res] = makeReqRes("GET", null, { op: "tree" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.files.map((f) => f.path)).toEqual(["kb/actuals/icp.md", "kb/actuals/MOCs/MOC - Product.md"]);
  });

  it("op=file decodes content and returns sha; rejects unsafe paths", async () => {
    fetchResponses = [{ status: 200, body: { sha: "abc", content: b64("# ICP") } }];
    const [req, res] = makeReqRes("GET", null, { op: "file", path: "kb/actuals/icp.md" });
    await handler(req, res);
    expect(res.body).toEqual({ path: "kb/actuals/icp.md", sha: "abc", content: "# ICP" });
    expect(fetchCalls[0].url).toBe("https://api.github.com/repos/Hylkewierda/lead-discovery-service/contents/kb/actuals/icp.md?ref=main");

    const [req2, res2] = makeReqRes("GET", null, { op: "file", path: "kb/actuals/../../secrets.md" });
    await handler(req2, res2);
    expect(res2.statusCode).toBe(400);
    const [req3, res3] = makeReqRes("GET", null, { op: "file", path: "src/index.ts" });
    await handler(req3, res3);
    expect(res3.statusCode).toBe(400);
  });

  it("op=file percent-encodes segments but keeps slashes", async () => {
    fetchResponses = [{ status: 200, body: { sha: "m1", content: b64("# MOC") } }];
    const [req, res] = makeReqRes("GET", null, { op: "file", path: "kb/actuals/MOCs/MOC - Product.md" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(fetchCalls[0].url).toBe("https://api.github.com/repos/Hylkewierda/lead-discovery-service/contents/kb/actuals/MOCs/MOC%20-%20Product.md?ref=main");
  });
});

describe("PUT /api/kb", () => {
  it("commits the update with sha and maps GitHub 409 to 409", async () => {
    fetchResponses = [{ status: 200, body: { content: { sha: "new" } } }];
    const [req, res] = makeReqRes("PUT", { path: "kb/actuals/icp.md", content: "# ICP v2", sha: "abc" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const sent = JSON.parse(fetchCalls[0].opts.body);
    expect(sent.sha).toBe("abc");
    expect(sent.branch).toBe("main");
    expect(Buffer.from(sent.content, "base64").toString("utf8")).toBe("# ICP v2");
    expect(sent.message).toMatch(/icp\.md/);

    fetchResponses = [{ status: 409, body: {} }];
    const [req2, res2] = makeReqRes("PUT", { path: "kb/actuals/icp.md", content: "x", sha: "stale" });
    await handler(req2, res2);
    expect(res2.statusCode).toBe(409);
  });
});

describe("POST /api/kb", () => {
  it("op=create writes a new file without sha", async () => {
    fetchResponses = [{ status: 201, body: { content: { sha: "n1" } } }];
    const [req, res] = makeReqRes("POST", { op: "create", path: "kb/actuals/nieuw.md", content: "# Nieuw" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(fetchCalls[0].opts.body).sha).toBeUndefined();
  });

  it("op=quick-update appends a dated section to existing updates.md", async () => {
    fetchResponses = [
      { status: 200, body: { sha: "u1", content: b64("# Updates\n\n## 2026-06-01\n\nOud.\n") } },
      { status: 200, body: { content: { sha: "u2" } } },
    ];
    const [req, res] = makeReqRes("POST", { op: "quick-update", note: "Nieuwe PSP-connector live.", category: "Product" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const sent = JSON.parse(fetchCalls[1].opts.body);
    const written = Buffer.from(sent.content, "base64").toString("utf8");
    expect(written).toContain("## 2026-06-01");
    expect(written).toMatch(/## \d{4}-\d{2}-\d{2} — Product\n\nNieuwe PSP-connector live\./);
    expect(sent.sha).toBe("u1");
  });

  it("op=quick-update creates updates.md when it does not exist yet", async () => {
    fetchResponses = [
      { status: 404, body: {} },
      { status: 201, body: { content: { sha: "u1" } } },
    ];
    const [req, res] = makeReqRes("POST", { op: "quick-update", note: "Eerste notitie" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const sent = JSON.parse(fetchCalls[1].opts.body);
    expect(sent.sha).toBeUndefined();
    expect(Buffer.from(sent.content, "base64").toString("utf8")).toContain("Eerste notitie");
  });

  it("rejects an empty note", async () => {
    const [req, res] = makeReqRes("POST", { op: "quick-update", note: "  " });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});
