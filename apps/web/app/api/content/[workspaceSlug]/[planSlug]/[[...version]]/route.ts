import { getPlanMarkdown } from "@/lib/plan-content";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceSlug: string; planSlug: string; version?: string[] }> },
) {
  const { workspaceSlug, planSlug, version } = await params;
  const versionNumber = version?.[0] === "v" && version[1] ? Number(version[1]) : undefined;
  if (version && (version.length !== 2 || !Number.isInteger(versionNumber) || (versionNumber ?? 0) < 1)) {
    return Response.json({ error: "Invalid version." }, { status: 400 });
  }
  const result = await getPlanMarkdown(request, workspaceSlug, planSlug, versionNumber);
  if (!result) return Response.json({ error: "Plan not found." }, { status: 404 });
  if (request.headers.get("if-none-match") === result.etag) return new Response(null, { status: 304 });
  return new Response(result.markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "private, no-cache",
      etag: result.etag,
    },
  });
}
