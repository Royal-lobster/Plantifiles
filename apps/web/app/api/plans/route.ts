import { PlanStatus } from "@plantifiles/db/enums";
import { db } from "@plantifiles/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/api-auth";
import { apiError } from "@/lib/api-response";
import { publishPlan } from "@/lib/plans";

const publishSchema = z.object({
  workspaceSlug: z.string().min(1),
  slug: z.string().min(1).optional(),
  title: z.string().min(1),
  source: z.string().min(1),
  agentName: z.string().min(1).optional(),
  agentPrompt: z.string().optional(),
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  const actor = await getActor(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = publishSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", details: parsed.error.flatten() }, { status: 400 });

  try {
    return NextResponse.json(await publishPlan({ actorId: actor.userId, ...parsed.data }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  const actor = await getActor(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const url = new URL(request.url);
  const workspaceSlug = url.searchParams.get("workspace");
  const statusValue = url.searchParams.get("status");
  const status = statusValue && Object.values(PlanStatus).includes(statusValue as PlanStatus) ? (statusValue as PlanStatus) : undefined;
  if (!workspaceSlug) return NextResponse.json({ error: "workspace is required." }, { status: 400 });

  const plans = await db.plan.findMany({
    where: {
      workspace: { slug: workspaceSlug, memberships: { some: { userId: actor.userId } } },
      ...(status ? { status } : {}),
    },
    orderBy: { currentVersion: { createdAt: "desc" } },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      currentVersion: {
        select: {
          number: true,
          createdAt: true,
          agentName: true,
          author: { select: { name: true, avatarUrl: true } },
          blocks: { where: { kind: "Decision" }, select: { key: true } },
          approvals: { select: { id: true } },
        },
      },
      decisions: { where: { status: "OPEN" }, select: { key: true } },
      workspace: { select: { slug: true, requiredApprovals: true } },
    },
  });

  return NextResponse.json(
    plans.map((plan) => {
      const currentDecisionKeys = new Set(plan.currentVersion?.blocks.map((block) => block.key) ?? []);
      const openDecisions = plan.decisions.filter((decision) => currentDecisionKeys.has(decision.key)).length;
      return {
        ...plan,
        openDecisions,
        approvals: plan.currentVersion?.approvals.length ?? 0,
        url: `/p/${plan.workspace.slug}/${plan.slug}`,
      };
    }),
  );
}
