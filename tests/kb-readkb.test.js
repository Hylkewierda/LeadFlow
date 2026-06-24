import { describe, it, expect, beforeEach, vi } from "vitest";

function b64(s) {
  return Buffer.from(s, "utf8").toString("base64");
}

// Routes fetch() by URL: git trees -> file list; contents -> base64 body.
function installFetch({ treeOk = true, files = {}, contentOk = true } = {}) {
  global.fetch = vi.fn(async (url) => {
    if (url.includes("/git/trees/")) {
      if (!treeOk) return { ok: false, status: 502, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tree: [
            ...Object.keys(files).map((path) => ({ type: "blob", path })),
            { type: "blob", path: "kb/actuals/notes.txt" }, // non-md, must be ignored
            { type: "tree", path: "kb/actuals" },
          ],
        }),
      };
    }
    // contents URL
    const decoded = decodeURIComponent(url);
    const path = Object.keys(files).find((p) => decoded.includes(p));
    if (!contentOk) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ content: b64(files[path] ?? "") }) };
  });
}

let fetchKbText;
beforeEach(async () => {
  vi.resetModules(); // clear the module-level cache between tests
  ({ fetchKbText } = await import("../src/lib/kb/readKb.js"));
});

describe("fetchKbText", () => {
  it("throws when pat is missing", async () => {
    installFetch();
    await expect(fetchKbText(undefined)).rejects.toThrow();
  });

  it("concatenates kb/actuals/*.md with headers, ignoring non-md", async () => {
    installFetch({ files: { "kb/actuals/icp.md": "ICP body", "kb/actuals/product.md": "Product body" } });
    const { text, truncated } = await fetchKbText("pat");
    expect(text).toContain("## kb/actuals/icp.md");
    expect(text).toContain("ICP body");
    expect(text).toContain("## kb/actuals/product.md");
    expect(text).toContain("Product body");
    expect(text).not.toContain("notes.txt");
    expect(truncated).toBe(false);
  });

  it("caps at maxChars and sets truncated", async () => {
    installFetch({ files: { "kb/actuals/big.md": "x".repeat(5000) } });
    const { text, truncated } = await fetchKbText("pat", { maxChars: 1000 });
    expect(text.length).toBe(1000);
    expect(truncated).toBe(true);
  });

  it("throws on a GitHub tree error", async () => {
    installFetch({ treeOk: false });
    await expect(fetchKbText("pat")).rejects.toThrow(/tree failed/);
  });
});
