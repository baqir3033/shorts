import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getDb, isDbConfigured, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * Auth.js with guest Credentials provider.
 * Creates/ensures a Neon user when DATABASE_URL is set; otherwise session-only guest.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: {
        name: { label: "Name", type: "text" },
      },
      async authorize(credentials) {
        const name =
          typeof credentials?.name === "string" && credentials.name.trim()
            ? credentials.name.trim()
            : "Creator";
        const email = `guest-${slug(name)}@shorts.local`;

        if (isDbConfigured()) {
          try {
            const db = getDb();
            const existing = await db
              .select()
              .from(schema.users)
              .where(eq(schema.users.email, email))
              .limit(1);
            if (existing[0]) {
              return {
                id: existing[0].id,
                email: existing[0].email,
                name: existing[0].name ?? name,
              };
            }
            const inserted = await db
              .insert(schema.users)
              .values({ email, name })
              .returning();
            return {
              id: inserted[0].id,
              email: inserted[0].email,
              name: inserted[0].name ?? name,
            };
          } catch {
            // Fall through to ephemeral guest
          }
        }

        return {
          id: `local-${slug(name)}`,
          email,
          name,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "anonymous";
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
  trustHost: true,
});

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "user";
}
