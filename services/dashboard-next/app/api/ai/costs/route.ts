import { NextRequest, NextResponse } from 'next/server';
import { 
  getCostSummary, 
  resetDailyCosts, 
  costTracker,
  type CostSummary 
} from '@/lib/ai/cost-tracker';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    
    let date: Date | undefined;
    if (dateParam) {
      date = new Date(dateParam);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format' },
          { status: 400 }
        );
      }
    }

    const summary = getCostSummary(date);
    const dailyStats = costTracker.getDailyStats(date);

    return NextResponse.json({
      success: true,
      data: {
        summary,
        stats: dailyStats ? {
          date: dailyStats.date,
          totalRequests: dailyStats.totalRequests,
          recordCount: dailyStats.records.length,
        } : null,
        config: costTracker.getConfig(),
      },
    });
  } catch (error: any) {
    console.error('[AI Costs API] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, date, config } = body;

    if (action === 'reset') {
      let targetDate: Date | undefined;
      if (date) {
        targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
          return NextResponse.json(
            { error: 'Invalid date format' },
            { status: 400 }
          );
        }
      }
      
      resetDailyCosts(targetDate);
      
      return NextResponse.json({
        success: true,
        message: `Daily costs reset for ${targetDate ? targetDate.toISOString().split('T')[0] : 'today'}`,
      });
    }

    if (action === 'updateConfig' && config) {
      costTracker.setConfig(config);
      
      return NextResponse.json({
        success: true,
        message: 'Configuration updated',
        config: costTracker.getConfig(),
      });
    }

    if (action === 'forceLocalOnly') {
      const enabled = body.enabled ?? true;
      costTracker.forceLocalOnlyMode(enabled);
      
      return NextResponse.json({
        success: true,
        message: `Local-only mode ${enabled ? 'enabled' : 'disabled'}`,
        localOnlyMode: costTracker.isLocalOnlyMode(),
      });
    }

    if (action === 'cleanup') {
      const daysToKeep = body.daysToKeep ?? 7;
      const removed = costTracker.cleanupOldStats(daysToKeep);
      
      return NextResponse.json({
        success: true,
        message: `Cleaned up ${removed} old entries`,
        removed,
      });
    }

    if (action === 'export') {
      const exportData = costTracker.exportStats();
      
      return NextResponse.json({
        success: true,
        data: exportData,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use: reset, updateConfig, forceLocalOnly, cleanup, or export' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[AI Costs API] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
