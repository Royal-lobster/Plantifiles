import {
	commentInputSchema,
	type CommentInput,
	listPlansInputSchema,
	type ListPlansInput,
	movePlanInputSchema,
	type MovePlanInput,
	moveTargetListSchema,
	type MoveTarget,
	movedPlanSchema,
	type MovedPlan,
	planDetailSchema,
	type PlanDetail,
	planPageSchema,
	type PlanPage,
	publishPlanInputSchema,
	type PublishPlanInput,
	publishedPlanSchema,
	type PublishedPlan,
	publishVersionInputSchema,
	type PublishVersionInput,
	workspaceSummaryListSchema,
	type WorkspaceSummary,
} from "@plantifiles/api-contract";

export type PlantifilesClientConfig = { getAccessToken(): string | Promise<string>; baseUrl: string };

export class ApiError extends Error {
	readonly status: number;
	readonly body: unknown;

	constructor(status: number, body: unknown) {
		// Route handlers answer with JSON `{ message }` for validation failures and
		// with a bare `Response` body for auth failures. Both carry the sentence
		// worth showing; only an empty body falls back to the status code.
		const detail =
			typeof body === "object" && body && "message" in body
				? String(body.message)
				: typeof body === "string" && body.trim()
					? body.trim()
					: `Plantifiles API returned ${status}.`;
		super(detail);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
	}
}

export class PlantifilesClient {
	readonly #config: PlantifilesClientConfig;

	constructor(config: PlantifilesClientConfig) {
		this.#config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, "") };
	}

	async #response(path: string, init: RequestInit = {}): Promise<Response> {
		const headers = new Headers(init.headers);
		headers.set("authorization", `Bearer ${await this.#config.getAccessToken()}`);
		if (init.body) headers.set("content-type", "application/json");
		const response = await fetch(`${this.#config.baseUrl}${path}`, { ...init, headers });
		if (response.ok) return response;
		const text = await response.text();
		let body: unknown = text;
		try {
			body = JSON.parse(text);
		} catch {
			// Preserve readable plain-text API errors.
		}
		throw new ApiError(response.status, body);
	}

	async #json<T>(path: string, schema?: { parse(value: unknown): T }, init: RequestInit = {}): Promise<T> {
		const response = await this.#response(path, init);
		if (response.status === 204) return undefined as T;
		const body: unknown = await response.json();
		return schema ? schema.parse(body) : (body as T);
	}

	listWorkspaces(): Promise<WorkspaceSummary[]> {
		return this.#json("/api/workspaces", workspaceSummaryListSchema);
	}

	createPlan(input: PublishPlanInput): Promise<PublishedPlan> {
		return this.#json("/api/plans", publishedPlanSchema, {
			method: "POST",
			body: JSON.stringify(publishPlanInputSchema.parse(input)),
		});
	}

	createVersion(planId: string, input: PublishVersionInput): Promise<PublishedPlan> {
		return this.#json(`/api/plans/${encodeURIComponent(planId)}/versions`, publishedPlanSchema, {
			method: "POST",
			body: JSON.stringify(publishVersionInputSchema.parse(input)),
		});
	}

	movePlan(planId: string, input: MovePlanInput): Promise<MovedPlan> {
		return this.#json(`/api/plans/${encodeURIComponent(planId)}/move`, movedPlanSchema, {
			method: "POST",
			body: JSON.stringify(movePlanInputSchema.parse(input)),
		});
	}

	listMoveTargets(planId: string): Promise<MoveTarget[]> {
		return this.#json(`/api/plans/${encodeURIComponent(planId)}/move`, moveTargetListSchema);
	}

	getPlan(planId: string): Promise<PlanDetail> {
		return this.#json(`/api/plans/${encodeURIComponent(planId)}`, planDetailSchema);
	}

	listPlans(input: ListPlansInput): Promise<PlanPage> {
		const parsed = listPlansInputSchema.parse(input);
		const query = new URLSearchParams({ workspace: parsed.workspaceSlug });
		if (parsed.status) query.set("status", parsed.status);
		if (parsed.cursor) query.set("cursor", parsed.cursor);
		if (parsed.limit) query.set("limit", String(parsed.limit));
		return this.#json(`/api/plans?${query}`, planPageSchema);
	}

	commentOnPlan(planId: string, input: CommentInput): Promise<unknown> {
		return this.#json(`/api/plans/${encodeURIComponent(planId)}/comments`, undefined, {
			method: "POST",
			body: JSON.stringify({ ...commentInputSchema.parse(input), agentAssisted: true }),
		});
	}

	async resolvePlan(idOrUrl: string): Promise<PlanDetail> {
		if (!/^https?:\/\//.test(idOrUrl)) return this.getPlan(idOrUrl);
		const { workspace, slug } = this.#parsePlanUrl(idOrUrl);
		let cursor: string | undefined;
		do {
			const page = await this.listPlans({
				workspaceSlug: workspace,
				limit: 100,
				...(cursor ? { cursor } : {}),
			});
			const plan = page.items.find((item) => item.slug === slug);
			if (plan) return this.getPlan(plan.id);
			cursor = page.nextCursor ?? undefined;
		} while (cursor);
		throw new Error(`No plan named ${slug} exists in workspace ${workspace}.`);
	}

	async getPlanMarkdown(idOrUrl: string): Promise<string> {
		let path: string;
		if (/^https?:\/\//.test(idOrUrl)) {
			const { pathname } = this.#parsePlanUrl(idOrUrl);
			path = pathname;
		} else {
			const detail = await this.getPlan(idOrUrl);
			path = `/p/${encodeURIComponent(detail.workspace.slug)}/${encodeURIComponent(detail.plan.slug)}`;
		}
		return (await this.#response(path, { headers: { accept: "text/markdown" } })).text();
	}

	#parsePlanUrl(idOrUrl: string): { workspace: string; slug: string; pathname: string } {
		const supplied = new URL(idOrUrl);
		const service = new URL(this.#config.baseUrl);
		if (supplied.origin !== service.origin) throw new Error("Plan URLs must use the configured Plantifiles service.");
		const match = supplied.pathname.match(/^\/p\/([^/]+)\/([^/]+)(?:\/v\/\d+)?$/);
		if (!match?.[1] || !match[2]) throw new Error("Expected a Plantifiles plan URL.");
		return {
			workspace: decodeURIComponent(match[1]),
			slug: decodeURIComponent(match[2]).replace(/\.md$/, ""),
			pathname: supplied.pathname,
		};
	}
}
