import { NextRequest, NextResponse } from 'next/server';
import { aiDevOrchestrator, type BranchIsolationMetadata } from '@/lib/ai/ai-dev/orchestrator';
import { contextManager } from '@/lib/ai/ai-dev/context-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await aiDevOrchestrator.getJob(id);

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    const patches = await aiDevOrchestrator.getJobPatches(id);
    const approvals = await aiDevOrchestrator.getJobApprovals(id);
    const runs = await aiDevOrchestrator.getJobRuns(id);
    
    const branchMetadata = (job.branchMetadata as BranchIsolationMetadata | null) || undefined;
    
    const contextSummary = await contextManager.summarizeContext(id);

    return NextResponse.json({
      success: true,
      job: {
        ...job,
        branchMetadata: branchMetadata ? {
          branchName: branchMetadata.branchName,
          originalBranch: branchMetadata.originalBranch,
          branchMerged: branchMetadata.branchMerged,
        } : undefined,
      },
      patches,
      approvals,
      runs,
      contextSummary: contextSummary || undefined,
    });
  } catch (error) {
    console.error('[AI Dev Jobs] Error getting job:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get job' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, reason } = body;

    const job = await aiDevOrchestrator.getJob(id);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    switch (action) {
      case 'execute': {
        if (job.status !== 'pending') {
          return NextResponse.json(
            { success: false, error: 'Job must be in pending status to execute' },
            { status: 400 }
          );
        }

        aiDevOrchestrator.executeJob(id).catch(err => {
          console.error(`[AI Dev Jobs] Execution failed for job ${id}:`, err);
        });

        return NextResponse.json({
          success: true,
          message: 'Job execution started',
        });
      }

      case 'approve': {
        if (job.status !== 'review') {
          return NextResponse.json(
            { success: false, error: 'Job must be in review status to approve' },
            { status: 400 }
          );
        }

        const approved = await aiDevOrchestrator.approveJob(id);
        return NextResponse.json({
          success: approved,
          message: approved ? 'Job approved and patches applied' : 'Failed to apply patches',
        });
      }

      case 'reject': {
        const rejected = await aiDevOrchestrator.rejectJob(id, reason);
        return NextResponse.json({
          success: rejected,
          message: rejected ? 'Job rejected' : 'Failed to reject job',
        });
      }

      case 'rollback': {
        if (job.status !== 'applied') {
          return NextResponse.json(
            { success: false, error: 'Job must be in applied status to rollback' },
            { status: 400 }
          );
        }

        const rolledBack = await aiDevOrchestrator.rollbackJob(id);
        return NextResponse.json({
          success: rolledBack,
          message: rolledBack ? 'Job rolled back successfully' : 'Failed to rollback job',
        });
      }

      case 'cancel': {
        const cancelled = await aiDevOrchestrator.cancelJob(id);
        return NextResponse.json({
          success: cancelled,
          message: cancelled ? 'Job cancelled' : 'Job was not running',
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[AI Dev Jobs] Error performing action:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to perform action' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cancelled = await aiDevOrchestrator.cancelJob(id);

    return NextResponse.json({
      success: true,
      cancelled,
      message: cancelled ? 'Job cancelled' : 'Job was not running',
    });
  } catch (error) {
    console.error('[AI Dev Jobs] Error cancelling job:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cancel job' },
      { status: 500 }
    );
  }
}
