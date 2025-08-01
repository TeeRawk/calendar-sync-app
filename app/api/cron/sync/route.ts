import { NextRequest } from 'next/server';
import { syncAllActiveCalendars } from '@/lib/sync-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get('Authorization');
    const userAgent = request.headers.get('User-Agent');
    
    // Check for Vercel Cron user agent or auth token
    const isVercelCron = userAgent?.includes('vercel-cron') || 
                        authHeader === `Bearer ${process.env.CRON_SECRET}`;
    
    if (process.env.NODE_ENV === 'production' && !isVercelCron) {
      console.log('❌ Unauthorized cron request', { userAgent, hasAuth: !!authHeader });
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 Starting monthly calendar sync...', {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      userAgent: userAgent?.substring(0, 50)
    });
    
    // Validate required environment variables
    const requiredEnvVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DATABASE_URL'];
    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    await syncAllActiveCalendars();
    
    const duration = Date.now() - startTime;
    const successMessage = 'Monthly calendar sync completed successfully';
    
    console.log(`✅ ${successMessage}`, {
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
    return Response.json({ 
      success: true, 
      message: successMessage,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      environment: process.env.NODE_ENV
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('❌ Monthly sync cron job failed:', {
      error: errorMessage,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return Response.json({ 
      success: false, 
      error: errorMessage,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      environment: process.env.NODE_ENV
    }, { status: 500 });
  }
}