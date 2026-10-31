import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export const scenarios = ["known", "gap", "bad-quality", "counter-reset"];

/** An independent ledger: 30 s running, 30 s fault, 15 total, 13 good, 2 reject. */
export async function factoryScenario(pool, actorId, scenario = "known") {
  assert(scenarios.includes(scenario), "Unknown factory scenario");
  const profile = JSON.parse(
    await readFile(
      new URL("../profiles/owned-factory.json", import.meta.url),
      "utf8",
    ),
  );
  const start = new Date(Math.floor((Date.now() - 120000) / 1000) * 1000);
  const at = (second) => new Date(+start + second * 1000);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      rows: [machine],
    } = await client.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ($1,$2,'127.0.0.1',false) RETURNING id",
      [
        `Synthetic factory · ${scenario}`,
        `opc.tcp://127.0.0.1:1/replay/${randomUUID()}`,
      ],
    );
    await client.query(
      "INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES ($1,$2,$3)",
      [machine.id, profile, actorId],
    );
    await client.query(
      "INSERT INTO machine_grants(user_id,machine_id) SELECT id,$1 FROM users",
      [machine.id],
    );
    const series = {
      state: [1, 1, 2, 2, 1],
      total: [0, 7, 15, 15, 15],
      good: [0, 6, 13, 13, 13],
      reject: [0, 1, 2, 2, 2],
    };
    if (scenario === "counter-reset") {
      series.total = [10, 17, 2, 2, 2];
      series.good = [10, 16, 1, 1, 1];
      series.reject = [5, 6, 1, 1, 1];
    }
    for (const [role, signal] of Object.entries(profile.signals)) {
      for (let index = 0; index < 5; index++) {
        if (scenario === "gap" && index === 1) continue;
        await client.query(
          "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,raw_value,status_code,reported_status_code,received_at,source_timestamp,source_clock_state,data_type,signal_metadata) VALUES ($1,$2,$3,$4,to_jsonb($4::double precision),$5,$5,$3,$3,'valid','Int32',$6)",
          [
            machine.id,
            signal.nodeKey,
            at(index * 15),
            series[role][index],
            scenario === "bad-quality" && index === 1
              ? "BadNoCommunication"
              : "Good",
            {
              namespaceUri: signal.namespaceUri,
              identifier: signal.identifier,
            },
          ],
        );
      }
    }
    const {
      rows: [shift],
    } = await client.query(
      "INSERT INTO production_shifts(machine_id,name,timezone,start,\"end\",profile,job,evidence,created_by) VALUES ($1,$2,'UTC',$3,$4,$5,$6,$7,$8) RETURNING id",
      [
        machine.id,
        `Demo ${scenario} · ${start.toISOString()}`,
        start,
        at(60),
        profile,
        { reference: "DEMO-001", product: "Synthetic parts", target: 30 },
        {
          total: 15,
          good: 13,
          reject: 2,
          reference: "Independent synthetic ledger v1",
          actorId,
        },
        actorId,
      ],
    );
    await client.query(
      "INSERT INTO downtime_reasons(shift_id,start,\"end\",category,reason,actor_id) VALUES ($1,$2,$3,'unplanned','Synthetic jam',$4)",
      [shift.id, at(30), at(60), actorId],
    );
    await client.query("COMMIT");
    return { machineId: machine.id, shiftId: shift.id, scenario };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
