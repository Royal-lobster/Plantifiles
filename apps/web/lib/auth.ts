import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { db } from "@plantifiles/db";
import { config } from "@/lib/config";

const providers = [
  GitHub({
    clientId: config.githubId,
    clientSecret: config.githubSecret,
  }),
];

if (process.env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      id: "dev",
      name: "Development sign-in",
      credentials: {},
      authorize: async () => ({
        id: "dev-user",
        name: "Local Developer",
        email: "dev@plantifiles.local",
        image: null,
      }),
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: config.authSecret,
  trustHost: true,
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (!account) return token;
      const githubId = account.provider === "github" ? String(profile?.id ?? account.providerAccountId) : "dev-user";
      const login = account.provider === "github" && profile && "login" in profile ? String(profile.login) : "local-dev";
      const email = user.email ?? `${login}@users.noreply.github.com`;
      const storedUser = await db.user.upsert({
        where: { githubId },
        create: {
          githubId,
          name: user.name ?? login,
          email,
          avatarUrl: user.image,
        },
        update: {
          name: user.name ?? login,
          email,
          avatarUrl: user.image,
        },
        select: { id: true },
      });
      token.userId = storedUser.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.userId === "string") session.user.id = token.userId;
      return session;
    },
  },
});
