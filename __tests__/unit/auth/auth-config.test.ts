/**
 * Authentication Configuration Unit Tests
 * Tests the NextAuth configuration and callbacks
 */

import { authOptions } from '@/lib/auth'
import { DrizzleAdapter } from '@auth/drizzle-adapter'

// Mock dependencies
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}))

describe('Authentication Configuration', () => {
  describe('authOptions structure', () => {
    it('should have correct provider configuration', () => {
      expect(authOptions.providers).toHaveLength(1)
      expect(authOptions.providers[0]).toMatchObject({
        id: 'google',
        name: 'Google',
        type: 'oauth',
      })
    })

    it('should use DrizzleAdapter', () => {
      expect(authOptions.adapter).toBeDefined()
    })

    it('should have correct Google OAuth scopes', () => {
      const googleProvider = authOptions.providers[0] as any
      expect(googleProvider.authorization.params.scope).toBe(
        'openid email profile https://www.googleapis.com/auth/calendar'
      )
      expect(googleProvider.authorization.params.access_type).toBe('offline')
      expect(googleProvider.authorization.params.prompt).toBe('consent select_account')
    })

    it('should allow dangerous email account linking', () => {
      const googleProvider = authOptions.providers[0] as any
      expect(googleProvider.allowDangerousEmailAccountLinking).toBe(true)
    })
  })

  describe('session callback', () => {
    it('should add user id to session', async () => {
      const mockSession = {
        user: { email: 'test@example.com', name: 'Test User' },
        expires: '2024-12-31',
      }
      const mockUser = { id: 'user-123' }

      const result = await authOptions.callbacks!.session!({
        session: mockSession,
        user: mockUser,
        token: {} as any,
      })

      expect(result.user.id).toBe('user-123')
      expect(result.user.email).toBe('test@example.com')
    })

    it('should handle missing user gracefully', async () => {
      const mockSession = {
        user: { email: 'test@example.com', name: 'Test User' },
        expires: '2024-12-31',
      }

      const result = await authOptions.callbacks!.session!({
        session: mockSession,
        user: undefined as any,
        token: {} as any,
      })

      expect(result.user).not.toHaveProperty('id')
      expect(result.user.email).toBe('test@example.com')
    })
  })

  describe('jwt callback', () => {
    it('should save refresh token when available', async () => {
      const mockToken = { sub: 'user-123' }
      const mockAccount = { refresh_token: 'refresh-token-123' }

      const result = await authOptions.callbacks!.jwt!({
        token: mockToken,
        account: mockAccount,
        user: {} as any,
      })

      expect(result.refresh_token).toBe('refresh-token-123')
    })

    it('should not modify token when no refresh token', async () => {
      const mockToken = { sub: 'user-123' }
      const mockAccount = { access_token: 'access-token-123' }

      const result = await authOptions.callbacks!.jwt!({
        token: mockToken,
        account: mockAccount,
        user: {} as any,
      })

      expect(result.refresh_token).toBeUndefined()
      expect(result.sub).toBe('user-123')
    })
  })

  describe('redirect callback', () => {
    const baseUrl = 'http://localhost:3000'

    it('should redirect to dashboard by default', async () => {
      const result = await authOptions.callbacks!.redirect!({
        url: '/some-path',
        baseUrl,
      })

      expect(result).toBe(`${baseUrl}/dashboard`)
    })

    it('should allow dashboard redirects', async () => {
      const result = await authOptions.callbacks!.redirect!({
        url: '/dashboard/new-sync',
        baseUrl,
      })

      expect(result).toBe(`${baseUrl}/dashboard/new-sync`)
    })

    it('should handle full URLs within same origin', async () => {
      const fullUrl = `${baseUrl}/dashboard`
      const result = await authOptions.callbacks!.redirect!({
        url: fullUrl,
        baseUrl,
      })

      expect(result).toBe(fullUrl)
    })

    it('should redirect external URLs to dashboard', async () => {
      const result = await authOptions.callbacks!.redirect!({
        url: 'https://malicious-site.com',
        baseUrl,
      })

      expect(result).toBe(`${baseUrl}/dashboard`)
    })
  })

  describe('signIn callback', () => {
    let consoleSpy: jest.SpyInstance

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    it('should allow Google sign-in with refresh token', async () => {
      const mockAccount = {
        provider: 'google',
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_at: Date.now() + 3600000,
        scope: 'openid email profile calendar',
      }

      const result = await authOptions.callbacks!.signIn!({
        account: mockAccount,
        user: { id: 'user-123', email: 'test@example.com' },
        profile: { sub: 'google-123', email: 'test@example.com' },
      })

      expect(result).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('✅ Refresh token received - authentication should work properly')
    })

    it('should handle missing refresh token with cleanup', async () => {
      const mockAccount = {
        provider: 'google',
        access_token: 'access-token-123',
        refresh_token: undefined,
        expires_at: Date.now() + 3600000,
        scope: 'openid email profile calendar',
      }

      const result = await authOptions.callbacks!.signIn!({
        account: mockAccount,
        user: { id: 'user-123', email: 'test@example.com' },
        profile: { sub: 'google-123', email: 'test@example.com' },
      })

      expect(result).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('⚠️ No refresh token received from Google')
      expect(consoleSpy).toHaveBeenCalledWith('⚠️ Continuing without refresh token - user may need to re-authenticate later')
    })

    it('should allow non-Google providers', async () => {
      const mockAccount = { provider: 'github' }

      const result = await authOptions.callbacks!.signIn!({
        account: mockAccount,
        user: { id: 'user-123', email: 'test@example.com' },
        profile: { sub: 'github-123', email: 'test@example.com' },
      })

      expect(result).toBe(true)
    })
  })
})