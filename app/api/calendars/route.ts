import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserCalendars } from '@/lib/google-calendar';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const calendars = await getUserCalendars();
    
    return Response.json(calendars);
  } catch (error: any) {
    console.error('Failed to fetch calendars:', error);
    
    // Handle reauth required
    if (error.message === 'REAUTH_REQUIRED') {
      return Response.json(
        { error: 'REAUTH_REQUIRED', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Handle other authentication errors
    if (error.message?.includes('authentication expired') || error.message?.includes('No Google account connected')) {
      return Response.json(
        { error: 'REAUTH_REQUIRED', message: error.message },
        { status: 401 }
      );
    }
    
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch calendars' },
      { status: 500 }
    );
  }
}