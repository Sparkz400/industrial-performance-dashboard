import "../helpers/mockDb.js";
import { expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { signatureRateLimit } from "../../middleware/security.js";

it("counts wrong e-signature passwords per account even though they answer 200", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { session: object }).session = { userId: 42 };
    next();
  });
  app.post("/verify-signature", signatureRateLimit, (req, res) => {
    res.locals.credentialRejected = req.body.password !== "right";
    res.json({ verified: !res.locals.credentialRejected });
  });
  for (let attempt = 0; attempt < 10; attempt++)
    expect(
      (await request(app).post("/verify-signature").send({ password: "guess" }))
        .status,
    ).toBe(200);
  const blocked = await request(app)
    .post("/verify-signature")
    .send({ password: "right" });
  expect(blocked.status).toBe(429);
});

it("does not count successful signatures", async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { session: object }).session = { userId: 43 };
    next();
  });
  app.post("/verify-signature", signatureRateLimit, (_req, res) => {
    res.json({ verified: true });
  });
  for (let attempt = 0; attempt < 30; attempt++)
    expect((await request(app).post("/verify-signature")).status).toBe(200);
});
