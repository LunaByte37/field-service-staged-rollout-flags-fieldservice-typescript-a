import { createInfraiClient } from "./infrai_client";
import { installRolloutPlan } from "./rollout_plan";

const apiKey = process.env.INFRAI_API_KEY;
const publicBaseUrl = process.env.PUBLIC_BASE_URL;
const webhookToken = process.env.ROLLOUT_WEBHOOK_TOKEN;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before scheduling the rollout");
if (!publicBaseUrl) throw new Error("Set PUBLIC_BASE_URL to the deployed service URL");
if (!webhookToken) throw new Error("Set ROLLOUT_WEBHOOK_TOKEN before scheduling the rollout");

const infrai = createInfraiClient({ apiKey, baseUrl: process.env.INFRAI_BASE_URL });
const result = await installRolloutPlan(
  infrai,
  publicBaseUrl.replace(/\/$/, ""),
  webhookToken,
  process.env.STAGE_25_CRON ?? "0 9 1 * *",
  process.env.STAGE_100_CRON ?? "0 9 8 * *",
);
console.log(JSON.stringify(result, null, 2));
