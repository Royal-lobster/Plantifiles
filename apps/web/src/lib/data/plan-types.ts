const PLAN_STATUSES = ["draft", "in_review", "approved", "archived"] as const;

type PlanStatus = (typeof PLAN_STATUSES)[number];

export { PLAN_STATUSES, type PlanStatus };
