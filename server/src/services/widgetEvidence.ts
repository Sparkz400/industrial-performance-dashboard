import type { ProductionProfile } from "@performance-dashboard/shared";
import manager from "../database/dbConnection.js";
import { ValidationError } from "../utils/errors.js";
export async function widgetEvidence(machine: number, now = new Date()) {
  const saved = (
    await manager.pool.query(
      "SELECT id,profile FROM machine_profiles WHERE machine_id=$1 ORDER BY id DESC LIMIT 1",
      [machine],
    )
  ).rows[0];
  if (!saved)
    throw new ValidationError(
      "Commission a production state profile before showing uptime or state distribution",
    );
  const profile = saved.profile as ProductionProfile,
    signal = profile.signals.state;
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6),
  );
  const client = await manager.pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const result = await client.query(
      `WITH ordered AS (
      SELECT timestamp,lead(timestamp) OVER(ORDER BY timestamp,id) AS next_at,
        CASE WHEN status_code LIKE 'Good%' AND value IS NOT NULL AND signal_metadata->>'namespaceUri'=$5 AND signal_metadata->>'identifier'=$6
          THEN CASE WHEN value*$7=ANY($8::float8[]) THEN 'running' WHEN value*$7=ANY($9::float8[]) THEN 'idle' WHEN value*$7=ANY($10::float8[]) THEN 'fault' WHEN value*$7=ANY($11::float8[]) THEN 'planned' ELSE 'unknown' END ELSE 'unknown' END AS state,
        correction_revision
      FROM opcua_data WHERE machine_id=$1 AND node_key=$2 AND timestamp >= $3::timestamptz-make_interval(secs=>$12) AND timestamp <= $4),
      spans AS (SELECT greatest(timestamp,$3) AS start,least(coalesce(next_at,$4),timestamp+make_interval(secs=>$12),$4) AS stop,state,correction_revision FROM ordered),
      days AS (SELECT day,least(day+interval '1 day',$4) AS stop FROM generate_series($3::timestamptz,date_trunc('day',$4::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',interval '1 day') day)
      SELECT d.day AS start,d.stop AS end,s.state,coalesce(sum(greatest(0,extract(epoch FROM least(s.stop,d.stop)-greatest(s.start,d.day)))),0)::float8 AS seconds,
        coalesce(sum(CASE WHEN s.correction_revision>0 THEN 1 ELSE 0 END),0)::int AS corrected
      FROM days d LEFT JOIN spans s ON s.start<d.stop AND s.stop>d.day AND s.state<>'unknown'
      GROUP BY d.day,d.stop,s.state ORDER BY d.day,s.state`,
      [
        machine,
        signal.nodeKey,
        start,
        now,
        signal.namespaceUri,
        signal.identifier,
        signal.scale,
        profile.states.running,
        profile.states.idle,
        profile.states.fault,
        profile.states.planned,
        profile.maxGapSeconds,
      ],
    );
    await client.query("COMMIT");
    const days = new Map<
      string,
      {
        start: string;
        end: string;
        seconds: Record<string, number>;
        uptimePercent: number | null;
        coveragePercent: number;
        corrected: number;
      }
    >();
    for (const row of result.rows) {
      const key = row.start.toISOString();
      const day: NonNullable<ReturnType<typeof days.get>> = days.get(key) ?? {
        start: key,
        end: row.end.toISOString(),
        seconds: { running: 0, idle: 0, fault: 0, planned: 0, unknown: 0 },
        uptimePercent: null,
        coveragePercent: 0,
        corrected: 0,
      };
      if (row.state) day.seconds[row.state] = row.seconds;
      day.corrected += row.corrected;
      days.set(key, day);
    }
    for (const day of days.values()) {
      const duration = (Date.parse(day.end) - Date.parse(day.start)) / 1000;
      const known =
        day.seconds.running +
        day.seconds.idle +
        day.seconds.fault +
        day.seconds.planned;
      day.seconds.unknown = Math.max(0, duration - known);
      day.coveragePercent = duration > 0 ? (known / duration) * 100 : 0;
      day.uptimePercent =
        duration > 0 && day.seconds.unknown < 0.001
          ? (day.seconds.running / duration) * 100
          : null;
    }
    return {
      machineId: machine,
      profileId: saved.id,
      profileName: profile.name,
      start: start.toISOString(),
      end: now.toISOString(),
      timezone: "UTC",
      days: [...days.values()],
      meaning:
        "Uptime is running seconds divided by the complete UTC day (today to now). Incomplete days remain unknown. State distribution uses the current commissioned profile, actual sample intervals and its maximum gap.",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
