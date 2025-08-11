import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '@/app/api/admin/cleanup-duplicates/route';
import { getServerSession } from 'next-auth';
import { db } from '@/lib/db';

// Mock external dependencies
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {
    query: {
      users: {
        findFirst: jest.fn(),
      },
      cleanupOperations: {
        findFirst: jest.fn(),
      },
      cleanupBackups: {
        findFirst: jest.fn(),
      },
    },
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'test-operation-id' }]),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(1),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(1),
    }),
  },
}));

jest.mock('@/lib/duplicate-cleanup-service', () => ({
  DuplicateCleanupService: jest.fn().mockImplementation(() => ({
    analyzeDuplicates: jest.fn().mockResolvedValue({
      totalEvents: 10,
      duplicateGroups: [
        {
          groupId: 'test-group-1',
          primaryEvent: {
            id: 'primary-1',
            title: 'Test Event',
            startDateTime: '2024-01-01T10:00:00Z',
            calendarId: 'primary',
          },
          duplicates: [
            {
              id: 'duplicate-1',
              title: 'Test Event',
              startDateTime: '2024-01-01T10:00:00Z',
              calendarId: 'primary',
            },
          ],
          matchType: 'exact',
          confidence: 100,
        },
      ],
      summary: {
        exactMatches: 1,
        fuzzyMatches: 0,
        patternMatches: 0,
        totalDuplicates: 1,
      },
    }),
    cleanupDuplicates: jest.fn().mockResolvedValue({
      groupsAnalyzed: 1,
      duplicatesFound: 1,
      duplicatesDeleted: 1,
      errors: [],
      warnings: [],
      deletedEventIds: ['duplicate-1'],
      preservedEventIds: ['primary-1'],
      operationId: 'test-operation',
      backupId: 'test-backup',
    }),
  })),
}));

const mockSession = {
  user: {
    id: 'test-user-id',
    email: 'admin@test.com',
  },
};

const mockAdminUser = {
  id: 'test-user-id',
  email: 'admin@test.com',
  isAdmin: true,
  isDisabled: false,
};

const mockNonAdminUser = {
  id: 'test-user-id',
  email: 'user@test.com',
  isAdmin: false,
  isDisabled: false,
};

describe('/api/admin/cleanup-duplicates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(mockAdminUser);
  });

  describe('GET requests', () => {
    test('should return 401 for unauthenticated requests', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates?action=analyze');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    test('should return 403 for non-admin users', async () => {
      (db.query.users.findFirst as jest.Mock).mockResolvedValue(mockNonAdminUser);

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates?action=analyze');
      const response = await GET(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('FORBIDDEN');
    });

    test('should list cleanup operations', async () => {
      const mockOperations = [
        {
          id: 'op-1',
          operationId: 'cleanup_123',
          mode: 'dry-run',
          status: 'completed',
          createdAt: '2024-01-01T10:00:00Z',
        },
      ];

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockOperations),
          }),
        }),
      });

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates?action=list-operations');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.operations).toEqual(mockOperations);
    });

    test('should analyze duplicates with calendar IDs', async () => {
      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates?action=analyze&calendarId=primary&calendarId=test-calendar');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.totalEvents).toBe(10);
      expect(data.duplicateGroups).toHaveLength(1);
      expect(data.summary.totalDuplicates).toBe(1);
    });

    test('should return 400 for analyze action without calendar IDs', async () => {
      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates?action=analyze');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('At least one calendarId is required');
    });

    test('should handle analyze with filters', async () => {
      const filters = {
        dateRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z',
        },
        titlePatterns: ['Meeting'],
      };

      const request = new NextRequest(`http://localhost/api/admin/cleanup-duplicates?action=analyze&calendarId=primary&filters=${encodeURIComponent(JSON.stringify(filters))}`);
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    test('should return operation details', async () => {
      const mockOperation = {
        id: 'op-1',
        operationId: 'cleanup_123',
        mode: 'batch',
        status: 'completed',
        backupId: 'backup_123',
      };

      const mockBackup = {
        id: 'backup-1',
        backupId: 'backup_123',
        metadata: { note: 'Test backup' },
      };

      const mockDeletedEvents = [
        {
          id: 'deleted-1',
          googleEventId: 'event-123',
          eventTitle: 'Deleted Event',
        },
      ];

      (db.query.cleanupOperations.findFirst as jest.Mock).mockResolvedValue(mockOperation);
      (db.query.cleanupBackups.findFirst as jest.Mock).mockResolvedValue(mockBackup);
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockDeletedEvents),
          }),
        }),
      });

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates?action=operation-details&operationId=cleanup_123');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.operation).toEqual(mockOperation);
      expect(data.backup.backupId).toBe('backup_123');
      expect(data.deletedEvents).toHaveLength(1);
    });

    test('should return 404 for non-existent operation', async () => {
      (db.query.cleanupOperations.findFirst as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates?action=operation-details&operationId=invalid');
      const response = await GET(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Operation not found');
    });
  });

  describe('POST requests', () => {
    test('should perform cleanup operation', async () => {
      const requestBody = {
        action: 'cleanup',
        calendarIds: ['primary'],
        options: {
          mode: 'batch',
          maxDeletions: 10,
          createBackup: true,
        },
      };

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.operationId).toBeDefined();
      expect(data.result.duplicatesDeleted).toBe(1);

      // Verify database operations
      expect(db.insert).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
    });

    test('should validate cleanup request', async () => {
      const invalidRequest = {
        action: 'cleanup',
        // Missing required calendarIds
        options: {
          mode: 'batch',
        },
      };

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates', {
        method: 'POST',
        body: JSON.stringify(invalidRequest),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Validation error');
    });

    test('should restore deleted events', async () => {
      const mockOperation = {
        id: 'op-1',
        operationId: 'cleanup_123',
        status: 'completed',
      };

      const mockDeletedEvents = [
        {
          id: 'deleted-1',
          googleEventId: 'event-123',
          eventTitle: 'Test Event',
          canRestore: true,
        },
      ];

      (db.query.cleanupOperations.findFirst as jest.Mock).mockResolvedValue(mockOperation);
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(mockDeletedEvents),
        }),
      });

      const requestBody = {
        action: 'restore',
        operationId: 'cleanup_123',
      };

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.restored).toBe(1);
      expect(data.restoredEventIds).toContain('event-123');
    });

    test('should cancel running operation', async () => {
      const requestBody = {
        action: 'cancel',
        operationId: 'cleanup_123',
      };

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify operation was updated to cancelled
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('DELETE requests', () => {
    test('should delete cleanup operation', async () => {
      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates?operationId=cleanup_123', {
        method: 'DELETE',
      });

      const response = await DELETE(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify operation was deleted
      expect(db.delete).toHaveBeenCalled();
    });

    test('should return 400 for missing operationId', async () => {
      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates', {
        method: 'DELETE',
      });

      const response = await DELETE(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('operationId is required');
    });

    test('should return 404 for non-existent operation', async () => {
      (db.delete as jest.Mock).mockReturnValue({
        where: jest.fn().mockResolvedValue(0), // No rows deleted
      });

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates?operationId=invalid', {
        method: 'DELETE',
      });

      const response = await DELETE(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Operation not found');
    });
  });

  describe('Error handling', () => {
    test('should handle service errors gracefully', async () => {
      const { DuplicateCleanupService } = require('@/lib/duplicate-cleanup-service');
      const mockService = new DuplicateCleanupService();
      mockService.analyzeDuplicates.mockRejectedValue(new Error('Google API error'));

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates?action=analyze&calendarId=primary');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });

    test('should handle database errors', async () => {
      (db.select as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection error');
      });

      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates?action=list-operations');
      const response = await GET(request);

      expect(response.status).toBe(500);
    });

    test('should validate JSON parsing errors', async () => {
      const request = new NextRequest('http://localhost/api/admin/cleanup-duplicates', {
        method: 'POST',
        body: 'invalid json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });
});