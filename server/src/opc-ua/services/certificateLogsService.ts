import { sql } from "drizzle-orm";
import db from "../../database/db.js";
import logger from "../../utils/logger.js";

export interface CertificateEventData {
  eventType: string;
  certificateName: string;
  certificateHash: string;
  serverUri: string;
  action: string;
  status: string;
  details: string;
}

export interface CertificateLogsResult {
  logs: any[];
  total: number;
  limit: number;
  offset: number;
}

export interface CertificateLogsOptions {
  limit?: number;
  offset?: number;
  eventType?: string;
  startDate?: string;
  endDate?: string;
}

export interface CertificateStats {
  total_events: number;
  received_count: number;
  trusted_count: number;
  rejected_count: number;
  failed_count: number;
  last_24h_count: number;
}

/**
 * Service for managing certificate logs in the database.
 * Uses raw SQL via Drizzle's sql template since certificate_logs
 * uses a stored procedure and isn't part of the core schema.
 */
class CertificateLogsService {
  async logCertificateEvent(
    eventData: CertificateEventData,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const {
        eventType,
        certificateName,
        certificateHash,
        serverUri,
        action,
        status,
        details,
      } = eventData;

      await db.execute(
        sql`SELECT log_certificate_event(${eventType}, ${certificateName}, ${certificateHash}, ${serverUri}, ${action}, ${status}, ${details})`,
      );

      return { success: true };
    } catch (error: any) {
      logger.error("Error logging certificate event:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getCertificateLogs(
    options: CertificateLogsOptions = {},
  ): Promise<CertificateLogsResult> {
    const { limit = 100, offset = 0, eventType, startDate, endDate } = options;

    try {
      const conditions: ReturnType<typeof sql>[] = [];

      if (eventType) {
        conditions.push(sql`event_type = ${eventType}`);
      }
      if (startDate) {
        conditions.push(sql`timestamp >= ${new Date(startDate)}`);
      }
      if (endDate) {
        conditions.push(sql`timestamp <= ${new Date(endDate)}`);
      }

      const whereClause =
        conditions.length > 0
          ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
          : sql``;

      const [logsResult, countResult] = await Promise.all([
        db.execute(
          sql`SELECT * FROM certificate_logs ${whereClause} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`,
        ),
        db.execute(sql`SELECT COUNT(*) FROM certificate_logs ${whereClause}`),
      ]);

      return {
        logs: logsResult.rows,
        total: parseInt((countResult.rows[0] as { count: string }).count),
        limit,
        offset,
      };
    } catch (error) {
      logger.error("Error fetching certificate logs:", error);
      throw error;
    }
  }

  async getCertificateStats(): Promise<CertificateStats> {
    try {
      const result = await db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM certificate_logs) AS total_events,
          (SELECT COUNT(*) FROM certificate_logs WHERE event_type = 'SERVER_CERTIFICATE_RECEIVED') AS received_count,
          (SELECT COUNT(*) FROM certificate_logs WHERE action = 'TRUST') AS trusted_count,
          (SELECT COUNT(*) FROM certificate_logs WHERE action = 'REJECT') AS rejected_count,
          (SELECT COUNT(*) FROM certificate_logs WHERE status = 'FAILED') AS failed_count,
          (SELECT COUNT(*) FROM certificate_logs WHERE timestamp > NOW() - INTERVAL '24 hours') AS last_24h_count
      `);

      return (
        (result.rows[0] as unknown as CertificateStats) || {
          total_events: 0,
          received_count: 0,
          trusted_count: 0,
          rejected_count: 0,
          failed_count: 0,
          last_24h_count: 0,
        }
      );
    } catch (error) {
      logger.error("Error fetching certificate statistics:", error);
      throw error;
    }
  }
}

const certificateLogsService = new CertificateLogsService();

export default certificateLogsService;
