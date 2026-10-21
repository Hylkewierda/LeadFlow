import { vi } from "vitest";

// Chainable PostgREST stand-in: every builder method records its call and
// returns the same query; awaiting it (or .single/.maybeSingle) resolves to
// the result configured for that table. `results[table]` may be a function of
// the recorded calls for per-request answers.
export function makeSupabaseMock(results) {
  const calls = [];
  const from = vi.fn((table) => {
    const q = { table, ops: [] };
    calls.push(q);
    const resolve = () => {
      const r = results[table];
      return Promise.resolve(typeof r === "function" ? r(q) : r ?? { data: null, error: null });
    };
    const builder = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (ok, fail) => resolve().then(ok, fail);
          if (prop === "single" || prop === "maybeSingle") {
            return () => {
              q.ops.push([prop]);
              return resolve();
            };
          }
          return (...args) => {
            q.ops.push([prop, ...args]);
            return builder;
          };
        },
      },
    );
    return builder;
  });
  return { client: { from }, from, calls };
}

export function mockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    end() {
      return this;
    },
  };
}
