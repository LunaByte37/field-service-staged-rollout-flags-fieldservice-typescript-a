import { z } from "zod";
import type { InfraiClient } from "./infrai_client";

export const rolloutStageSchema = z.object({
  percentage: z.union([z.literal(25), z.literal(100)]),
  version: z.coerce.number().int().positive(),
});

const FLAG_KEY = "field-service-photo-follow-up";

export async function applyRolloutStage(
  infrai: InfraiClient,
  stage: z.infer<typeof rolloutStageSchema>,
): Promise<{ percentage: number }> {
  await infrai.flags.rollout(FLAG_KEY, {
    key: FLAG_KEY,
    percentage: stage.percentage,
    salt: "field-service-v1",
    sticky_unit: "user_id",
    version: stage.version,
  });
  return { percentage: stage.percentage };
}

export async function installRolloutPlan(
  infrai: InfraiClient,
  publicBaseUrl: string,
  webhookToken: string,
  stage25Cron: string,
  stage100Cron: string,
): Promise<{ flagKey: string; jobs: string[] }> {
  await infrai.flags.set({
    key: FLAG_KEY,
    type: "boolean",
    default_value: false,
    enabled: true,
  });
  const stage25 = await infrai.cron.create({
    cron_expr: stage25Cron,
    task: `${publicBaseUrl}/internal/rollout/25?version=1&token=${encodeURIComponent(webhookToken)}`,
  });
  const stage100 = await infrai.cron.create({
    cron_expr: stage100Cron,
    task: `${publicBaseUrl}/internal/rollout/100?version=2&token=${encodeURIComponent(webhookToken)}`,
  });
  return { flagKey: FLAG_KEY, jobs: [stage25.job_id, stage100.job_id] };
}
