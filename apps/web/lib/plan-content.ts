import "server-only";
import { db } from "@plantifiles/db";
import { getActor } from "@/lib/api-auth";
import { config } from "@/lib/config";

function withTransportFrontmatter(
  source: string,
  metadata: { title: string; version: number; status: string; url: string; openDecisions: number; updatedAt: string },
): string {
  const generated = [
    `title: ${JSON.stringify(metadata.title)}`,
    `version: ${metadata.version}`,
    `status: ${metadata.status}`,
    `url: ${JSON.stringify(metadata.url)}`,
    `openDecisions: ${metadata.openDecisions}`,
    `updatedAt: ${JSON.stringify(metadata.updatedAt)}`,
  ];
  const normalized = source.replace(/\r\n?/g, "\n");
  if (normalized.startsWith("---\n")) {
    const closing = normalized.indexOf("\n---", 4);
    if (closing !== -1) {
      const body = normalized.slice(closing + 4).replace(/^\n+/, "");
      const originalFrontmatter = normalized
        .slice(4, closing)
        .split("\n")
        .filter((line) => !/^(title|version|status|url|openDecisions|updatedAt):/.test(line));
      return `---\n${[...originalFrontmatter, ...generated].filter(Boolean).join("\n")}\n---\n\n${body}`;
    }
  }
  return `---\n${generated.join("\n")}\n---\n\n${normalized}`;
}

export async function getPlanMarkdown(
  request: Request,
  workspaceSlug: string,
  planSlug: string,
  versionNumber?: number,
): Promise<{ markdown: string; etag: string } | null> {
  const plan = await db.plan.findFirst({
    where: {
      workspace: { slug: workspaceSlug },
      OR: [{ slug: planSlug }, { visibility: "PUBLIC", publicSlug: planSlug }],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      visibility: true,
      workspaceId: true,
      workspace: { select: { slug: true } },
      currentVersion: { select: { number: true } },
      versions: {
        where: versionNumber === undefined ? { id: { not: "" } } : { number: versionNumber },
        orderBy: { number: "desc" },
        take: 1,
        select: {
          number: true,
          source: true,
          createdAt: true,
          blocks: { where: { kind: "Decision" }, select: { key: true } },
        },
      },
      decisions: { where: { status: "OPEN" }, select: { key: true } },
    },
  });
  if (!plan || (versionNumber === undefined && !plan.currentVersion)) return null;
  if (plan.visibility !== "PUBLIC") {
    const actor = await getActor(request);
    if (!actor) return null;
    const membership = await db.membership.findUnique({
      where: { userId_workspaceId: { userId: actor.userId, workspaceId: plan.workspaceId } },
      select: { id: true },
    });
    if (!membership) return null;
  }

  const version =
    versionNumber === undefined
      ? plan.versions.find((candidate) => candidate.number === plan.currentVersion?.number)
      : plan.versions[0];
  if (!version) return null;
  const decisionKeys = new Set(version.blocks.map((block) => block.key));
  const openDecisions = plan.decisions.filter((decision) => decisionKeys.has(decision.key)).length;
  const url = `${config.baseUrl}/p/${plan.workspace.slug}/${plan.slug}${versionNumber === undefined ? "" : `/v/${version.number}`}`;
  return {
    markdown: withTransportFrontmatter(version.source, {
      title: plan.title,
      version: version.number,
      status: plan.status,
      url,
      openDecisions,
      updatedAt: version.createdAt.toISOString(),
    }),
    etag: `"plan-${plan.id}-v${version.number}"`,
  };
}
