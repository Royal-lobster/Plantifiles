import type { CliConfig } from "./config.js";

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
	readonly #config: CliConfig;

	constructor(config: CliConfig) {
		this.#config = config;
	}

	async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const headers = new Headers(init.headers);
		headers.set("authorization", `Bearer ${this.#config.token}`);
		if (init.body) headers.set("content-type", "application/json");
		const response = await fetch(`${this.#config.baseUrl}${path}`, { ...init, headers });
		if (!response.ok) {
			const text = await response.text();
			let body: unknown = text;
			try {
				body = JSON.parse(text);
			} catch {
				// Plain-text errors remain readable.
			}
			throw new ApiError(response.status, body);
		}
		if (response.status === 204) return undefined as T;
		return (await response.json()) as T;
	}

	createPlan(input: {
		workspaceSlug: string;
		title: string;
		emoji?: string | undefined;
		source: string;
		agentName?: string | undefined;
		agentPrompt?: string | undefined;
		force: boolean;
	}): Promise<PublishedPlan> {
		return this.#request("/api/plans", { method: "POST", body: JSON.stringify(input) });
	}

	createVersion(
		planId: string,
		input: {
			source: string;
			emoji?: string | undefined;
			agentName?: string | undefined;
			agentPrompt?: string | undefined;
			force: boolean;
		},
	): Promise<PublishedPlan> {
		return this.#request(`/api/plans/${encodeURIComponent(planId)}/versions`, {
			method: "POST",
			body: JSON.stringify(input),
		});
	}

	getPlan(planId: string): Promise<PlanDetail> {
		return this.#request(`/api/plans/${encodeURIComponent(planId)}`);
	}

	listPlans(workspaceSlug: string, status?: string): Promise<PlanStatus[]> {
		const query = new URLSearchParams({ workspace: workspaceSlug });
		if (status) query.set("status", status);
		return this.#request(`/api/plans?${query}`);
	}

	async resolvePlan(idOrUrl: string): Promise<PlanDetail> {
		if (!/^https?:\/\//.test(idOrUrl)) return this.getPlan(idOrUrl);
		const url = new URL(idOrUrl);
		const match = url.pathname.match(/^\/p\/([^/]+)\/([^/]+)(?:\/v\/\d+)?$/);
		if (!match?.[1] || !match[2]) throw new Error("Expected a Plantifiles plan URL.");
		const workspace = decodeURIComponent(match[1]);
		const slug = decodeURIComponent(match[2]).replace(/\.md$/, "");
		const listed = await this.listPlans(workspace);
		const plan = listed.find((item) => item.slug === slug);
		if (!plan) throw new Error(`No plan named ${slug} exists in workspace ${workspace}.`);
		return this.getPlan(plan.id);
	}
}
