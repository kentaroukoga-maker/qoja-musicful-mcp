import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json());

const MUSICFUL_BASE_URL = process.env.MUSICFUL_BASE_URL || "https://api.musicful.ai";
const MUSICFUL_API_KEY = process.env.MUSICFUL_API_KEY;

async function musicful(path, options = {}) {
  if (!MUSICFUL_API_KEY) throw new Error("MUSICFUL_API_KEY is not configured");
  const response = await fetch(`${MUSICFUL_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": MUSICFUL_API_KEY,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Musicful ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function makeServer() {
  const server = new McpServer({ name: "QOJA Musicful", version: "0.1.0" });

  server.tool(
    "generate_music",
    "Generate a song with Musicful from a QOJA production brief. Pass the user's lyrics/style and any Musicful-supported fields in payload.",
    { payload: z.record(z.any()).describe("JSON body for Musicful music generation") },
    async ({ payload }) => {
      const result = await musicful("/v1/music/generate", { method: "POST", body: JSON.stringify(payload) });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_music_task",
    "Check a Musicful generation task. taskId is appended to the task endpoint.",
    { taskId: z.string() },
    async ({ taskId }) => {
      const result = await musicful(`/v1/music/tasks/${encodeURIComponent(taskId)}`, { method: "GET" });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}

app.get("/", (_req, res) => res.json({ ok: true, service: "QOJA Musicful MCP" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/mcp", async (req, res) => {
  const server = makeServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  res.on("close", async () => { await transport.close(); await server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`QOJA Musicful MCP listening on ${port}`));
