import { type MovedPlan, movePlanInputSchema } from "@plantifiles/api-contract";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { listMoveTargets, movePlan, PlanSlugConflictError } from "../../../../../lib/data/move-plan.server";

/**
 * A slug collision comes back as a reason rather than an exception, the way
 * `advancePlanStatus` reports a blocked approval gate: the dialog has to render
 * it beside the slug field, and a thrown `Response` crossing the server-function
 * boundary arrives without its body.
 */
export type MovePlanResult = { moved: MovedPlan; conflict: null } | { moved: null; conflict: string };

export const listMoveTargetsForPage = createServerFn({ method: "GET" })
	.validator(z.object({ planId: z.string().min(1) }))
	.handler(async ({ data }) => listMoveTargets(getRequest(), data.planId));

export const movePlanForPage = createServerFn({ method: "POST" })
	.validator(movePlanInputSchema.extend({ planId: z.string().min(1) }))
	.handler(async ({ data }): Promise<MovePlanResult> => {
		try {
			return { moved: await movePlan(getRequest(), data.planId, data), conflict: null };
		} catch (error) {
			if (error instanceof PlanSlugConflictError) return { moved: null, conflict: error.message };
			throw error;
		}
	});
