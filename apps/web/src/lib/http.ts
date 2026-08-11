export function errorResponse(error: unknown): Response {
	if (error instanceof Response) return error;
	console.error(error);
	return Response.json({ error: "internal_error", message: "Internal server error" }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw Response.json({ error: "invalid_json", message: "Request body must be valid JSON." }, { status: 400 });
	}
}
