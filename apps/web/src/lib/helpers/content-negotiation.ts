export type PlanRouteParams = {
	workspaceSlug: string;
	planSlug: string;
	number?: string;
};
export async function negotiatePlanResponse<TNext>(
	request: Request,
	params: PlanRouteParams,
	next: () => TNext,
	loadMarkdown: (request: Request, params: PlanRouteParams) => Promise<string>,
): Promise<Response | TNext> {
	const url = new URL(request.url);
	const forcedMarkdown = params.planSlug.endsWith(".md") || url.searchParams.get("format") === "md";
	const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");
	if (wantsHtml && !forcedMarkdown) return next();

	return new Response(await loadMarkdown(request, params), {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			Vary: "Accept",
		},
	});
}
