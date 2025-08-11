# Comprehensive Testing Strategy for Calendar Sync App

## Executive Summary

This document outlines a comprehensive testing strategy for the calendar sync app's authentication and sync functionality, focusing on identifying and resolving the current 401 unauthorized error. The testing framework is already set up using **Jest** with coverage thresholds and proper TypeScript support.

## Current Testing Infrastructure Analysis

### Framework Setup
- **Testing Framework**: Jest with TypeScript support via `ts-jest`
- **Test Environment**: `jest-environment-jsdom` for browser-like testing
- **Coverage Requirements**: 
  - Statements: >75%
  - Branches: >70%
  - Functions: >75%
  - Lines: >75%
- **Test Structure**: Well-organized with unit, integration, and E2E test directories

### Existing Test Coverage
- ✅ **Token Refresh Tests**: Comprehensive coverage in `__tests__/integration/auth/token-refresh.test.ts`
- ✅ **API Integration Tests**: Good coverage for syncs endpoints
- ✅ **ICS Parser Tests**: Unit tests for calendar data parsing
- ⚠️ **Authentication Flow**: Basic coverage but needs enhancement
- ❌ **Full Sync Workflow**: Limited end-to-end testing

## 1. Authentication Flow Test Strategy

### Critical Authentication Paths

#### 1.1 Google OAuth Flow Tests
```typescript
describe('Google OAuth Flow', () => {
  it('should complete full OAuth authorization with proper scopes')
  it('should handle consent screen properly')
  it('should store refresh token correctly')
  it('should handle authorization code exchange')
  it('should detect missing refresh tokens')
})
```

#### 1.2 Session Management Tests
```typescript
describe('Session Management', () => {
  it('should create valid NextAuth session')
  it('should include user ID in session')
  it('should handle session expiration')
  it('should validate admin flags')
  it('should handle disabled users')
})
```

#### 1.3 Token Storage and Validation Tests
```typescript
describe('Token Storage', () => {
  it('should store tokens securely in database')
  it('should validate token structure')
  it('should handle token corruption')
  it('should clean up orphaned accounts')
})
```

## 2. Token Refresh Mechanism Tests (Enhanced)

### Current Coverage Analysis
The existing token refresh tests are comprehensive, covering:
- ✅ Automatic token refresh on expiration
- ✅ Proactive token refresh before expiration
- ✅ Refresh token expiration handling
- ✅ Network error handling
- ✅ Concurrent refresh prevention
- ✅ Token security (no logging of sensitive data)

### Additional Test Coverage Needed
```typescript
describe('Token Refresh Edge Cases', () => {
  it('should handle Google API rate limiting during refresh')
  it('should handle partial token refresh failures')
  it('should validate refreshed token scopes')
  it('should handle token refresh during active sync operations')
  it('should detect and handle revoked refresh tokens')
})
```

## 3. Calendar Sync Test Strategy

### 3.1 ICS Data Processing Tests
```typescript
describe('ICS Processing', () => {
  it('should fetch ICS data from URLs with proper headers')
  it('should handle ICS parsing errors gracefully')
  it('should expand recurring events correctly')
  it('should handle timezone conversions')
  it('should validate event data integrity')
})
```

### 3.2 Google Calendar API Integration Tests
```typescript
describe('Google Calendar API', () => {
  it('should authenticate properly with stored tokens')
  it('should create events with correct timezone')
  it('should update existing events')
  it('should handle API rate limiting')
  it('should detect and handle 401 authentication errors')
  it('should retry failed operations')
})
```

### 3.3 Sync Logic Tests
```typescript
describe('Sync Logic', () => {
  it('should identify new vs existing events')
  it('should handle duplicate events')
  it('should process batch operations efficiently')
  it('should maintain sync state consistency')
  it('should handle partial sync failures')
})
```

## 4. Integration Tests for Full Sync Workflow

### 4.1 End-to-End Sync Tests
```typescript
describe('Full Sync Workflow', () => {
  it('should complete full sync with valid authentication')
  it('should handle authentication renewal during sync')
  it('should recover from temporary API failures')
  it('should maintain data consistency across retries')
  it('should log sync results properly')
})
```

### 4.2 Multi-User Sync Tests
```typescript
describe('Multi-User Scenarios', () => {
  it('should handle concurrent syncs for different users')
  it('should isolate sync errors between users')
  it('should handle user authentication expiry independently')
})
```

## 5. Edge Cases and Error Scenario Tests

### 5.1 Authentication Error Scenarios
```typescript
describe('Authentication Errors', () => {
  it('should handle 401 Unauthorized responses')
  it('should detect invalid or expired access tokens')
  it('should handle missing refresh tokens gracefully')
  it('should force re-authentication when necessary')
  it('should handle Google API permission changes')
})
```

### 5.2 Network and API Failure Tests
```typescript
describe('Network Failures', () => {
  it('should handle network timeouts')
  it('should retry with exponential backoff')
  it('should handle DNS resolution failures')
  it('should handle partial data corruption')
})
```

### 5.3 Data Integrity Tests
```typescript
describe('Data Integrity', () => {
  it('should validate ICS data format')
  it('should handle malformed calendar data')
  it('should detect and prevent data corruption')
  it('should handle database connection failures')
})
```

## 6. Critical Paths for 401 Error Debugging

### 6.1 Immediate Debugging Tests (High Priority)

Based on the codebase analysis, these tests should be implemented first:

```typescript
describe('401 Error Root Cause Analysis', () => {
  it('should verify Google OAuth client configuration', () => {
    // Test GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are valid
    // Test OAuth scopes are correctly requested
    // Test redirect URIs are properly configured
  })
  
  it('should validate stored account tokens', () => {
    // Test account exists in database for authenticated user
    // Test access_token is not null/expired
    // Test refresh_token exists and is valid
    // Test token structure matches Google OAuth response
  })
  
  it('should test token refresh mechanism', () => {
    // Test automatic token refresh on 401
    // Test refresh token validation
    // Test database update after refresh
    // Test credentials are properly set on OAuth client
  })
  
  it('should validate Google Calendar API requests', () => {
    // Test calendar.calendarList.list() with current tokens
    // Test error handling for 401 responses
    // Test proper error propagation
    // Test authentication state cleanup on failure
  })
})
```

### 6.2 Authentication State Validation Tests
```typescript
describe('Authentication State Validation', () => {
  it('should validate session-to-database consistency', () => {
    // Test session.user.id matches database user
    // Test session contains required authentication data
    // Test session expiry aligns with token expiry
  })
  
  it('should validate Google account linking', () => {
    // Test account.userId references correct user
    // Test account.provider is 'google'
    // Test account contains all required OAuth fields
  })
})
```

## 7. Performance and Load Testing

### 7.1 Performance Tests
```typescript
describe('Performance', () => {
  it('should handle large ICS files efficiently')
  it('should sync multiple calendars within time limits')
  it('should handle high-frequency token refreshes')
  it('should maintain performance under concurrent load')
})
```

### 7.2 Memory and Resource Tests
```typescript
describe('Resource Usage', () => {
  it('should not leak memory during sync operations')
  it('should clean up resources after failed operations')
  it('should handle large event datasets efficiently')
})
```

## 8. Implementation Priority and Timeline

### Phase 1: Critical 401 Debugging (Week 1)
1. **OAuth Configuration Tests** - Validate client setup
2. **Token Storage/Retrieval Tests** - Check database consistency  
3. **Token Refresh Mechanism Tests** - Enhance existing coverage
4. **Google API Authentication Tests** - Direct API validation

### Phase 2: Enhanced Authentication Flow (Week 2)
1. **Session Management Tests** - NextAuth integration
2. **Error Handling Tests** - 401 response scenarios
3. **Account Linking Tests** - OAuth account association
4. **Authentication State Tests** - Cross-component validation

### Phase 3: Comprehensive Sync Testing (Week 3)
1. **End-to-End Sync Tests** - Full workflow validation
2. **Error Recovery Tests** - Resilience scenarios
3. **Multi-User Tests** - Concurrent operation handling
4. **Performance Tests** - Load and stress testing

### Phase 4: Edge Cases and Hardening (Week 4)
1. **Edge Case Scenarios** - Boundary condition testing
2. **Security Tests** - Token security and validation
3. **Integration Tests** - Cross-service communication
4. **Regression Tests** - Prevent future issues

## 9. Recommended Test Implementations for Immediate 401 Debugging

### Test File: `__tests__/debug/auth-401-analysis.test.ts`
```typescript
import { getGoogleCalendarClient, getUserCalendars } from '@/lib/google-calendar'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { accounts, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

describe('401 Authentication Error Analysis', () => {
  it('should validate OAuth environment configuration', async () => {
    expect(process.env.GOOGLE_CLIENT_ID).toBeDefined()
    expect(process.env.GOOGLE_CLIENT_SECRET).toBeDefined()
    expect(process.env.NEXTAUTH_URL).toBeDefined()
    expect(process.env.NEXTAUTH_SECRET).toBeDefined()
  })
  
  it('should validate user session and account linking', async () => {
    // Test with a known user ID
    const mockUserId = 'test-user-id'
    
    // Check user exists
    const user = await db.select().from(users).where(eq(users.id, mockUserId)).limit(1)
    expect(user[0]).toBeDefined()
    
    // Check Google account is linked
    const account = await db.select().from(accounts)
      .where(eq(accounts.userId, mockUserId))
      .limit(1)
    
    expect(account[0]).toBeDefined()
    expect(account[0].provider).toBe('google')
    expect(account[0].access_token).toBeTruthy()
    expect(account[0].refresh_token).toBeTruthy()
  })
  
  it('should test Google Calendar API authentication directly', async () => {
    try {
      const calendars = await getUserCalendars()
      expect(calendars).toBeDefined()
      expect(Array.isArray(calendars)).toBe(true)
    } catch (error) {
      // Capture and analyze the exact error
      console.error('Google Calendar API Error:', error)
      expect(error).toBeInstanceOf(Error)
      
      if (error.message.includes('401')) {
        // This confirms our 401 error - now we need to trace why
        fail('401 Error confirmed - need to investigate token validity')
      }
    }
  })
})
```

## 10. Test Data and Mocking Strategy

### Mock Data Setup
```typescript
// Test utilities for consistent mock data
export const createMockAuthSession = (overrides = {}) => ({
  user: { id: 'test-user-123', email: 'test@example.com' },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  ...overrides
})

export const createMockGoogleAccount = (overrides = {}) => ({
  id: 'account-123',
  userId: 'test-user-123',
  provider: 'google',
  access_token: 'valid-access-token',
  refresh_token: 'valid-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  ...overrides
})
```

## 11. Monitoring and Observability for Tests

### Test Logging Strategy
- **Authentication Events**: Log all authentication attempts and failures
- **Token Operations**: Track token creation, refresh, and expiry
- **API Interactions**: Monitor all Google Calendar API calls
- **Error Patterns**: Identify recurring error scenarios

### Test Metrics to Track
- **Authentication Success Rate**: Percentage of successful authentications
- **Token Refresh Success Rate**: Percentage of successful token refreshes  
- **Sync Completion Rate**: Percentage of successful sync operations
- **Error Frequency**: Rate of 401 and other authentication errors

## Conclusion

This testing strategy provides comprehensive coverage for identifying and resolving the 401 authentication error while establishing a robust foundation for ongoing quality assurance. The immediate focus should be on the Phase 1 tests to quickly diagnose the root cause of the authentication issues.

The existing test infrastructure is solid, and the current token refresh tests demonstrate good practices. By implementing the recommended debugging tests and following the phased approach, we can systematically identify and resolve authentication issues while building confidence in the system's reliability.