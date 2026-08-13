import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { createComment } from "../../../../../lib/data/comments.server";
import {
	advancePlanStatus,
	approveCurrentVersion,
	resolveComment,
	resolveDecision,
} from "../../../../../lib/data/review.server";

export const createCommentForPage = createServerFn({ method: "POST" })
	.validator(
		z.object({
			planId: z.string().min(1),
			blockKey: z.string().min(1).optional(),
			parentId: z.string().min(1).optional(),
			body: z.string().trim().min(1).max(10_000),
			agentAssisted: z.boolean().optional(),
		}),
	)
	.handler(async ({ data }) => createComment(getRequest(), data.planId, data));

export const setCommentResolvedForPage = createServerFn({ method: "POST" })
	.validator(z.object({ commentId: z.string().min(1), resolved: z.boolean() }))
	.handler(async ({ data }) => resolveComment(getRequest(), data.commentId, data.resolved));

export const resolveDecisionForPage = createServerFn({ method: "POST" })
	.validator(
		z.object({ planId: z.string().min(1), key: z.string().min(1), resolution: z.string().trim().min(1).max(10_000) }),
	)
	.handler(async ({ data }) => resolveDecision(getRequest(), data.planId, data.key, data.resolution));

export const approveCurrentVersionForPage = createServerFn({ method: "POST" })
	.validator(z.object({ planId: z.string().min(1) }))
	.handler(async ({ data }) => approveCurrentVersion(getRequest(), data.planId));

export const advancePlanStatusForPage = createServerFn({ method: "POST" })
	.validator(z.object({ planId: z.string().min(1) }))
	.handler(async ({ data }) => advancePlanStatus(getRequest(), data.planId));
