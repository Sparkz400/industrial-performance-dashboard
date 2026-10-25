import "dotenv/config";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

const SALT_ROUNDS = 12;

async function seed() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const db = drizzle(pool, { schema });

  console.log("Seeding database...");

  // --- Seed admin user ---
  const existingAdmin = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, "admin"))
    .limit(1);

  if (existingAdmin.length === 0) {
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password || password.length < 12) throw new Error("Set SEED_ADMIN_PASSWORD to at least 12 characters before seeding");
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.insert(schema.users).values({
      username: "admin",
      email: "admin@localhost",
      passwordHash: hash,
      role: "admin",
    });
    console.log("  Created admin user using SEED_ADMIN_PASSWORD");
  } else {
    console.log("  Admin user already exists, skipping");
  }

  // --- Seed default dashboard ---
  const existingDashboard = await db.select().from(schema.dashboards).limit(1);

  if (existingDashboard.length === 0) {
    await db.insert(schema.dashboards).values({
      id: "dashboard-default-seed",
      name: "Default Dashboard",
      widgets: [],
      layout: [],
    });
    console.log("  Created default dashboard");
  } else {
    console.log("  Dashboard(s) already exist, skipping");
  }

  // --- Seed sample machine (development only) ---
  if (process.env.NODE_ENV !== "production") {
    const existingMachine = await db.select().from(schema.machines).limit(1);

    if (existingMachine.length === 0) {
      await db.insert(schema.machines).values({
        name: "Local OPC-UA Simulator",
        endpointUrl: `opc.tcp://localhost:${process.env.OPCUA_PORT || '4841'}/UA/MyLittleServer`,
        ip: "localhost",
        port: Number(process.env.OPCUA_PORT || 4841),
        resourcePath: "/UA/MyLittleServer",
        securityMode: "None",
        securityPolicy: "None",
        isActive: false,
        status: "disconnected",
      });
      console.log("  Created sample machine (inactive)");
    } else {
      console.log("  Machine(s) already exist, skipping");
    }
  }

  console.log("Seeding complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
