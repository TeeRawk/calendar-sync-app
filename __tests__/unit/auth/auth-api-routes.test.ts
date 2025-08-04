/**
 * Authentication API Routes Unit Tests
 * Tests auth-related API endpoints with mocked dependencies
 */

import { GET as getTokens } from '@/app/api/debug/tokens/route'
import { POST as forceLogout } from '@/app/api/auth/force-logout/route'
import { GET as checkAuthState } from '@/app/api/debug/check-auth-state/route'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    delete: jest.fn().mockReturnThis(),
  },
}))

jest.mock('@/lib/db/schema', () => ({
  accounts: { userId: 'userId', provider: 'provider', id: 'id' },
  users: { id: 'id' },
  sessions: { userId: 'userId' },
}))

import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'

describe('Authentication API Routes', () => {
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleSpy = jest.spyOn(console, 'log').mockImplementation()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('/api/debug/tokens', () => {
    it('should return user and account info for authenticated user', async () => {
      const mockSession = {
        user: { id: 'user-123', email: 'test@example.com' },
      }
      
      const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
      }

      const mockAccounts = [{
        id: 'account-123',
        provider: 'google',
        providerAccountId: 'google-123',
        access_token: 'access-token-here',
        refresh_token: 'refresh-token-here',
        expires_at: 1234567890,
        token_type: 'Bearer',
        scope: 'openid email profile calendar',
      }]

      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValueOnce([mockUser])
              .mockResolvedValueOnce(mockAccounts),
          }),
        }),
      })

      const response = await getTokens()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user).toEqual({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
      })
      expect(data.accounts).toHaveLength(1)
      expect(data.accounts[0]).toMatchObject({
        provider: 'google',
        hasAccessToken: true,
        hasRefreshToken: true,
        accessTokenPreview: 'access-token-here...',
        refreshTokenPreview: 'refresh-token-here...',
      })
    })

    it('should return 401 for unauthenticated user', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)

      const response = await getTokens()
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Not authenticated')
    })

    it('should handle database errors gracefully', async () => {
      const mockSession = { user: { id: 'user-123' } }
      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      ;(db.select as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection failed')
      })

      const response = await getTokens()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to debug tokens')
    })
  })

  describe('/api/auth/force-logout', () => {
    it('should clear auth data for authenticated user', async () => {
      const mockSession = {
        user: { id: 'user-123', email: 'test@example.com' },
      }

      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      ;(db.delete as jest.Mock).mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      })
      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      })

      const response = await forceLogout()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('All authentication data cleared. Please sign in fresh.')
      expect(consoleSpy).toHaveBeenCalledWith('🧹 Force logout initiated')
      expect(consoleSpy).toHaveBeenCalledWith('✅ All auth data cleared')
    })

    it('should work without authenticated session', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)
      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      })

      const response = await forceLogout()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle database errors gracefully', async () => {
      const mockSession = { user: { id: 'user-123' } }
      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      ;(db.delete as jest.Mock).mockImplementation(() => {
        throw new Error('Database error')
      })

      const response = await forceLogout()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to clear auth data')
    })
  })

  describe('/api/debug/check-auth-state', () => {
    it('should return current database auth state', async () => {
      const mockUsers = [
        { id: 'user-1', email: 'user1@example.com', name: 'User 1' },
        { id: 'user-2', email: 'user2@example.com', name: 'User 2' },
      ]

      const mockAccounts = [
        {
          id: 'account-1',
          userId: 'user-1',
          provider: 'google',
          providerAccountId: 'google-123',
          refresh_token: 'refresh-token',
          access_token: 'access-token',
        },
      ]

      const mockSessions = [
        {
          id: 'session-1',
          userId: 'user-1',
          expires: new Date('2024-12-31'),
        },
      ]

      ;(db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockResolvedValue(mockUsers),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockResolvedValue(mockAccounts),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockResolvedValue(mockSessions),
        })

      const response = await checkAuthState()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users).toHaveLength(2)
      expect(data.accounts).toHaveLength(1)
      expect(data.sessions).toHaveLength(1)
      expect(data.accounts[0]).toMatchObject({
        provider: 'google',
        hasRefreshToken: true,
        hasAccessToken: true,
      })
    })

    it('should handle empty database', async () => {
      ;(db.select as jest.Mock)
        .mockReturnValue({
          from: jest.fn().mockResolvedValue([]),
        })

      const response = await checkAuthState()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users).toHaveLength(0)
      expect(data.accounts).toHaveLength(0)
      expect(data.sessions).toHaveLength(0)
    })

    it('should handle database errors', async () => {
      ;(db.select as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection failed')
      })

      const response = await checkAuthState()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to check auth state')
    })
  })

  describe('Security Tests', () => {
    it('should not expose sensitive token data in debug endpoints', async () => {
      const mockSession = { user: { id: 'user-123' } }
      const mockAccounts = [{
        id: 'account-123',
        provider: 'google',
        access_token: 'very-long-secret-access-token',
        refresh_token: 'very-long-secret-refresh-token',
      }]

      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValueOnce([{}])
              .mockResolvedValueOnce(mockAccounts),
          }),
        }),
      })

      const response = await getTokens()
      const data = await response.json()

      expect(data.accounts[0].accessTokenPreview).toBe('very-long-secret-acc...')
      expect(data.accounts[0].refreshTokenPreview).toBe('very-long-secret-ref...')
      expect(data.accounts[0]).not.toHaveProperty('access_token')
      expect(data.accounts[0]).not.toHaveProperty('refresh_token')
    })

    it('should require authentication for sensitive endpoints', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)

      const response = await getTokens()
      expect(response.status).toBe(401)
    })

    it('should handle malicious user IDs safely', async () => {
      const mockSession = { user: { id: 'user-123\'); DROP TABLE users; --' } }
      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      })

      const response = await getTokens()
      expect(response.status).toBe(200) // Should not crash or cause SQL injection
    })
  })
})