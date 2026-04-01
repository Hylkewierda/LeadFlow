import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const API_KEY = process.env.WORKFLOW_API_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, api_key");

  if (req.method === "OPTIONS") return res.status(200).end();

  // POST — n8n meldt dat workflow klaar is
  if (req.method === "POST") {
    const apiKey = req.headers.api_key || req.body?.api_key;
    if (!API_KEY || apiKey !== API_KEY) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const { workflow_name, status } = req.body;
    if (!workflow_name || !status) {
      return res.status(400).json({ error: "Missing workflow_name or status" });
    }

    const key = `workflow:${workflow_name}`;
    await redis.set(key, { status, completed_at: Date.now() }, { ex: 3600 });

    return res.status(200).json({ ok: true });
  }

  // GET — frontend pollt of workflow klaar is
  if (req.method === "GET") {
    const { workflow_name } = req.query;
    if (!workflow_name) {
      return res.status(400).json({ error: "Missing workflow_name" });
    }

    const key = `workflow:${workflow_name}`;
    const data = await redis.get(key);

    return res.status(200).json(data || { status: "running" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
