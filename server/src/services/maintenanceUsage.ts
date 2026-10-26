import manager from "../database/dbConnection.js";
import type {
  ProductionProfile,
  ProductionSignal,
} from "@performance-dashboard/shared";

/** SQL folds the full interval; memory use does not grow with the raw history. */
export async function maintenanceUsage(
  machineId: number,
  profile: ProductionProfile,
  start: Date,
  end: Date,
) {
  const measure = async (
    signal: ProductionSignal | undefined,
    state: boolean,
  ) => {
    if (!signal) return { observed: null, complete: false };
    const result = await manager.pool.query(
      `WITH ordered AS (
      SELECT DISTINCT ON(timestamp) timestamp,value,status_code,signal_metadata FROM opcua_data
      WHERE machine_id=$1 AND node_key=$2 AND timestamp BETWEEN $3::timestamptz-($5*interval '1 second') AND $4 ORDER BY timestamp,id DESC
    ), pairs AS (SELECT *,lead(timestamp,1,$4::timestamptz) OVER(ORDER BY timestamp) AS next_time,
      lead(value) OVER(ORDER BY timestamp) AS next_value,lead(status_code) OVER(ORDER BY timestamp) AS next_quality,lead(signal_metadata) OVER(ORDER BY timestamp) AS next_metadata FROM ordered),
    valid AS (SELECT *,greatest(timestamp,$3::timestamptz) AS since,
      least(next_time,timestamp+($5*interval '1 second'),$4::timestamptz) AS until,
      status_code LIKE 'Good%' AND value IS NOT NULL AND signal_metadata->>'namespaceUri'=$6 AND signal_metadata->>'identifier'=$7 AS good,
      next_quality LIKE 'Good%' AND next_value IS NOT NULL AND next_metadata->>'namespaceUri'=$6 AND next_metadata->>'identifier'=$7 AS next_good FROM pairs)
    SELECT coalesce(sum(CASE WHEN good AND value*$8=ANY($9::float8[]) THEN greatest(0,extract(epoch FROM until-since)) ELSE 0 END),0)::float8 AS runtime,
      coalesce(sum(CASE WHEN good AND (value*$8)=ANY($10::float8[]) THEN greatest(0,extract(epoch FROM until-since)) ELSE 0 END),0)::float8 AS known_seconds,
      sum(CASE WHEN good AND next_good AND timestamp >= $3 AND next_time <= $4 AND next_time>timestamp AND next_time-timestamp<=($5*interval '1 second') AND value>=0 AND next_value>=0 THEN
        CASE WHEN $11='rollover' AND (value >= $12 OR next_value >= $12) THEN NULL
          WHEN next_value>=value THEN (next_value-value)*$8
          WHEN $11='reset-to-zero' THEN next_value*$8
          WHEN $11='rollover' AND value >= $12*0.9 AND next_value <= $12*0.1 THEN ($12-value+next_value)*$8 ELSE NULL END ELSE NULL END)::float8 AS cycles,
      min(timestamp) FILTER(WHERE timestamp >= $3) AS first,max(timestamp) AS last,
      count(*) FILTER(WHERE timestamp >= $3 AND next_value IS NOT NULL AND NOT coalesce(good AND next_good AND next_time-timestamp<=($5*interval '1 second') AND value>=0 AND next_value>=0 AND
        (($11<>'rollover' OR (value<$12 AND next_value<$12)) AND (next_value>=value OR $11='reset-to-zero' OR ($11='rollover' AND value >= $12*0.9 AND next_value <= $12*0.1))),false))::int AS gaps
    FROM valid`,
      [
        machineId,
        signal.nodeKey,
        start,
        end,
        profile.maxGapSeconds,
        signal.namespaceUri,
        signal.identifier,
        signal.scale,
        profile.states.running,
        Object.values(profile.states).flat(),
        profile.counterPolicy,
        profile.counterModulus ?? null,
      ],
    );
    const row = result.rows[0];
    return state
      ? {
          observed: row.known_seconds > 0 ? row.runtime : null,
          complete:
            Math.abs(
              row.known_seconds - (end.getTime() - start.getTime()) / 1000,
            ) < 0.001,
        }
      : {
          observed: row.cycles,
          complete:
            row.gaps === 0 &&
            new Date(row.first).getTime() === start.getTime() &&
            new Date(row.last).getTime() === end.getTime(),
        };
  };
  return {
    runtimeSeconds: await measure(profile.signals.state, true),
    cycles: await measure(profile.signals.total, false),
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
