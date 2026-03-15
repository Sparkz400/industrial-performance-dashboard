import dbClient from "../../database/dbConnection.js";
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
 * Service for managing certificate logs in the database
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

      await dbClient.query(
        `SELECT log_certificate_event($1, $2, $3, $4, $5, $6, $7)`,
        [
          eventType,
          certificateName,
          certificateHash,
          serverUri,
          action,
          status,
          details,
        ],
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
      let whereClause = "";
      const queryParams: any[] = [];

      if (eventType) {
        queryParams.push(eventType);
        whereClause += `event_type = $${queryParams.length}`;
      }

      if (startDate) {
        if (whereClause) whereClause += " AND ";
        queryParams.push(new Date(startDate));
        whereClause += `timestamp >= $${queryParams.length}`;
      }

      if (endDate) {
        if (whereClause) whereClause += " AND ";
        queryParams.push(new Date(endDate));
        whereClause += `timestamp <= $${queryParams.length}`;
      }

      const whereStatement = whereClause ? `WHERE ${whereClause}` : "";

      queryParams.push(limit);
      queryParams.push(offset);

      const query = `
                SELECT *
                FROM certificate_logs
                ${whereStatement}
                ORDER BY timestamp DESC
                LIMIT $${queryParams.length - 1}
                OFFSET $${queryParams.length}
            `;

      const countQuery = `
                SELECT COUNT(*)
                FROM certificate_logs
                ${whereStatement}
            `;

      const [logsResult, countResult] = await Promise.all([
        dbClient.query(query, queryParams),
        dbClient.query(countQuery, queryParams.slice(0, -2)),
      ]);

      return {
        logs: logsResult.rows,
        total: parseInt(countResult.rows[0].count),
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
      const query = `
                SELECT
                    (SELECT COUNT(*) FROM certificate_logs) AS total_events,
                    (SELECT COUNT(*) FROM certificate_logs WHERE event_type = 'SERVER_CERTIFICATE_RECEIVED') AS received_count,
                    (SELECT COUNT(*) FROM certificate_logs WHERE action = 'TRUST') AS trusted_count,
                    (SELECT COUNT(*) FROM certificate_logs WHERE action = 'REJECT') AS rejected_count,
                    (SELECT COUNT(*) FROM certificate_logs WHERE status = 'FAILED') AS failed_count,
                    (SELECT COUNT(*) FROM certificate_logs WHERE timestamp > NOW() - INTERVAL '24 hours') AS last_24h_count
            `;

      const result = await dbClient.query(query);

      return (
        result.rows[0] || {
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
