import { db } from "@plantifiles/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/api-auth";

const commentSchema = z.object({
  blockKey: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
  body: z.string().trim().min(1).max(10_000),
  agentAssisted: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = commentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", details: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const plan = await db.plan.findFirst({
    where: { id, workspace: { memberships: { some: { userId: actor.userId } } } },
    select: {
      currentVersion: { select: { id: true, blocks: { select: { key: true } } } },
      comments: parsed.data.parentId
        ? { where: { id: parsed.data.parentId }, select: { id: true, parentId: true }, take: 1 }
        : false,
    },
  });
  if (!plan?.currentVersion) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  if (parsed.data.blockKey && !plan.currentVersion.blocks.some((block) => block.key === parsed.data.blockKey)) {
    return NextResponse.json({ error: "Block key does not exist in the current version." }, { status: 400 });
  }
  if (parsed.data.parentId && (plan.comments.length !== 1 || plan.comments[0]?.parentId)) {
    return NextResponse.json({ error: "Replies may only be one level deep." }, { status: 400 });
  }

  const comment = await db.comment.create({
    data: {
      planId: id,
      versionId: plan.currentVersion.id,
      blockKey: parsed.data.blockKey ?? null,
      parentId: parsed.data.parentId ?? null,
      body: parsed.data.body,
      authorId: actor.userId,
      agentAssisted: parsed.data.agentAssisted ?? false,
    },
    select: { id: true, blockKey: true, parentId: true, body: true, agentAssisted: true, createdAt: true },
  });
  return NextResponse.json(comment, { status: 201 });
}
