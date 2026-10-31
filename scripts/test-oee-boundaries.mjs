import assert from "node:assert/strict";
import { dailyFixture } from "./daily-fixture.mjs";

await dailyFixture(async ({ pool, call }) => {
  const { id: machine } = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES('OEE boundary fixture','opc.tcp://127.0.0.1:49999','127.0.0.1',false) RETURNING id",
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO oee_config(machine_id,running_mode_values,idle_mode_values,production_count_node_key,good_count_node_key,reject_count_node_key,ideal_cycle_time_ms) VALUES($1,'[1]','[0]','Total','Good','Reject',1000)",
    [machine],
  );
  await pool.query(
    "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES($1,'OperationMode','2026-01-01',1,'Good')",
    [machine],
  );
  for (const [key, value] of [
    ["Total", 60],
    ["Good", 60],
    ["Reject", 0],
  ]) {
    await pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES($1,$2,'2026-01-11T08:00Z',0,'Good'),($1,$2,'2026-01-11T08:01Z',$3,'Good')",
      [machine, key, value],
    );
  }
  const calculate = async (start, end) => {
    const response = await call(
      "admin",
      "GET",
      `/api/v1/oee/${machine}?startDate=${start}&endDate=${end}`,
    );
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  const stale = await calculate("2026-01-11T08:00:00Z", "2026-01-11T09:00:00Z");
  assert.equal(stale.availability.unknownTimeMinutes, 60);
  assert.equal(stale.performance.dataComplete, false);
  assert.equal(stale.quality.dataComplete, false);
  assert.equal(stale.dataComplete, false);

  // A numeric bad-quality state must also remain unknown after the repository read.
  await pool.query(
    "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES($1,'OperationMode','2026-01-11T08:00Z',1,'BadNoCommunication')",
    [machine],
  );
  assert.equal(
    (await calculate("2026-01-11T08:00:00Z", "2026-01-11T08:01:00Z"))
      .availability.unknownTimeMinutes,
    1,
  );

  await pool.query(
    "UPDATE oee_config SET production_count_node_key=NULL,good_count_node_key=NULL,reject_count_node_key=NULL,manual_entry_enabled=true WHERE machine_id=$1",
    [machine],
  );
  await pool.query(
    "INSERT INTO oee_manual_entries(machine_id,date,production_count,good_count,reject_count) VALUES($1,'2026-01-11',100,90,10),($1,'2026-01-12',200,180,20)",
    [machine],
  );
  for (const hour of [8, 9]) {
    const result = await calculate(
      `2026-01-11T${String(hour).padStart(2, "0")}:00:00Z`,
      `2026-01-11T${String(hour + 1).padStart(2, "0")}:00:00Z`,
    );
    assert.equal(result.performance.totalCount, 0);
    assert.equal(result.quality.goodCount, 0);
    assert.equal(result.dataComplete, false);
  }
  const day = await calculate("2026-01-11T00:00:00Z", "2026-01-12T00:00:00Z");
  assert.equal(day.performance.totalCount, 100);
  assert.equal(day.quality.goodCount, 90);
  assert.equal(day.dataComplete, false);
  console.log(
    "PASS: real OEE API preserves stale/bad quality, incomplete counters, daily boundaries and provisional declarations",
  );
});
