import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
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
  ],
  callbacks: {
    async session({ session, user }) {
      if (user) {
        session.user.id = user.id;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Always redirect to dashboard after successful login, unless explicitly going elsewhere
      if (url.startsWith("/dashboard")) return `${baseUrl}${url}`;
      if (url.startsWith("/") && !url.startsWith("/dashboard")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return `${baseUrl}/dashboard`;
    },
    async jwt({ token, account }) {
      // Save the refresh token when available
      if (account?.refresh_token) {
        console.log('💾 Refresh token available during JWT callback');
        token.refresh_token = account.refresh_token;
      }
      return token;
    },
    async signIn({ account, user, profile }) {
      console.log('🔍 SignIn callback triggered');
      console.log('  Account:', account ? { provider: account.provider, type: account.type, providerAccountId: account.providerAccountId } : 'null');
      console.log('  User:', user ? { id: user.id, email: user.email } : 'null');
      console.log('  Profile:', profile ? { sub: profile.sub, email: profile.email } : 'null');
      
      if (account?.provider === 'google') {
        console.log('🔍 Google sign-in account data:');
        console.log('  Provider:', account.provider);
        console.log('  Has access token:', !!account.access_token);
        console.log('  Has refresh token:', !!account.refresh_token);
        console.log('  Expires at:', account.expires_at);
        console.log('  Scope:', account.scope);
        console.log('  Access type:', account.access_type);
        
        if (!account.refresh_token) {
          console.log('⚠️ No refresh token received from Google');
          
          // Clean up any orphaned user records for this email to prevent conflicts
          if (profile?.email) {
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
                  eq(users.email, profile.email),
                  isNull(accounts.userId)
                ));
              
              if (orphanedUsers.length > 0) {
                console.log(`🧹 Cleaning up ${orphanedUsers.length} orphaned user records for ${profile.email}`);
                for (const orphan of orphanedUsers) {
                  await db.delete(users).where(eq(users.id, orphan.id));
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