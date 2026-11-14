import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { createInfraiClient, InfraiError } from "./infrai_client";
import { applyRolloutStage, rolloutStageSchema } from "./rollout_plan";
import { dispatchRequestSchema, dispatchWorkOrder } from "./work_order_dispatch";

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("Request body exceeds 64 KiB");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const rolloutWebhookToken = process.env.ROLLOUT_WEBHOOK_TOKEN;
if (!rolloutWebhookToken) throw new Error("Set ROLLOUT_WEBHOOK_TOKEN before starting the service");
const infrai = createInfraiClient({ apiKey, baseUrl: process.env.INFRAI_BASE_URL });

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "POST" && url.pathname === "/work-orders/dispatch") {
      const input = dispatchRequestSchema.parse(await readJson(request));
      send(response, 200, await dispatchWorkOrder(infrai, input));
      return;
    }

    const stageMatch = url.pathname.match(/^\/internal\/rollout\/(25|100)$/);
    if (request.method === "POST" && stageMatch) {
      if (url.searchParams.get("token") !== rolloutWebhookToken) {
        send(response, 401, { error: "invalid rollout callback token" });
        return;
      }
      const stage = rolloutStageSchema.parse({
        percentage: Number(stageMatch[1]),
        version: url.searchParams.get("version"),
      });
      send(response, 200, await applyRolloutStage(infrai, stage));
      return;
    }
    send(response, 404, { error: "route not found" });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code });
      return;
    }
    send(response, 500, { error: "request processing failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`field-service listening on http://localhost:${port}`));
