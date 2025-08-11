import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from './db';

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
          access_type: 'offline',
          prompt: 'consent select_account',
          include_granted_scopes: 'true',
          // Enhanced security with PKCE
          code_challenge_method: 'S256',
        },
      },
      // Security: Disabled dangerous email account linking to prevent account takeover
      allowDangerousEmailAccountLinking: false,
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null;
          const { users } = await import('./db/schema');
          const { eq } = await import('drizzle-orm');
          const bcrypt: any = await import('bcryptjs');

          const email = credentials.email.toLowerCase().trim();
          const rows = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);
          const user = rows[0] as any;
          if (!user) return null;

          // Block disabled users
          if (user.isDisabled) return null;

          // Only allow admins to use credential login (keeps scope minimal)
          if (!user.isAdmin) return null;

          if (!user.passwordHash) return null;

          const compareFn = (bcrypt as any).compare || (bcrypt as any).default?.compare;
          const isValid = await compareFn(credentials.password, user.passwordHash);
          if (!isValid) return null;

          return {
            id: user.id,
            name: user.name ?? undefined,
            email: user.email ?? undefined,
            image: user.image ?? undefined,
          } as any;
        } catch (e) {
          console.error('Credentials authorize error:', e);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, user, token }) {
      if (user) {
        session.user.id = user.id as any;
      }
      // Ensure we include admin flag on the session for UI gating
      try {
        const { users } = await import('./db/schema');
        const { eq } = await import('drizzle-orm');
        const id = (user as any)?.id || (token?.sub as string | undefined);
        if (id) {
          const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
          const u = rows[0] as any;
          if (u) {
            // @ts-ignore - augmenting session type elsewhere
            session.user.isAdmin = !!u.isAdmin;
            // @ts-ignore
            session.user.isDisabled = !!u.isDisabled;
          }
        }
      } catch (e) {
        // Non-fatal
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Always redirect to dashboard after successful login, unless explicitly going elsewhere
      if (url.startsWith("/dashboard")) return `${baseUrl}${url}`;
      if (url.startsWith("/admin")) return `${baseUrl}${url}`;
      if (url.startsWith("/") && !url.startsWith("/dashboard")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return `${baseUrl}/dashboard`;
    },
    async jwt({ token, account }) {
      // Save the refresh token when available
      if ((account as any)?.refresh_token) {
        console.log('💾 Refresh token available during JWT callback');
        // @ts-ignore
        token.refresh_token = (account as any).refresh_token;
      }
      return token;
    },
    async signIn({ account, user, profile }) {
      console.log('🔍 SignIn callback triggered');
      console.log('  Account:', account ? { provider: account.provider, type: account.type, providerAccountId: account.providerAccountId } : 'null');
      console.log('  User:', user ? { id: (user as any).id, email: user.email } : 'null');
      console.log('  Profile:', profile ? { sub: (profile as any).sub, email: (profile as any).email } : 'null');
      
      // Block disabled users for any provider
      try {
        const { users } = await import('./db/schema');
        const { eq } = await import('drizzle-orm');
        const id = (user as any)?.id as string | undefined;
        if (id) {
          const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
          const u = rows[0] as any;
          if (u?.isDisabled) {
            console.warn('Blocked sign-in for disabled user', id);
            return false;
          }
        }
      } catch (e) {
        // continue
      }
      
      if (account?.provider === 'google') {
        console.log('🔍 Google sign-in account data:');
        console.log('  Provider:', account.provider);
        console.log('  Has access token:', !!account.access_token);
        console.log('  Has refresh token:', !!(account as any).refresh_token);
        console.log('  Expires at:', account.expires_at);
        console.log('  Scope:', account.scope);
        console.log('  Access type:', (account as any).access_type);
        
        if (!(account as any).refresh_token) {
          console.log('⚠️ No refresh token received from Google');
          
          // Clean up any orphaned user records for this email to prevent conflicts
          if ((profile as any)?.email) {
            const { db } = await import('./db');
            const { users, accounts } = await import('./db/schema');
            const { eq, and, isNull } = await import('drizzle-orm');
            
            try {
              // Find users with this email that have no linked accounts
              const orphanedUsers = await db
                .select({ id: users.id })
                .from(users)
                .leftJoin(accounts, eq(accounts.userId, users.id))
                .where(and(
                  eq(users.email, (profile as any).email),
                  isNull(accounts.userId)
                ));
              
              if (orphanedUsers.length > 0) {
                console.log(`🧹 Cleaning up ${orphanedUsers.length} orphaned user records for ${(profile as any).email}`);
                for (const orphan of orphanedUsers) {
                  await db.delete(users).where(eq(users.id, (orphan as any).id));
                }
              }
            } catch (cleanupError) {
              console.warn('Could not cleanup orphaned users:', cleanupError);
            }
          }
          
          // Still allow sign-in but warn about potential issues
          console.log('⚠️ Continuing without refresh token - user may need to re-authenticate later');
        } else {
          console.log('✅ Refresh token received - authentication should work properly');
        }
      }
      
      return true;
    },
  },
};