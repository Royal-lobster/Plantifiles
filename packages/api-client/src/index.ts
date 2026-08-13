export type PlantifilesClientConfig = { token: string; baseUrl: string };

export type PublishPlanInput = {
	workspaceSlug: string;
	slug?: string | undefined;
	title: string;
	source: string;
	emoji?: string | undefined;
	agentName?: string | undefined;
	agentPrompt?: string | undefined;
	force?: boolean | undefined;
};

export type PublishVersionInput = {
	source: string;
	emoji?: string | undefined;
	agentName?: string | undefined;
	agentPrompt?: string | undefined;
	force?: boolean | undefined;
};

export type CommentInput = {
	body: string;
	blockKey?: string | undefined;
	parentId?: string | undefined;
};

export type PublishedPlan = {
	id: string;
	version: number;
	url: string;
	changeSummary: string | null;
};

export type PlanDetail = {
	plan: { id: string; slug: string; title: string; status: string };
	workspace: { slug: string };
	version: { number: number; source: string };
};

export type PlanStatus = {
	id: string;
	slug: string;
	emoji: string | null;
	title: string;
	status: string;
	version: number;
	agentName: string | null;
	openDecisions: number;
	approvals: number;
	requiredApprovals: number;
	readTimeMinutes: number;
	updatedAt: string;
};

export class ApiError extends Error {
	readonly status: number;
	readonly body: unknown;

	constructor(status: number, body: unknown) {
		super(
			typeof body === "object" && body && "message" in body
				? String(body.message)
				: `Plantifiles API returned ${status}.`,
		);
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
		headers.set("authorization", `Bearer ${this.#config.token}`);
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

	async #json<T>(path: string, init: RequestInit = {}): Promise<T> {
		const response = await this.#response(path, init);
		if (response.status === 204) return undefined as T;
		return response.json() as Promise<T>;
	}

	createPlan(input: PublishPlanInput): Promise<PublishedPlan> {
		return this.#json("/api/plans", { method: "POST", body: JSON.stringify(input) });
	}

	createVersion(planId: string, input: PublishVersionInput): Promise<PublishedPlan> {
		return this.#json(`/api/plans/${encodeURIComponent(planId)}/versions`, {
			method: "POST",
			body: JSON.stringify(input),
		});
	}

	getPlan(planId: string): Promise<PlanDetail> {
		return this.#json(`/api/plans/${encodeURIComponent(planId)}`);
	}

	listPlans(workspaceSlug: string, status?: string): Promise<PlanStatus[]> {
		const query = new URLSearchParams({ workspace: workspaceSlug });
		if (status) query.set("status", status);
		return this.#json(`/api/plans?${query}`);
	}

	commentOnPlan(planId: string, input: CommentInput): Promise<unknown> {
		return this.#json(`/api/plans/${encodeURIComponent(planId)}/comments`, {
			method: "POST",
			body: JSON.stringify({ ...input, agentAssisted: true }),
		});
	}

	async resolvePlan(idOrUrl: string): Promise<PlanDetail> {
		if (!/^https?:\/\//.test(idOrUrl)) return this.getPlan(idOrUrl);
		const { workspace, slug } = this.#parsePlanUrl(idOrUrl);
		const listed = await this.listPlans(workspace);
		const plan = listed.find((item) => item.slug === slug);
		if (!plan) throw new Error(`No plan named ${slug} exists in workspace ${workspace}.`);
		return this.getPlan(plan.id);
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
