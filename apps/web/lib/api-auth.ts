import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@plantifiles/db";
import { auth } from "@/lib/auth";

export type Actor = {
  userId: string;
};

export async function getActor(request: Request): Promise<Actor | null> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const plaintext = authorization.slice("Bearer ".length).trim();
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");
    const token = await db.apiToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true } });
    if (!token) return null;
    await db.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() }, select: { id: true } });
    return { userId: token.userId };
  }

  const session = await auth();
  return session?.user.id ? { userId: session.user.id } : null;
}

export async function canAccessWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  return Boolean(
    await db.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true },
    }),
  );
}

export function createPlaintextToken(): { plaintext: string; tokenHash: string } {
  const plaintext = `pf_${randomBytes(24).toString("base64url")}`;
  return { plaintext, tokenHash: createHash("sha256").update(plaintext).digest("hex") };
}
