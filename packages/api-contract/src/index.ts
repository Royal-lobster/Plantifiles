import { z } from "zod";

export const PLAN_STATUSES = ["draft", "in_review", "approved", "archived"] as const;
export const planStatusSchema = z.enum(PLAN_STATUSES);
export type PlanStatus = z.infer<typeof planStatusSchema>;

export const PLAN_EMOJI_MESSAGE =
	"Emoji must be at most 8 characters, include a non-ASCII symbol, and contain no ASCII letters, digits, or whitespace.";

export const planEmojiSchema = z
	.string()
	.max(8, PLAN_EMOJI_MESSAGE)
	.regex(/^[^A-Za-z0-9\s]+$/, PLAN_EMOJI_MESSAGE)
	.refine((value) => Array.from(value).some((character) => (character.codePointAt(0) ?? 0) > 127), PLAN_EMOJI_MESSAGE);

export const publishPlanInputSchema = z.object({
	workspaceSlug: z.string().min(1),
	slug: z.string().min(1).optional(),
	title: z.string().min(1),
	source: z.string(),
	emoji: planEmojiSchema.optional(),
	agentName: z.string().min(1).optional(),
	agentPrompt: z.string().optional(),
	force: z.boolean().optional(),
});
export type PublishPlanInput = z.infer<typeof publishPlanInputSchema>;

export const publishVersionInputSchema = publishPlanInputSchema.omit({ workspaceSlug: true, slug: true, title: true });
export type PublishVersionInput = z.infer<typeof publishVersionInputSchema>;

export const movePlanInputSchema = z.object({
	workspaceSlug: z.string().min(1),
	slug: z.string().min(1).optional(),
});
export type MovePlanInput = z.infer<typeof movePlanInputSchema>;

export const commentInputSchema = z.object({
	body: z.string().trim().min(1).max(10_000),
	blockKey: z.string().min(1).optional(),
	parentId: z.string().min(1).optional(),
});
export type CommentInput = z.infer<typeof commentInputSchema>;

export const createCommentRequestSchema = commentInputSchema.extend({ agentAssisted: z.boolean().optional() });
export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;

export const listPlansInputSchema = z.object({
	workspaceSlug: z.string().min(1),
	status: planStatusSchema.optional(),
	cursor: z.string().min(1).max(200).optional(),
	limit: z.number().int().min(1).max(100).optional(),
});
export type ListPlansInput = z.infer<typeof listPlansInputSchema>;

export const listPlansQuerySchema = listPlansInputSchema.extend({
	limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const publishedPlanSchema = z.object({
	id: z.string(),
	version: z.number().int().positive(),
	url: z.string().url(),
	changeSummary: z.string().nullable(),
});
export type PublishedPlan = z.infer<typeof publishedPlanSchema>;

export const movedPlanSchema = z.object({
	id: z.string(),
	workspaceSlug: z.string(),
	slug: z.string(),
	url: z.string().url(),
	status: planStatusSchema,
	movedFrom: z.string().nullable(),
	clearedApprovals: z.number().int().nonnegative(),
});
export type MovedPlan = z.infer<typeof movedPlanSchema>;

export const workspaceSummarySchema = z.object({
	id: z.string(),
	slug: z.string(),
	name: z.string(),
	role: z.enum(["owner", "member"]),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const workspaceSummaryListSchema = z.array(workspaceSummarySchema);

export const moveTargetSchema = workspaceSummarySchema.extend({ slugTaken: z.boolean() });
export type MoveTarget = z.infer<typeof moveTargetSchema>;

export const moveTargetListSchema = z.array(moveTargetSchema);

export const planDetailSchema = z.object({
	plan: z.object({ id: z.string(), slug: z.string(), title: z.string(), status: planStatusSchema }),
	workspace: z.object({ slug: z.string() }),
	version: z.object({ number: z.number().int().positive(), source: z.string() }),
});
export type PlanDetail = z.infer<typeof planDetailSchema>;

export const planSummarySchema = z.object({
	id: z.string(),
	slug: z.string(),
	emoji: z.string().nullable(),
	title: z.string(),
	status: planStatusSchema,
	version: z.number().int().positive(),
	agentName: z.string().nullable(),
	openDecisions: z.number().int().nonnegative(),
	approvals: z.number().int().nonnegative(),
	readTimeMinutes: z.number().nonnegative(),
	updatedAt: z.string().datetime(),
});
export type PlanSummary = z.infer<typeof planSummarySchema>;

export const planPageSchema = z.object({
	items: z.array(planSummarySchema),
	nextCursor: z.string().nullable(),
});
export type PlanPage = z.infer<typeof planPageSchema>;
