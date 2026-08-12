export type McpConfig = { token: string; baseUrl: string };

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

export class PlantifilesApi {
	readonly #config: McpConfig;

	constructor(config: McpConfig) {
		this.#config = config;
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
		return (await this.#response(path, init)).json() as Promise<T>;
	}

	createPlan(input: {
		workspaceSlug: string;
		slug?: string | undefined;
		title: string;
		source: string;
		agentName?: string | undefined;
		agentPrompt?: string | undefined;
		force?: boolean | undefined;
	}): Promise<PublishedPlan> {
		return this.#json("/api/plans", { method: "POST", body: JSON.stringify(input) });
	}

	updatePlan(
		planId: string,
		input: {
			source: string;
			agentName?: string | undefined;
			agentPrompt?: string | undefined;
			force?: boolean | undefined;
		},
	): Promise<PublishedPlan> {
		return this.#json(`/api/plans/${encodeURIComponent(planId)}/versions`, {
			method: "POST",
			body: JSON.stringify(input),
		});
	}

	getPlan(planId: string): Promise<PlanDetail> {
		return this.#json(`/api/plans/${encodeURIComponent(planId)}`);
	}

	listPlans(workspaceSlug: string, status?: string): Promise<unknown> {
		const query = new URLSearchParams({ workspace: workspaceSlug });
		if (status) query.set("status", status);
		return this.#json(`/api/plans?${query}`);
	}

	commentOnPlan(
		planId: string,
		input: { body: string; blockKey?: string | undefined; parentId?: string | undefined },
	): Promise<unknown> {
		return this.#json(`/api/plans/${encodeURIComponent(planId)}/comments`, {
			method: "POST",
			body: JSON.stringify({ ...input, agentAssisted: true }),
		});
	}

	async getPlanMarkdown(idOrUrl: string): Promise<string> {
		const path = await this.#planPath(idOrUrl);
		const response = await this.#response(path, { headers: { accept: "text/markdown" } });
		return response.text();
	}

	async #planPath(idOrUrl: string): Promise<string> {
		if (!/^https?:\/\//.test(idOrUrl)) {
			const detail = await this.getPlan(idOrUrl);
			return `/p/${encodeURIComponent(detail.workspace.slug)}/${encodeURIComponent(detail.plan.slug)}`;
		}
		const supplied = new URL(idOrUrl);
		const service = new URL(this.#config.baseUrl);
		if (supplied.origin !== service.origin) throw new Error("Plan URLs must use the configured Plantifiles service.");
		if (!/^\/p\/[^/]+\/[^/]+(?:\/v\/\d+)?$/.test(supplied.pathname)) {
			throw new Error("Expected a Plantifiles plan URL.");
		}
		return supplied.pathname;
	}
}
