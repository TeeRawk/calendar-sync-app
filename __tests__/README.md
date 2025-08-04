# Calendar Sync App - Testing Framework

## Overview

This comprehensive testing framework provides robust test coverage for the calendar sync application, including unit tests, integration tests, and end-to-end tests.

## Test Structure

```
__tests__/
├── unit/                    # Unit tests for individual components
│   └── lib/
│       ├── ics-parser.test.ts      ✅ Working - ICS parsing logic
│       ├── google-calendar.test.ts  📝 Comprehensive Google Calendar API tests
│       ├── sync-service.test.ts     📝 Sync service functionality tests
│       └── db.test.ts              📝 Database operations tests
├── integration/             # Integration tests for API endpoints
│   └── api/
│       ├── syncs.test.ts           📝 Full API endpoint tests
│       └── syncs-simple.test.ts    📝 Simplified integration tests
├── e2e/                    # End-to-end tests for user workflows
│   └── calendar-sync-flow.test.ts  📝 Complete user journey tests
└── test-utils/             # Shared testing utilities
    └── index.ts            📝 Mocks, factories, and helpers
```

## Key Features

### 1. Comprehensive Test Coverage

- **Unit Tests**: Individual function and module testing
- **Integration Tests**: API endpoint and service integration testing
- **E2E Tests**: Complete user workflow testing
- **Performance Tests**: Load and efficiency testing
- **Security Tests**: Input validation and XSS/injection prevention

### 2. Testing Utilities

- **Mock Factories**: Pre-built mock data generators
- **Test Helpers**: Utilities for async testing, error handling, and time manipulation
- **Console Capture**: Tools for testing logging and error output
- **Database Mocks**: Comprehensive Drizzle ORM mocking

### 3. Enhanced Jest Configuration

- **Multiple Test Environments**: jsdom for UI, node for API/backend
- **Coverage Thresholds**: 80% function/line coverage, 75% branch coverage
- **Extended Timeouts**: 30s for integration and E2E tests
- **Performance Optimizations**: 50% max workers, parallel execution

## Test Categories

### Unit Tests (✅ Working)

#### ICS Parser Tests (`ics-parser.test.ts`)
- ✅ Basic ICS data parsing
- ✅ Timezone extraction and handling
- ✅ Recurrence rule preservation
- ✅ Error handling for malformed data
- ✅ Edge cases (invalid dates, special characters, long descriptions)

#### Google Calendar Tests (`google-calendar.test.ts`)
- 📝 OAuth2 client creation and configuration
- 📝 Token refresh and authentication handling
- 📝 Calendar listing and event creation
- 📝 Event updates and existing event fetching
- 📝 Timezone conversion and error handling

#### Sync Service Tests (`sync-service.test.ts`)
- 📝 Calendar synchronization workflow
- 📝 Event processing (create/update logic)
- 📝 Error handling and partial failures
- 📝 Performance testing with large event sets
- 📝 Concurrent sync operations

#### Database Tests (`db.test.ts`)
- 📝 CRUD operations for calendar syncs
- 📝 Query optimization and complex joins
- 📝 Transaction handling and rollbacks
- 📝 Error handling and constraint validation
- 📝 Performance testing with large datasets

### Integration Tests

#### API Endpoint Tests (`syncs.test.ts`)
- 📝 GET /api/syncs - fetch user calendar syncs
- 📝 POST /api/syncs - create new calendar sync
- 📝 Authentication and authorization
- 📝 Input validation and sanitization
- 📝 Error handling and edge cases

### End-to-End Tests

#### Complete User Workflows (`calendar-sync-flow.test.ts`)
- 📝 New user onboarding flow
- 📝 Calendar sync creation and execution
- 📝 Authentication and token refresh flows
- 📝 Error recovery scenarios
- 📝 Performance testing with realistic data loads

## Test Data and Mocks

### Mock Factories
```typescript
// Calendar sync mock
const mockSync = createMockCalendarSync({
  name: 'Test Calendar',
  icsUrl: 'https://example.com/calendar.ics',
  googleCalendarId: 'primary'
})

// Calendar event mock
const mockEvent = createMockCalendarEvent({
  summary: 'Test Meeting',
  start: new Date('2024-03-01T10:00:00Z'),
  end: new Date('2024-03-01T11:00:00Z')
})
```

### API Mocks
- Google Calendar API responses
- NextAuth session handling
- Database query results
- HTTP fetch responses

## Coverage Requirements

Current thresholds set in `jest.config.js`:
- **Statements**: 80%
- **Branches**: 75%  
- **Functions**: 80%
- **Lines**: 80%

## Running Tests

```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit
npm run test:integration  
npm run test:e2e

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

## Key Testing Patterns

### 1. Arrange-Act-Assert Pattern
```typescript
it('should create calendar sync successfully', async () => {
  // Arrange
  const syncData = createMockCalendarSync()
  mockDb.returning.mockResolvedValue([syncData])
  
  // Act
  const result = await createSync(syncData)
  
  // Assert
  expect(result).toMatchObject(syncData)
  expect(mockDb.insert).toHaveBeenCalledWith(syncData)
})
```

### 2. Error Testing
```typescript
it('should handle authentication errors', async () => {
  mockGoogleCalendar.getCalendars.mockRejectedValue(
    new Error('Authentication expired')
  )
  
  await expectAsyncThrow(
    () => syncCalendar('sync-123'),
    'Authentication expired'
  )
})
```

### 3. Performance Testing
```typescript
it('should sync large calendar efficiently', async () => {
  const startTime = Date.now()
  
  const largeEventSet = Array.from({ length: 1000 }, createMockEvent)
  const result = await syncCalendar(largeEventSet)
  
  const duration = Date.now() - startTime
  expect(duration).toBeLessThan(5000) // Under 5 seconds
})
```

## Security Testing

### Input Validation
- XSS prevention in calendar names and descriptions
- SQL injection prevention (via Drizzle ORM parameterization)
- URL validation for ICS endpoints
- Authentication state validation

### Data Sanitization
- HTML entity encoding for user inputs
- URL protocol validation
- File size and content type checking

## Best Practices

1. **Test Independence**: Each test should be able to run in isolation
2. **Mock External Dependencies**: Always mock HTTP requests, database calls, and third-party APIs
3. **Clear Test Names**: Describe what is being tested and expected outcome
4. **Edge Case Coverage**: Test boundary conditions and error scenarios
5. **Performance Awareness**: Include performance assertions for critical paths

## Future Enhancements

1. **Visual Regression Testing**: Add screenshot comparisons for UI components
2. **Load Testing**: Implement stress testing for high-volume sync operations
3. **Contract Testing**: Add API contract testing with tools like Pact
4. **Mutation Testing**: Verify test quality with mutation testing tools
5. **Real Browser E2E**: Integrate Playwright or Cypress for true E2E testing

## Troubleshooting

### Common Issues

1. **Mock Import Errors**: Ensure all external dependencies are properly mocked
2. **Async Test Failures**: Use `await` for all async operations and proper timeout handling
3. **TypeScript Errors**: Check type definitions for mocked modules
4. **Coverage Gaps**: Use `--coverage` flag to identify untested code paths

### Debug Commands
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- path/to/test.ts

# Debug mode
npm test -- --debug

# Update snapshots
npm test -- --updateSnapshot
```

## Status Summary

### ✅ Completed
- Basic Jest configuration with Next.js integration
- Comprehensive test utilities and mock factories
- Working ICS parser unit tests
- Enhanced Jest setup with global mocks
- Test structure and organization

### 📝 In Progress
- Fixing module import issues with Next.js and NextAuth
- Completing Google Calendar integration tests
- Finalizing API endpoint integration tests

### 🎯 Next Steps
1. Resolve NextAuth and ESM module compatibility issues
2. Complete unit test coverage for all lib modules
3. Implement working integration tests for API endpoints
4. Add performance benchmarks and thresholds
5. Set up continuous integration test automation

This testing framework provides a solid foundation for maintaining high code quality and preventing regressions as the calendar sync application evolves.