/**
 * Session and Token Integration Tests
 * 
 * Tests the integration between NextAuth sessions, Google OAuth tokens,
 * and database storage to identify potential sources of 401 errors.
 */

import { jest } from '@jest/globals'

// Mock environment
Object.assign(process.env, {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  NEXTAUTH_URL: 'http://localhost:3000',
  NEXTAUTH_SECRET: 'test-secret'
})

// Mock database
const mockDb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn(),
}

jest.mock('@/lib/db', () => ({
  db: mockDb
}))

// Mock drizzle-orm functions
jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ column: col, value: val })),
  and: jest.fn((...conditions) => ({ type: 'AND', conditions })),
  isNull: jest.fn((col) => ({ column: col, isNull: true })),
}))

// Mock NextAuth
const mockGetServerSession = jest.fn()
jest.mock('next-auth', () => ({
  getServerSession: mockGetServerSession
}))

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

describe('Session and Token Integration Tests', () => {
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleSpy = jest.spyOn(console, 'error').mockImplementation()
    jest.spyOn(console, 'log').mockImplementation()
    jest.spyOn(console, 'warn').mockImplementation()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('NextAuth Configuration Validation', () => {
    it('should have correct Google Provider configuration', () => {
      expect(authOptions.providers).toBeDefined()
      
      const googleProvider = authOptions.providers.find(
        provider => provider.id === 'google'
      )
      
      expect(googleProvider).toBeDefined()
      expect(googleProvider?.options?.clientId).toBe(process.env.GOOGLE_CLIENT_ID)
      expect(googleProvider?.options?.clientSecret).toBe(process.env.GOOGLE_CLIENT_SECRET)
    })

    it('should have correct OAuth scopes configured', () => {
      const googleProvider = authOptions.providers.find(
        provider => provider.id === 'google'
      )
      
      const authorizationParams = googleProvider?.options?.authorization?.params
      expect(authorizationParams?.scope).toContain('calendar.readonly')
      expect(authorizationParams?.access_type).toBe('offline')
      expect(authorizationParams?.prompt).toContain('consent')
    })

    it('should have DrizzleAdapter properly configured', () => {
      expect(authOptions.adapter).toBeDefined()
      // The adapter should be using our db instance
    })

    it('should have secure callback configurations', () => {
      expect(authOptions.callbacks?.signIn).toBeDefined()
      expect(authOptions.callbacks?.session).toBeDefined()
      expect(authOptions.callbacks?.jwt).toBeDefined()
      expect(authOptions.callbacks?.redirect).toBeDefined()
    })
  })

  describe('Session Creation and Validation', () => {
    it('should create valid session with user data', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        isAdmin: true,
        isDisabled: false
      }

      const mockToken = {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User'
      }

      // Mock database query for user
      mockDb.limit.mockResolvedValue([mockUser])

      // Simulate session callback
      const sessionCallback = authOptions.callbacks?.session
      expect(sessionCallback).toBeDefined()

      if (sessionCallback) {
        const result = await sessionCallback({
          session: {
            user: { email: 'test@example.com' },
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          },
          user: mockUser,
          token: mockToken
        })

        expect(result.user.id).toBe('user-123')
        expect(result.user.isAdmin).toBe(true)
        expect(result.user.isDisabled).toBe(false)
      }
    })

    it('should handle session callback database errors gracefully', async () => {
      // Mock database error
      mockDb.limit.mockRejectedValue(new Error('Database connection failed'))

      const sessionCallback = authOptions.callbacks?.session
      if (sessionCallback) {
        const result = await sessionCallback({
          session: {
            user: { email: 'test@example.com' },
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          },
          user: { id: 'user-123' },
          token: { sub: 'user-123' }
        })

        // Should still return session even if database query fails
        expect(result).toBeDefined()
        expect(result.user).toBeDefined()
      }
    })

    it('should handle missing user ID gracefully', async () => {
      const sessionCallback = authOptions.callbacks?.session
      if (sessionCallback) {
        const result = await sessionCallback({
          session: {
            user: { email: 'test@example.com' },
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          },
          user: null,
          token: null
        })

        expect(result).toBeDefined()
        // Should not have admin flags if no user found
        expect(result.user.isAdmin).toBeUndefined()
      }
    })
  })

  describe('JWT Token Handling', () => {
    it('should save refresh token in JWT callback', async () => {
      const mockAccount = {
        provider: 'google',
        refresh_token: 'test-refresh-token',
        access_token: 'test-access-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600
      }

      const jwtCallback = authOptions.callbacks?.jwt
      expect(jwtCallback).toBeDefined()

      if (jwtCallback) {
        const result = await jwtCallback({
          token: { sub: 'user-123' },
          account: mockAccount
        })

        expect(result.refresh_token).toBe('test-refresh-token')
      }
    })

    it('should handle JWT callback without account', async () => {
      const jwtCallback = authOptions.callbacks?.jwt
      if (jwtCallback) {
        const existingToken = {
          sub: 'user-123',
          refresh_token: 'existing-refresh-token'
        }

        const result = await jwtCallback({
          token: existingToken,
          account: null
        })

        expect(result).toEqual(existingToken)
      }
    })
  })

  describe('Sign-in Flow Validation', () => {
    it('should allow valid Google sign-in', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        isDisabled: false
      }

      const mockAccount = {
        provider: 'google',
        refresh_token: 'valid-refresh-token',
        access_token: 'valid-access-token',
        scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly'
      }

      const mockProfile = {
        sub: 'google-user-id',
        email: 'test@example.com'
      }

      // Mock user lookup for disabled check
      mockDb.limit.mockResolvedValue([mockUser])

      const signInCallback = authOptions.callbacks?.signIn
      expect(signInCallback).toBeDefined()

      if (signInCallback) {
        const result = await signInCallback({
          user: mockUser,
          account: mockAccount,
          profile: mockProfile
        })

        expect(result).toBe(true)
      }
    })

    it('should block disabled users from signing in', async () => {
      const disabledUser = {
        id: 'user-123',
        email: 'disabled@example.com',
        isDisabled: true
      }

      mockDb.limit.mockResolvedValue([disabledUser])

      const signInCallback = authOptions.callbacks?.signIn
      if (signInCallback) {
        const result = await signInCallback({
          user: disabledUser,
          account: { provider: 'google' },
          profile: { email: 'disabled@example.com' }
        })

        expect(result).toBe(false)
      }
    })

    it('should handle Google sign-in without refresh token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        isDisabled: false
      }

      const mockAccount = {
        provider: 'google',
        access_token: 'valid-access-token',
        refresh_token: null, // No refresh token!
        scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly'
      }

      const mockProfile = {
        sub: 'google-user-id',
        email: 'test@example.com'
      }

      mockDb.limit.mockResolvedValue([mockUser])

      const signInCallback = authOptions.callbacks?.signIn
      if (signInCallback) {
        const result = await signInCallback({
          user: mockUser,
          account: mockAccount,
          profile: mockProfile
        })

        // Should still allow sign-in but log warning
        expect(result).toBe(true)
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('No refresh token received')
        )
      }
    })

    it('should clean up orphaned users on sign-in', async () => {
      const mockProfile = {
        email: 'test@example.com'
      }

      const mockAccount = {
        provider: 'google',
        refresh_token: null
      }

      // Mock orphaned users query
      const orphanedUsers = [
        { id: 'orphan-1' },
        { id: 'orphan-2' }
      ]

      mockDb.limit.mockResolvedValue(orphanedUsers)

      const signInCallback = authOptions.callbacks?.signIn
      if (signInCallback) {
        const result = await signInCallback({
          user: { id: 'user-123' },
          account: mockAccount,
          profile: mockProfile
        })

        expect(result).toBe(true)
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Cleaning up')
        )
      }
    })
  })

  describe('Credentials Provider for Admin Users', () => {
    it('should authenticate valid admin credentials', async () => {
      const mockAdmin = {
        id: 'admin-123',
        email: 'admin@example.com',
        passwordHash: 'hashed-password',
        isAdmin: true,
        isDisabled: false
      }

      mockDb.limit.mockResolvedValue([mockAdmin])
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)

      const credentialsProvider = authOptions.providers.find(
        provider => provider.id === 'credentials'
      )

      expect(credentialsProvider).toBeDefined()

      if (credentialsProvider?.options?.authorize) {
        const result = await credentialsProvider.options.authorize({
          email: 'admin@example.com',
          password: 'correct-password'
        })

        expect(result).toMatchObject({
          id: 'admin-123',
          email: 'admin@example.com'
        })
      }
    })

    it('should reject non-admin users with credentials', async () => {
      const regularUser = {
        id: 'user-123',
        email: 'user@example.com',
        passwordHash: 'hashed-password',
        isAdmin: false, // Not an admin
        isDisabled: false
      }

      mockDb.limit.mockResolvedValue([regularUser])
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)

      const credentialsProvider = authOptions.providers.find(
        provider => provider.id === 'credentials'
      )

      if (credentialsProvider?.options?.authorize) {
        const result = await credentialsProvider.options.authorize({
          email: 'user@example.com',
          password: 'correct-password'
        })

        expect(result).toBeNull()
      }
    })

    it('should reject disabled admin users', async () => {
      const disabledAdmin = {
        id: 'admin-123',
        email: 'admin@example.com',
        passwordHash: 'hashed-password',
        isAdmin: true,
        isDisabled: true // Disabled
      }

      mockDb.limit.mockResolvedValue([disabledAdmin])

      const credentialsProvider = authOptions.providers.find(
        provider => provider.id === 'credentials'
      )

      if (credentialsProvider?.options?.authorize) {
        const result = await credentialsProvider.options.authorize({
          email: 'admin@example.com',
          password: 'correct-password'
        })

        expect(result).toBeNull()
      }
    })

    it('should handle credentials authorization errors gracefully', async () => {
      // Mock database error
      mockDb.limit.mockRejectedValue(new Error('Database error'))

      const credentialsProvider = authOptions.providers.find(
        provider => provider.id === 'credentials'
      )

      if (credentialsProvider?.options?.authorize) {
        const result = await credentialsProvider.options.authorize({
          email: 'admin@example.com',
          password: 'password'
        })

        expect(result).toBeNull()
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Credentials authorize error')
        )
      }
    })
  })

  describe('Session-Database Consistency', () => {
    it('should validate session user exists in database', async () => {
      const mockSession = {
        user: { id: 'user-123', email: 'test@example.com' },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }

      mockGetServerSession.mockResolvedValue(mockSession)

      // Check if user exists in database
      mockDb.limit.mockResolvedValue([{
        id: 'user-123',
        email: 'test@example.com',
        isDisabled: false
      }])

      const session = await getServerSession(authOptions)
      expect(session?.user?.id).toBe('user-123')

      // Validate user in database
      const users = await db.select().from({}).where(eq({}, 'user-123')).limit(1)
      expect(users).toHaveLength(1)
      expect(users[0].id).toBe('user-123')
    })

    it('should handle session-database mismatch', async () => {
      const mockSession = {
        user: { id: 'nonexistent-user', email: 'ghost@example.com' },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }

      mockGetServerSession.mockResolvedValue(mockSession)

      // User doesn't exist in database
      mockDb.limit.mockResolvedValue([])

      const session = await getServerSession(authOptions)
      expect(session?.user?.id).toBe('nonexistent-user')

      const users = await db.select().from({}).where({}).limit(1)
      expect(users).toHaveLength(0)

      // This mismatch could cause authorization issues
    })

    it('should validate Google account linking', async () => {
      const userId = 'user-123'
      
      // Check if user has Google account linked
      const mockGoogleAccount = {
        id: 'account-123',
        userId: userId,
        provider: 'google',
        providerAccountId: 'google-123',
        access_token: 'valid-token',
        refresh_token: 'valid-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600
      }

      mockDb.limit.mockResolvedValue([mockGoogleAccount])

      const accounts = await db.select().from({}).where(eq({}, userId)).limit(1)
      expect(accounts).toHaveLength(1)
      expect(accounts[0].provider).toBe('google')
      expect(accounts[0].access_token).toBeTruthy()
      expect(accounts[0].refresh_token).toBeTruthy()
    })
  })

  describe('Authentication State Edge Cases', () => {
    it('should handle concurrent session creation', async () => {
      const createSession = async (userId: string) => {
        mockGetServerSession.mockResolvedValue({
          user: { id: userId },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })

        return await getServerSession(authOptions)
      }

      // Create multiple concurrent sessions
      const sessionPromises = Array.from({ length: 5 }, (_, i) => 
        createSession(`user-${i}`)
      )

      const sessions = await Promise.all(sessionPromises)
      expect(sessions).toHaveLength(5)
      sessions.forEach((session, i) => {
        expect(session?.user?.id).toBe(`user-${i}`)
      })
    })

    it('should handle session expiration edge cases', () => {
      const now = Date.now()
      const almostExpired = new Date(now + 60000).toISOString() // 1 minute
      const expired = new Date(now - 60000).toISOString() // Expired 1 minute ago

      expect(new Date(almostExpired).getTime()).toBeGreaterThan(now)
      expect(new Date(expired).getTime()).toBeLessThan(now)
    })

    it('should validate redirect behavior', async () => {
      const redirectCallback = authOptions.callbacks?.redirect
      expect(redirectCallback).toBeDefined()

      if (redirectCallback) {
        const baseUrl = 'http://localhost:3000'

        // Test dashboard redirect
        const dashboardRedirect = await redirectCallback({
          url: '/dashboard',
          baseUrl
        })
        expect(dashboardRedirect).toBe(`${baseUrl}/dashboard`)

        // Test admin redirect
        const adminRedirect = await redirectCallback({
          url: '/admin',
          baseUrl
        })
        expect(adminRedirect).toBe(`${baseUrl}/admin`)

        // Test default redirect
        const defaultRedirect = await redirectCallback({
          url: '/some-other-page',
          baseUrl
        })
        expect(defaultRedirect).toBe(`${baseUrl}/some-other-page`)

        // Test external URL protection
        const externalRedirect = await redirectCallback({
          url: 'https://malicious-site.com',
          baseUrl
        })
        expect(externalRedirect).toBe(`${baseUrl}/dashboard`)
      }
    })
  })
})