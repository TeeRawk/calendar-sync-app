import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { 
  DuplicateCleanupService, 
  analyzeDuplicates,
  CleanupOptions,
  CleanupResult,
  CleanupAnalysis 
} from '@/lib/duplicate-cleanup';

// Schema validation
interface CleanupRequest {
  action: 'analyze' | 'cleanup';
  calendarIds: string[];
  options?: Partial<CleanupOptions> & {
    confirmDeletion?: boolean;
  };
}

/**
 * GET /api/admin/cleanup-duplicates - Get cleanup status or analysis
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user[0]?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'status';

    if (action === 'status') {
      return NextResponse.json({
        status: 'ready',
        availableActions: ['analyze', 'cleanup'],
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error in cleanup duplicates GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/cleanup-duplicates - Analyze or cleanup duplicates
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user[0]?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body: CleanupRequest = await request.json();

    // Validate request
    if (!body.action || !body.calendarIds || !Array.isArray(body.calendarIds)) {
      return NextResponse.json({ 
        error: 'Invalid request. Required: action, calendarIds' 
      }, { status: 400 });
    }

    if (!['analyze', 'cleanup'].includes(body.action)) {
      return NextResponse.json({ 
        error: 'Invalid action. Must be "analyze" or "cleanup"' 
      }, { status: 400 });
    }

    console.log(`🔧 Admin ${session.user.email} requested ${body.action} for calendars:`, body.calendarIds);

    if (body.action === 'analyze') {
      // Analyze duplicates without making changes
      const analysis: CleanupAnalysis = await analyzeDuplicates(
        body.calendarIds,
        body.options
      );

      console.log(`📊 Analysis complete: ${analysis.duplicateGroups.length} duplicate groups found`);

      return NextResponse.json({
        success: true,
        action: 'analyze',
        analysis,
        timestamp: new Date().toISOString(),
      });

    } else if (body.action === 'cleanup') {
      // Perform actual cleanup
      const options: CleanupOptions = {
        mode: 'batch', // Default to batch mode for API
        maxDeletions: 25, // Conservative limit
        preserveOldest: true,
        skipWithAttendees: true,
        ...body.options,
      };

      // Safety check - require explicit confirmation for non-dry-run
      if (options.mode !== 'dry-run' && !body.options?.confirmDeletion) {
        return NextResponse.json({
          error: 'Confirmation required for actual deletion. Set confirmDeletion: true in options.',
          suggestedAction: 'Run with mode: "dry-run" first to preview changes',
        }, { status: 400 });
      }

      console.log(`🧹 Starting cleanup with options:`, options);

      const service = new DuplicateCleanupService(options);
      const result: CleanupResult = await service.cleanupDuplicates(body.calendarIds);

      console.log(`✅ Cleanup complete: ${result.duplicatesDeleted} events deleted`);

      // Log the admin action
      console.log(`📝 Admin action logged: ${session.user.email} ${options.mode === 'dry-run' ? 'previewed' : 'deleted'} ${result.duplicatesDeleted} duplicate events`);

      return NextResponse.json({
        success: true,
        action: 'cleanup',
        result,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error in cleanup duplicates POST:', error);
    
    // Return more specific error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('Calendar not found')) {
      return NextResponse.json(
        { error: 'One or more calendars not found or not accessible' },
        { status: 404 }
      );
    }
    
    if (errorMessage.includes('quota')) {
      return NextResponse.json(
        { error: 'Google Calendar API quota exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}