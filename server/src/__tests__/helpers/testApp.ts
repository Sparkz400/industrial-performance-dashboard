import { type Express } from "express";
import supertest from "supertest";

let appInstance: Express | null = null;

async function ensureApp() {
  if (!appInstance) {
    const { createApp } = await import("../../../app.js");
    const { app } = createApp();
    appInstance = app;
  }
  return appInstance;
}

/**
 * Returns a supertest instance for simple GET requests (no CSRF needed).
 */
export async function getTestApp() {
  const app = await ensureApp();
  return supertest(app);
}

/**
 * Returns a supertest agent with a session and CSRF token.
 * Use this for POST/PUT/DELETE requests that need CSRF protection.
 */
export async function getAgentWithCsrf() {
  const app = await ensureApp();
  const agent = supertest.agent(app);

  // Establish a session and get a CSRF token
  const csrfRes = await agent.get("/api/v1/csrf-token");
  const csrfToken = csrfRes.body.csrfToken;

  return { agent, csrfToken };
}

/**
 * Resets the cached app instance.
 */
export function resetTestApp() {
  appInstance = null;
}
