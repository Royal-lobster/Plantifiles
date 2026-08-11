import { db } from "@plantifiles/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPlaintextToken } from "@/lib/api-auth";
import { auth } from "@/lib/auth";

const tokenSchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = tokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", details: parsed.error.flatten() }, { status: 400 });
  const { plaintext, tokenHash } = createPlaintextToken();
  const token = await db.apiToken.create({
    data: { userId: session.user.id, name: parsed.data.name, tokenHash },
    select: { id: true, name: true, createdAt: true },
  });
  return NextResponse.json({ ...token, token: plaintext }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(
    await db.apiToken.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    }),
  );
}
