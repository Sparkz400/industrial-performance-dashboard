import { readFileSync } from "node:fs";

/** Supplying a CA always requires certificate and hostname verification. */
export function databaseTls(caFile = process.env.DB_SSL_CA_FILE) {
  return caFile
    ? { ca: readFileSync(caFile, "utf8"), rejectUnauthorized: true }
    : process.env.DB_SSL === "true"
      ? { rejectUnauthorized: true }
      : undefined;
}
