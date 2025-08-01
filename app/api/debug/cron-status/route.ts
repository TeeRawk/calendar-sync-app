export async function GET() {
  try {
    console.log('📊 Checking cron job status');
    
    // Test both cron endpoints
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    
    const [syncTest, cleanupTest] = await Promise.allSettled([
      fetch(`${baseUrl}/api/cron/sync`, { method: 'GET' }),
      fetch(`${baseUrl}/api/cron/cleanup`, { method: 'GET' })
    ]);
    
    const syncStatus = syncTest.status === 'fulfilled' 
      ? { 
          status: 'working', 
          statusCode: syncTest.value.status,
          response: syncTest.value.ok ? 'OK' : 'Error'
        }
      : { 
          status: 'error', 
          error: syncTest.reason?.message || 'Failed to test'
        };
    
    const cleanupStatus = cleanupTest.status === 'fulfilled'
      ? { 
          status: 'working', 
          statusCode: cleanupTest.value.status,
          response: cleanupTest.value.ok ? 'OK' : 'Error'
        }
      : { 
          status: 'error', 
          error: cleanupTest.reason?.message || 'Failed to test'
        };
    
    const cronConfig = {
      sync: {
        path: '/api/cron/sync',
        schedule: '0 0 1 * *', // Monthly on 1st at midnight
        description: 'Monthly calendar sync'
      },
      cleanup: {
        path: '/api/cron/cleanup', 
        schedule: '0 2 * * 0', // Weekly on Sunday at 2 AM
        description: 'Weekly auth cleanup'
      }
    };
    
    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      cronJobs: {
        sync: {
          ...cronConfig.sync,
          ...syncStatus
        },
        cleanup: {
          ...cronConfig.cleanup,
          ...cleanupStatus
        }
      },
      environment: process.env.NODE_ENV || 'development',
      baseUrl
    });
  } catch (error) {
    console.error('❌ Failed to check cron status:', error);
    return Response.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check cron status',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}