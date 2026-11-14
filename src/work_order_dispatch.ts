import { z } from "zod";
import type { InfraiClient } from "./infrai_client";

export const dispatchRequestSchema = z.object({
  workOrderId: z.string().min(1).max(80),
  technicianId: z.string().min(1).max(80),
  status: z.enum(["assigned", "en_route", "on_site", "completed"]),
  photos: z.array(z.object({
    objectKey: z.string().min(1).max(200),
    capturedAt: z.iso.datetime(),
  })).max(8),
  followUp: z.object({
    required: z.boolean(),
    dueAt: z.iso.datetime().nullable(),
  }),
}).superRefine((value, context) => {
  if (value.followUp.required && value.followUp.dueAt === null) {
    context.addIssue({
      code: "custom",
      path: ["followUp", "dueAt"],
      message: "dueAt is required when technician follow-up is required",
    });
  }
});

export type DispatchRequest = z.infer<typeof dispatchRequestSchema>;

export type DispatchDecision = {
  workOrderId: string;
  route: "standard-dispatch" | "photo-assisted-dispatch";
  status: DispatchRequest["status"];
  acceptedPhotoCount: number;
  followUpDueAt: string | null;
};

export function decideDispatch(input: DispatchRequest, photoWorkflowEnabled: boolean): DispatchDecision {
  return {
    workOrderId: input.workOrderId,
    route: photoWorkflowEnabled ? "photo-assisted-dispatch" : "standard-dispatch",
    status: input.status,
    acceptedPhotoCount: photoWorkflowEnabled ? input.photos.length : 0,
    followUpDueAt: photoWorkflowEnabled && input.followUp.required ? input.followUp.dueAt : null,
  };
}

export async function dispatchWorkOrder(
  infrai: InfraiClient,
  input: DispatchRequest,
): Promise<DispatchDecision> {
  const enabled = await infrai.flags.is_enabled("field-service-photo-follow-up");
  return decideDispatch(input, enabled);
}
