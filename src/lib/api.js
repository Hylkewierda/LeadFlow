// Same-origin JSON helpers for the API routes. The session cookie is HttpOnly
// and sent automatically on same-origin requests; the browser never holds a
// Supabase key.

async function parse(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function getJSON(url) {
  return fetch(url).then(parse);
}

export function sendJSON(url, method, body) {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(parse);
}
