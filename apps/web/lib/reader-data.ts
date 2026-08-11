import "server-only";
import { db } from "@plantifiles/db";
import { auth } from "@/lib/auth";

export async function getReaderPlan(workspaceSlug: string, planSlug: string, versionNumber?: number) {
  const plan = await db.plan.findFirst({
    where: {
      workspace: { slug: workspaceSlug },
      OR: [{ slug: planSlug }, { visibility: "PUBLIC", publicSlug: planSlug }],
    },
    select: {
      id: true,
      workspaceId: true,
      slug: true,
      title: true,
      status: true,
      visibility: true,
      workspace: { select: { slug: true, name: true } },
      currentVersion: { select: { number: true } },
      versions: {
        where: versionNumber === undefined ? { id: { not: "" } } : { number: versionNumber },
        orderBy: { number: "desc" },
        take: 1,
        select: { number: true, source: true, lintScore: true, lintOverridden: true, createdAt: true },
      },
    },
  });
  if (!plan) return null;
  if (plan.visibility !== "PUBLIC") {
    const session = await auth();
    if (!session?.user.id) return null;
    const membership = await db.membership.findUnique({
      where: { userId_workspaceId: { userId: session.user.id, workspaceId: plan.workspaceId } },
      select: { id: true },
    });
    if (!membership) return null;
  }
  const version =
    versionNumber === undefined
      ? plan.versions.find((candidate) => candidate.number === plan.currentVersion?.number)
      : plan.versions[0];
  return version ? { ...plan, version } : null;
}
