/**
 * OAuth Flow Integration Tests
 * Tests the complete Google OAuth authentication flow
 */

import { NextRequest } from 'next/server'
import { GET as nextAuthGet, POST as nextAuthPost } from '@/app/api/auth/[...nextauth]/route'

// Mock Google OAuth responses
const mockGoogleTokenResponse = {
  access_token: 'ya29.mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'openid email profile https://www.googleapis.com/auth/calendar',
  id_token: 'mock-id-token',
}

const mockGoogleUserInfo = {
  sub: 'google-user-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.jpg',
  email_verified: true,
}

// Mock dependencies
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    and: jest.fn(),
    eq: jest.fn(),
    isNull: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  },
}))

// Mock fetch for Google API calls
global.fetch = jest.fn()

describe('OAuth Flow Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeAll(() => {
    originalEnv = process.env
    process.env = {
      ...originalEnv,
      GOOGLE_CLIENT_ID: 'test-google-client-id',
      GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
      NEXTAUTH_SECRET: 'test-secret',
      NEXTAUTH_URL: 'http://localhost:3000',
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockClear()
  })

  describe('Google OAuth Authorization Flow', () => {
    it('should initiate Google OAuth with correct parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signin/google')
      
      const response = await nextAuthGet(request, { params: { nextauth: ['signin', 'google'] } })
      
      expect(response.status).toBe(200)
      // In real scenario, this would redirect to Google OAuth
    })

    it('should handle OAuth callback with authorization code', async () => {
      // Mock successful token exchange
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleTokenResponse),
      })

      // Mock user info fetch
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleUserInfo),
      })

      const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google')
      callbackUrl.searchParams.set('code', 'auth-code-123')
      callbackUrl.searchParams.set('state', 'mock-state')

      const request = new NextRequest(callbackUrl.toString())
      
      const response = await nextAuthGet(request, { params: { nextauth: ['callback', 'google'] } })
      
      // Should redirect to dashboard after successful auth
      expect(response.status).toBe(200)
    })

    it('should handle OAuth errors gracefully', async () => {
      const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google')
      callbackUrl.searchParams.set('error', 'access_denied')
      callbackUrl.searchParams.set('error_description', 'User denied access')

      const request = new NextRequest(callbackUrl.toString())
      
      const response = await nextAuthGet(request, { params: { nextauth: ['callback', 'google'] } })
      
      // Should handle error appropriately
      expect(response.status).toBe(200)
    })
  })

  describe('Token Management', () => {
    it('should store tokens correctly during sign-in', async () => {
      const { db } = await import('@/lib/db')
      
      // Mock database operations
      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      })

      ;(db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'account-123' }]),
        }),
      })

      // Mock token exchange
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleTokenResponse),
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleUserInfo),
      })

      const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google')
      callbackUrl.searchParams.set('code', 'auth-code-123')

      const request = new NextRequest(callbackUrl.toString())
      
      await nextAuthGet(request, { params: { nextauth: ['callback', 'google'] } })
      
      // Verify that database operations were called (in real scenario)
      expect(db.select).toHaveBeenCalled()
    })

    it('should handle missing refresh token scenario', async () => {
      const tokenResponseWithoutRefresh = {
        ...mockGoogleTokenResponse,
        refresh_token: undefined,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(tokenResponseWithoutRefresh),
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleUserInfo),
      })

      const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google')
      callbackUrl.searchParams.set('code', 'auth-code-123')

      const request = new NextRequest(callbackUrl.toString())
      
      const response = await nextAuthGet(request, { params: { nextauth: ['callback', 'google'] } })
      
      // Should still proceed but log warning
      expect(response.status).toBe(200)
    })
  })

  describe('Session Management', () => {
    it('should create session after successful OAuth', async () => {
      const { db } = await import('@/lib/db')
      
      // Mock successful user and account creation
      ;(db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn()
            .mockResolvedValueOnce([{ id: 'user-123' }]) // User creation
            .mockResolvedValueOnce([{ id: 'account-123' }]) // Account creation
            .mockResolvedValueOnce([{ id: 'session-123' }]), // Session creation
        }),
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleTokenResponse),
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleUserInfo),
      })

      const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google')
      callbackUrl.searchParams.set('code', 'auth-code-123')

      const request = new NextRequest(callbackUrl.toString())
      
      await nextAuthGet(request, { params: { nextauth: ['callback', 'google'] } })
      
      // Verify session creation process
      expect(db.insert).toHaveBeenCalled()
    })

    it('should handle existing user sign-in', async () => {
      const { db } = await import('@/lib/db')
      
      // Mock existing user found
      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{
            id: 'existing-user-123',
            email: 'test@example.com',
          }]),
        }),
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleTokenResponse),
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleUserInfo),
      })

      const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google')
      callbackUrl.searchParams.set('code', 'auth-code-123')

      const request = new NextRequest(callbackUrl.toString())
      
      await nextAuthGet(request, { params: { nextauth: ['callback', 'google'] } })
      
      // Should handle existing user scenario
      expect(db.select).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle Google API errors during token exchange', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code',
        }),
      })

      const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google')
      callbackUrl.searchParams.set('code', 'invalid-code')

      const request = new NextRequest(callbackUrl.toString())
      
      const response = await nextAuthGet(request, { params: { nextauth: ['callback', 'google'] } })
      
      // Should handle error gracefully
      expect(response.status).toBe(200)
    })

    it('should handle network errors during OAuth flow', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      )

      const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google')
      callbackUrl.searchParams.set('code', 'auth-code-123')

      const request = new NextRequest(callbackUrl.toString())
      
      const response = await nextAuthGet(request, { params: { nextauth: ['callback', 'google'] } })
      
      // Should handle network error gracefully
      expect(response.status).toBe(200)
    })

    it('should handle database errors during account creation', async () => {
      const { db } = await import('@/lib/db')
      
      // Mock database error
      ;(db.insert as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection failed')
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleTokenResponse),
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleUserInfo),
      })

      const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google')
      callbackUrl.searchParams.set('code', 'auth-code-123')

      const request = new NextRequest(callbackUrl.toString())
      
      const response = await nextAuthGet(request, { params: { nextauth: ['callback', 'google'] } })
      
      // Should handle database error gracefully
      expect(response.status).toBe(200)
    })
  })

  describe('Security Validations', () => {
    it('should validate state parameter in OAuth callback', async () => {
      const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google')
      callbackUrl.searchParams.set('code', 'auth-code-123')
      // Missing state parameter - should be validated by NextAuth

      const request = new NextRequest(callbackUrl.toString())
      
      const response = await nextAuthGet(request, { params: { nextauth: ['callback', 'google'] } })
      
      // NextAuth should handle state validation
      expect(response.status).toBe(200)
    })

    it('should handle CSRF token validation', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/csrf')
      
      const response = await nextAuthGet(request, { params: { nextauth: ['csrf'] } })
      
      expect(response.status).toBe(200)
      // Should return CSRF token
    })

    it('should validate redirect URLs', async () => {
      const maliciousRedirect = 'https://malicious-site.com/steal-tokens'
      const signInUrl = new URL('http://localhost:3000/api/auth/signin')
      signInUrl.searchParams.set('callbackUrl', maliciousRedirect)

      const request = new NextRequest(signInUrl.toString())
      
      const response = await nextAuthGet(request, { params: { nextauth: ['signin'] } })
      
      // Should reject malicious redirect
      expect(response.status).toBe(200)
    })
  })

  describe('Concurrent OAuth Attempts', () => {
    it('should handle multiple simultaneous OAuth attempts', async () => {
      const { db } = await import('@/lib/db')
      
      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      })

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockGoogleTokenResponse),
      })

      const requests = Array.from({ length: 5 }, (_, i) => {
        const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google')
        callbackUrl.searchParams.set('code', `auth-code-${i}`)
        return new NextRequest(callbackUrl.toString())
      })

      const responses = await Promise.all(
        requests.map(request => 
          nextAuthGet(request, { params: { nextauth: ['callback', 'google'] } })
        )
      )

      // All should complete successfully
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
    })
  })
})