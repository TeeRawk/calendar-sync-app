export async function GET() {
  try {
    console.log('🔍 Running Vercel deployment validation check');
    
    const checks = {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      requiredEnvVars: {},
      cronJobs: {},
      database: 'unknown',
      auth: 'unknown'
    };
    
    // Check required environment variables
    const requiredEnvVars = [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET', 
      'NEXTAUTH_URL',
      'NEXTAUTH_SECRET',
      'DATABASE_URL'
    ];
    
    requiredEnvVars.forEach(envVar => {
      checks.requiredEnvVars[envVar] = {
        present: !!process.env[envVar],
        length: process.env[envVar]?.length || 0
      };
    });
    
    // Check optional environment variables
    const optionalEnvVars = ['CRON_SECRET'];
    optionalEnvVars.forEach(envVar => {
      checks.requiredEnvVars[envVar] = {
        present: !!process.env[envVar],
        length: process.env[envVar]?.length || 0,
        optional: true
      };
    });
    
    // Test cron job endpoints
    try {
      const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
      
      // Test sync cron job
      const syncResponse = await fetch(`${baseUrl}/api/cron/sync`, {
        method: 'GET',
        headers: {
          'User-Agent': 'vercel-cron/1.0',
          ...(process.env.CRON_SECRET && {
            'Authorization': `Bearer ${process.env.CRON_SECRET}`
          })
        }
      });
      
      checks.cronJobs.sync = {
        accessible: syncResponse.ok,
        status: syncResponse.status,
        url: `${baseUrl}/api/cron/sync`
      };
      
      // Test cleanup cron job
      const cleanupResponse = await fetch(`${baseUrl}/api/cron/cleanup`, {
        method: 'GET',
        headers: {
          'User-Agent': 'vercel-cron/1.0',
          ...(process.env.CRON_SECRET && {
            'Authorization': `Bearer ${process.env.CRON_SECRET}`
          })
        }
      });
      
      checks.cronJobs.cleanup = {
        accessible: cleanupResponse.ok,
        status: cleanupResponse.status,
        url: `${baseUrl}/api/cron/cleanup`
      };
      
    } catch (cronError) {
      checks.cronJobs.error = cronError instanceof Error ? cronError.message : 'Failed to test cron jobs';
    }
    
    // Test database connection
    try {
      const { db } = await import('@/lib/db');
      const { users } = await import('@/lib/db/schema');
      
      await db.select().from(users).limit(1);
      checks.database = 'connected';
    } catch (dbError) {
      checks.database = `error: ${dbError instanceof Error ? dbError.message : 'unknown'}`;
    }
    
    // Test auth configuration
    try {
      const { authOptions } = await import('@/lib/auth');
      checks.auth = authOptions ? 'configured' : 'missing';
    } catch (authError) {
      checks.auth = `error: ${authError instanceof Error ? authError.message : 'unknown'}`;
    }
    
    // Determine overall status
    const missingEnvVars = Object.entries(checks.requiredEnvVars)
      .filter(([key, value]) => !value.optional && !value.present)
      .map(([key]) => key);
    
    const cronJobsWorking = checks.cronJobs.sync?.accessible && checks.cronJobs.cleanup?.accessible;
    const databaseWorking = checks.database === 'connected';
    const authWorking = checks.auth === 'configured';
    
    const overallStatus = {
      ready: missingEnvVars.length === 0 && cronJobsWorking && databaseWorking && authWorking,
      issues: []
    };
    
    if (missingEnvVars.length > 0) {
      overallStatus.issues.push(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    }
    
    if (!cronJobsWorking) {
      overallStatus.issues.push('Cron jobs not accessible');
    }
    
    if (!databaseWorking) {
      overallStatus.issues.push('Database connection failed');
    }
    
    if (!authWorking) {
      overallStatus.issues.push('Auth configuration failed');
    }
    
    console.log('✅ Deployment validation complete:', overallStatus);
    
    return Response.json({
      success: true,
      ...checks,
      overallStatus,
      vercelReady: overallStatus.ready
    });
    
  } catch (error) {
    console.error('❌ Deployment validation failed:', error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}