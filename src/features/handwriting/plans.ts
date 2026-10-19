import configuration from "../../../landing/plans.json";

export const handwritingPlans = configuration.plans;
export const handwritingPack = configuration.pack;
export const handwritingLimits = configuration;
export type PlanId = "free" | "essential" | "plus" | "pro";
/** OpenAI reasoning effort; the server charges `credits` per page for it. */
export type Effort = "none" | "low" | "medium" | "high" | "xhigh";
export const handwritingEfforts = configuration.efforts as {
  id: Effort;
  credits: number;
}[];
export function planPrice(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
