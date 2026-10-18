import type { BadgeTone } from "./Badge";

const TONES: Record<string, BadgeTone> = {
  pass: "success",
  allow: "success",
  reviewed: "success",
  fail: "danger",
  failed: "danger",
  deny: "danger",
  denied: "danger",
  error: "danger",
  "needs-input": "warning",
};

/** Badge tone for a status word; anything unknown stays neutral. */
export function statusTone(status: string): BadgeTone {
  return TONES[status.toLowerCase()] ?? "neutral";
}
