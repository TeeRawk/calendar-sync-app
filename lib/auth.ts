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
          scope: 'openid email profile https://www.googleapis.com/auth/calendar',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
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
      // Log what we receive from Google
      if (account?.provider === 'google') {
        console.log('🔍 Google sign-in account data:');
        console.log('  Provider:', account.provider);
        console.log('  Has access token:', !!account.access_token);
        console.log('  Has refresh token:', !!account.refresh_token);
        console.log('  Expires at:', account.expires_at);
        console.log('  Scope:', account.scope);
        console.log('  Access type:', account.access_type);
        
        if (!account.refresh_token) {
          console.log('⚠️ No refresh token received from Google - this will cause issues later');
        } else {
          console.log('✅ Refresh token received - authentication should work properly');
        }
      }
      return true;
    },
  },
};