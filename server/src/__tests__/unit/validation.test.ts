import { describe, it, expect, vi } from "vitest";
import Joi from "joi";

vi.mock("../../utils/errors.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return actual;
});

import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middleware/validation.js";
import { ValidationError } from "../../utils/errors.js";

function createMocks(overrides: Record<string, any> = {}) {
  const req: any = { body: {}, params: {}, query: {}, ...overrides };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe("validateBody", () => {
  const schema = Joi.object({
    name: Joi.string().required(),
    age: Joi.number().integer().min(0),
  });
  const middleware = validateBody(schema);

  it("should call next() for valid body", () => {
    const { req, res, next } = createMocks({ body: { name: "Test", age: 25 } });
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(); // no error args
  });

  it("should strip unknown keys", () => {
    const { req, res, next } = createMocks({
      body: { name: "Test", extra: "field" },
    });
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.body).not.toHaveProperty("extra");
  });

  it("should call next with ValidationError for invalid body", () => {
    const { req, res, next } = createMocks({ body: {} });
    middleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it("should report all validation errors (abortEarly: false)", () => {
    const schema2 = Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
    });
    const mw = validateBody(schema2);
    const { req, res, next } = createMocks({ body: {} });
    mw(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.details?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("validateParams", () => {
  const schema = Joi.object({ id: Joi.string().required() });
  const middleware = validateParams(schema);

  it("should call next() for valid params", () => {
    const { req, res, next } = createMocks({ params: { id: "abc-123" } });
    middleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("should call next with ValidationError for missing params", () => {
    const { req, res, next } = createMocks({ params: {} });
    middleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });
});

describe("validateQuery", () => {
  const schema = Joi.object({
    page: Joi.number().integer().default(1),
    limit: Joi.number().integer().default(10),
  });
  const middleware = validateQuery(schema);

  it("should call next() and apply defaults for empty query", () => {
    const { req, res, next } = createMocks({ query: {} });
    middleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.query.page).toBe(1);
    expect(req.query.limit).toBe(10);
  });

  it("should preserve provided values", () => {
    const { req, res, next } = createMocks({ query: { page: 3, limit: 50 } });
    middleware(req, res, next);
    expect(req.query.page).toBe(3);
    expect(req.query.limit).toBe(50);
  });

  it("should call next with ValidationError for invalid query", () => {
    const schema2 = Joi.object({ page: Joi.number().required() });
    const mw = validateQuery(schema2);
    const { req, res, next } = createMocks({ query: {} });
    mw(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });
});
