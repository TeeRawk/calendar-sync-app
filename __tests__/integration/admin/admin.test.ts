import request from 'supertest';

// Basic integration tests to ensure admin endpoints are protected

describe('Admin endpoints', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request('http://localhost:3000').get('/api/admin/users');
    // We can't assert exact code here without server running; placeholder to ensure file exists
    expect([401, 403, 307, 308]).toContain(res.status);
  });
});
