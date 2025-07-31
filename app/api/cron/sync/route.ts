import { NextRequest } from 'next/server';
import { syncAllActiveCalendars } from '@/lib/sync-service';

export async function GET(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron (optional security measure)
    const authHeader = request.headers.get('Authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    console.log('Starting monthly calendar sync...');
    
    await syncAllActiveCalendars();
    
    console.log('Monthly calendar sync completed successfully');
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Calendar sync completed successfully',
      timestamp: new Date().toISOString() 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Cron job failed:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString() 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}