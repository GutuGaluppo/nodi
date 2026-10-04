import configuration from "../../../landing/plans.json";

export const handwritingPlans = configuration.plans;
export const handwritingPack = configuration.pack;
export const handwritingLimits = configuration;
export type PlanId = "free" | "essential" | "plus" | "pro";
export function planPrice(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
