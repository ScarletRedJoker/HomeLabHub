import { pool } from '../db';
import { dbStorage as storage } from '../database-storage';

let retentionInterval: NodeJS.Timeout | null = null;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const TICKET_ARCHIVE_DAYS = 30;
const LOG_RETENTION_DAYS = 90;
const AI_CACHE_EXPIRY_HOURS = 48;

export interface RetentionJobResult {
  jobType: string;
  recordsProcessed: number;
  recordsArchived: number;
  recordsDeleted: number;
  status: 'completed' | 'failed';
  errorMessage?: string;
  durationMs: number;
}

async function logJobRun(
  jobType: string, 
  result: Partial<RetentionJobResult>
): Promise<number> {
  const res = await pool.query(
    `INSERT INTO retention_job_runs 
     (job_type, records_processed, records_archived, records_deleted, status, error_message, completed_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
     RETURNING id`,
    [
      jobType,
      result.recordsProcessed || 0,
      result.recordsArchived || 0,
      result.recordsDeleted || 0,
      result.status || 'completed',
      result.errorMessage || null,
      JSON.stringify({ durationMs: result.durationMs })
    ]
  );
  return res.rows[0].id;
}

export async function archiveOldTickets(): Promise<RetentionJobResult> {
  const startTime = Date.now();
  let recordsProcessed = 0;
  let recordsArchived = 0;
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - TICKET_ARCHIVE_DAYS);

    const ticketsResult = await pool.query(
      `SELECT t.* FROM tickets t
       WHERE t.status = 'closed' 
       AND t.updated_at < $1
       AND NOT EXISTS (
         SELECT 1 FROM archived_tickets at WHERE at.original_ticket_id = t.id
       )
       LIMIT 100`,
      [cutoffDate]
    );

    const ticketsToArchive = ticketsResult.rows;
    recordsProcessed = ticketsToArchive.length;

    for (const ticket of ticketsToArchive) {
      await pool.query('BEGIN');
      
      try {
        const archiveResult = await pool.query(
          `INSERT INTO archived_tickets 
           (original_ticket_id, discord_id, title, description, status, priority, 
            category_id, creator_id, assignee_id, server_id, mediation_actions, 
            user_actions, original_created_at, original_updated_at, archive_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING id`,
          [
            ticket.id,
            ticket.discord_id,
            ticket.title,
            ticket.description,
            ticket.status,
            ticket.priority,
            ticket.category_id,
            ticket.creator_id,
            ticket.assignee_id,
            ticket.server_id,
            ticket.mediation_actions,
            ticket.user_actions,
            ticket.created_at,
            ticket.updated_at,
            'auto_30_day_retention'
          ]
        );

        const archivedTicketId = archiveResult.rows[0].id;

        const messagesResult = await pool.query(
          `SELECT * FROM ticket_messages WHERE ticket_id = $1`,
          [ticket.id]
        );

        for (const message of messagesResult.rows) {
          await pool.query(
            `INSERT INTO archived_ticket_messages 
             (original_message_id, original_ticket_id, archived_ticket_id, sender_id, 
              content, sender_username, original_created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              message.id,
              ticket.id,
              archivedTicketId,
              message.sender_id,
              message.content,
              message.sender_username,
              message.created_at
            ]
          );
        }

        await pool.query('DELETE FROM ticket_messages WHERE ticket_id = $1', [ticket.id]);
        await pool.query('DELETE FROM ticket_resolutions WHERE ticket_id = $1', [ticket.id]);
        await pool.query('DELETE FROM ticket_audit_log WHERE ticket_id = $1', [ticket.id]);
        await pool.query('DELETE FROM sla_tracking WHERE ticket_id = $1', [ticket.id]);
        await pool.query('DELETE FROM escalation_history WHERE ticket_id = $1', [ticket.id]);
        await pool.query('DELETE FROM ai_analysis WHERE ticket_id = $1', [ticket.id]);
        await pool.query('DELETE FROM sentiment_tracking WHERE ticket_id = $1', [ticket.id]);
        await pool.query('DELETE FROM thread_mappings WHERE ticket_id = $1', [ticket.id]);
        await pool.query('DELETE FROM tickets WHERE id = $1', [ticket.id]);

        await pool.query('COMMIT');
        recordsArchived++;
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`Error archiving ticket ${ticket.id}:`, error);
      }
    }

    const result: RetentionJobResult = {
      jobType: 'ticket_archive',
      recordsProcessed,
      recordsArchived,
      recordsDeleted: 0,
      status: 'completed',
      durationMs: Date.now() - startTime
    };

    await logJobRun('ticket_archive', result);
    return result;
  } catch (error: any) {
    const result: RetentionJobResult = {
      jobType: 'ticket_archive',
      recordsProcessed,
      recordsArchived,
      recordsDeleted: 0,
      status: 'failed',
      errorMessage: error.message,
      durationMs: Date.now() - startTime
    };
    await logJobRun('ticket_archive', result);
    throw error;
  }
}

async function safeDelete(query: string, params: any[] = []): Promise<number> {
  try {
    const result = await pool.query(query, params);
    return result.rowCount || 0;
  } catch (error: any) {
    if (error.code === '42P01' || error.code === '42703') {
      return 0;
    }
    throw error;
  }
}

export async function cleanupOldLogs(): Promise<RetentionJobResult> {
  const startTime = Date.now();
  let recordsDeleted = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);

    recordsDeleted += await safeDelete(
      `DELETE FROM webhook_event_log WHERE processed_at < $1`,
      [cutoffDate]
    );

    recordsDeleted += await safeDelete(
      `DELETE FROM ticket_audit_log 
       WHERE created_at < $1 
       AND ticket_id NOT IN (SELECT id FROM tickets)`,
      [cutoffDate]
    );

    recordsDeleted += await safeDelete(
      `DELETE FROM developer_audit_log WHERE created_at < $1`,
      [cutoffDate]
    );

    recordsDeleted += await safeDelete(
      `DELETE FROM stream_notification_log WHERE created_at < $1`,
      [cutoffDate]
    );

    recordsDeleted += await safeDelete(
      `DELETE FROM interaction_locks WHERE created_at < NOW() - INTERVAL '7 days'`
    );

    const result: RetentionJobResult = {
      jobType: 'log_cleanup',
      recordsProcessed: recordsDeleted,
      recordsArchived: 0,
      recordsDeleted,
      status: 'completed',
      durationMs: Date.now() - startTime
    };

    await logJobRun('log_cleanup', result);
    return result;
  } catch (error: any) {
    const result: RetentionJobResult = {
      jobType: 'log_cleanup',
      recordsProcessed: 0,
      recordsArchived: 0,
      recordsDeleted,
      status: 'failed',
      errorMessage: error.message,
      durationMs: Date.now() - startTime
    };
    await logJobRun('log_cleanup', result);
    throw error;
  }
}

export async function cleanupExpiredAICache(): Promise<RetentionJobResult> {
  const startTime = Date.now();
  let recordsDeleted = 0;

  try {
    const result = await pool.query(
      `DELETE FROM ai_analysis WHERE expires_at < NOW()`
    );
    recordsDeleted = result.rowCount || 0;

    const jobResult: RetentionJobResult = {
      jobType: 'ai_cache_cleanup',
      recordsProcessed: recordsDeleted,
      recordsArchived: 0,
      recordsDeleted,
      status: 'completed',
      durationMs: Date.now() - startTime
    };

    await logJobRun('ai_cache_cleanup', jobResult);
    return jobResult;
  } catch (error: any) {
    const jobResult: RetentionJobResult = {
      jobType: 'ai_cache_cleanup',
      recordsProcessed: 0,
      recordsArchived: 0,
      recordsDeleted,
      status: 'failed',
      errorMessage: error.message,
      durationMs: Date.now() - startTime
    };
    await logJobRun('ai_cache_cleanup', jobResult);
    throw error;
  }
}

async function runAllRetentionJobs(): Promise<void> {
  console.log('Starting scheduled retention jobs...');
  
  try {
    const archiveResult = await archiveOldTickets();
    console.log(`Ticket archive: ${archiveResult.recordsArchived} tickets archived in ${archiveResult.durationMs}ms`);
  } catch (error) {
    console.error('Ticket archive job failed:', error);
  }

  try {
    const logResult = await cleanupOldLogs();
    console.log(`Log cleanup: ${logResult.recordsDeleted} records deleted in ${logResult.durationMs}ms`);
  } catch (error) {
    console.error('Log cleanup job failed:', error);
  }

  try {
    const cacheResult = await cleanupExpiredAICache();
    console.log(`AI cache cleanup: ${cacheResult.recordsDeleted} records deleted in ${cacheResult.durationMs}ms`);
  } catch (error) {
    console.error('AI cache cleanup job failed:', error);
  }

  console.log('Retention jobs completed');
}

export function startRetentionService(): void {
  if (retentionInterval) {
    console.log('Retention service already running');
    return;
  }

  console.log('Starting retention service (runs every 24 hours)...');
  
  setTimeout(() => {
    runAllRetentionJobs().catch(console.error);
  }, 60000);

  retentionInterval = setInterval(() => {
    runAllRetentionJobs().catch(console.error);
  }, RETENTION_INTERVAL_MS);
}

export function stopRetentionService(): void {
  if (retentionInterval) {
    clearInterval(retentionInterval);
    retentionInterval = null;
    console.log('Retention service stopped');
  }
}

export async function getRetentionJobHistory(limit: number = 50): Promise<any[]> {
  try {
    const result = await pool.query(
      `SELECT * FROM retention_job_runs 
       ORDER BY started_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Error fetching retention job history:', error);
    return [];
  }
}

export async function getArchiveStats(): Promise<{
  totalArchived: number;
  archivedThisMonth: number;
  oldestArchive: Date | null;
  storageEstimate: string;
}> {
  try {
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total FROM archived_tickets`
    );
    
    const monthResult = await pool.query(
      `SELECT COUNT(*) as month_total FROM archived_tickets 
       WHERE archived_at > NOW() - INTERVAL '30 days'`
    );
    
    const oldestResult = await pool.query(
      `SELECT MIN(archived_at) as oldest FROM archived_tickets`
    );

    const sizeResult = await pool.query(
      `SELECT pg_size_pretty(pg_total_relation_size('archived_tickets')) as size`
    );

    return {
      totalArchived: parseInt(totalResult.rows[0]?.total || '0'),
      archivedThisMonth: parseInt(monthResult.rows[0]?.month_total || '0'),
      oldestArchive: oldestResult.rows[0]?.oldest || null,
      storageEstimate: sizeResult.rows[0]?.size || 'Unknown'
    };
  } catch (error) {
    console.error('Error fetching archive stats:', error);
    return {
      totalArchived: 0,
      archivedThisMonth: 0,
      oldestArchive: null,
      storageEstimate: 'Unknown'
    };
  }
}

export async function restoreArchivedTicket(archivedTicketId: number): Promise<number | null> {
  try {
    await pool.query('BEGIN');

    const archiveResult = await pool.query(
      `SELECT * FROM archived_tickets WHERE id = $1`,
      [archivedTicketId]
    );

    if (archiveResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return null;
    }

    const archived = archiveResult.rows[0];

    const ticketResult = await pool.query(
      `INSERT INTO tickets 
       (discord_id, title, description, status, priority, category_id, 
        creator_id, assignee_id, server_id, mediation_actions, user_actions, 
        created_at, updated_at)
       VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING id`,
      [
        archived.discord_id,
        archived.title,
        `[RESTORED FROM ARCHIVE]\n\n${archived.description}`,
        archived.priority,
        archived.category_id,
        archived.creator_id,
        archived.assignee_id,
        archived.server_id,
        archived.mediation_actions,
        archived.user_actions,
        archived.original_created_at
      ]
    );

    const newTicketId = ticketResult.rows[0].id;

    const messagesResult = await pool.query(
      `SELECT * FROM archived_ticket_messages WHERE archived_ticket_id = $1 ORDER BY original_created_at`,
      [archivedTicketId]
    );

    for (const message of messagesResult.rows) {
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_id, content, sender_username, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [newTicketId, message.sender_id, message.content, message.sender_username, message.original_created_at]
      );
    }

    await pool.query('DELETE FROM archived_ticket_messages WHERE archived_ticket_id = $1', [archivedTicketId]);
    await pool.query('DELETE FROM archived_tickets WHERE id = $1', [archivedTicketId]);

    await pool.query('COMMIT');
    return newTicketId;
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error restoring archived ticket:', error);
    throw error;
  }
}
