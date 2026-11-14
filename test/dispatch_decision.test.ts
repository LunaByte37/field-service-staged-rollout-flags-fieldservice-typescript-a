import assert from "node:assert/strict";
import test from "node:test";
import { dispatchRequestSchema, decideDispatch } from "../src/work_order_dispatch";

const request = dispatchRequestSchema.parse({
  workOrderId: "wo-2048",
  technicianId: "tech-17",
  status: "on_site",
  photos: [
    { objectKey: "work-orders/wo-2048/arrival.jpg", capturedAt: "2026-09-28T08:30:00Z" },
  ],
  followUp: { required: true, dueAt: "2026-09-29T09:00:00Z" },
});

test("enabled cohort receives photo and technician follow-up handling", () => {
  assert.deepEqual(decideDispatch(request, true), {
    workOrderId: "wo-2048",
    route: "photo-assisted-dispatch",
    status: "on_site",
    acceptedPhotoCount: 1,
    followUpDueAt: "2026-09-29T09:00:00Z",
  });
});

test("disabled cohort stays on standard dispatch without photo metadata", () => {
  assert.deepEqual(decideDispatch(request, false), {
    workOrderId: "wo-2048",
    route: "standard-dispatch",
    status: "on_site",
    acceptedPhotoCount: 0,
    followUpDueAt: null,
  });
});

test("follow-up requires a due date at the request boundary", () => {
  const invalid = { ...request, followUp: { required: true, dueAt: null } };
  assert.equal(dispatchRequestSchema.safeParse(invalid).success, false);
});
