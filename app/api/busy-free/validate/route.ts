import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/auth';
import { parseBusyFreeICS, BusyFreeCalendar } from '../../../../lib/busy-free-parser';
import { isBusyFreeCalendar, detectPrivacyLevel } from '../../../../lib/busy-free-sync-service';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { icsUrl } = await request.json();

    if (!icsUrl) {
      return NextResponse.json({ error: 'Missing icsUrl' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(icsUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Check if it looks like a busy/free calendar
    const isBusyFree = isBusyFreeCalendar(icsUrl);

    try {
      // Try to parse the calendar to validate it
      const testDateRange = {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      };

      console.log(`🔒 Validating busy/free calendar: ${icsUrl}`);
      const busyFreeData: BusyFreeCalendar = await parseBusyFreeICS(icsUrl, testDateRange);

      // Detect privacy level
      const eventSummaries = busyFreeData.events.map(e => e.summary);
      const detectedPrivacyLevel = detectPrivacyLevel(icsUrl, eventSummaries);

      // Analyze event distribution
      const busyEvents = busyFreeData.events.filter(e => e.status === 'busy').length;
      const freeEvents = busyFreeData.events.filter(e => e.status === 'free').length;

      // Check for common busy/free indicators
      const hasBusyFreeEvents = busyEvents > 0 || freeEvents > 0;
      const hasOnlyGenericSummaries = eventSummaries.every(summary => 
        ['busy', 'free', 'unavailable', 'available'].includes(summary.toLowerCase())
      );

      const validation = {
        isValid: true,
        isBusyFreeCalendar: isBusyFree || hasBusyFreeEvents || hasOnlyGenericSummaries,
        calendarInfo: {
          name: busyFreeData.calendarName,
          timezone: busyFreeData.timezone,
          eventCount: busyFreeData.events.length,
          busyEvents,
          freeEvents,
        },
        detectedPrivacyLevel,
        recommendations: [] as string[],
        warnings: [] as string[],
      };

      // Add recommendations
      if (validation.isBusyFreeCalendar) {
        validation.recommendations.push('This appears to be a busy/free calendar suitable for privacy-compliant syncing');
        
        if (detectedPrivacyLevel === 'busy_only') {
          validation.recommendations.push('Recommended privacy level: "Busy Only" - shows only time blocks without details');
        } else if (detectedPrivacyLevel === 'show_free_busy') {
          validation.recommendations.push('Recommended privacy level: "Show Free/Busy" - shows availability status');
        }
      } else {
        validation.warnings.push('This may not be a busy/free calendar - events may contain detailed information');
        validation.recommendations.push('Consider using privacy level "Busy Only" to protect sensitive information');
      }

      if (busyFreeData.events.length === 0) {
        validation.warnings.push('No events found in the specified date range - this may be normal for busy/free calendars');
      }

      if (!busyFreeData.timezone) {
        validation.warnings.push('No timezone information found - events may have incorrect times');
      }

      return NextResponse.json({
        success: true,
        validation,
        sampleEvents: busyFreeData.events.slice(0, 5).map(event => ({
          summary: event.summary,
          status: event.status,
          transparency: event.transparency,
          start: event.start.toISOString(),
          end: event.end.toISOString(),
        })),
      });

    } catch (parseError) {
      console.error('Error validating busy/free calendar:', parseError);
      
      return NextResponse.json({
        success: false,
        validation: {
          isValid: false,
          isBusyFreeCalendar: false,
          error: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
        },
        recommendations: [
          'Check if the URL is accessible and returns valid ICS data',
          'Ensure the calendar contains busy/free information',
          'Verify the URL format matches the expected pattern',
        ],
      });
    }

  } catch (error) {
    console.error('Error in busy/free validation:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to validate busy/free calendar URL' 
    }, { status: 500 });
  }
}