import { jest } from "@jest/globals";
import {
  validateBody,
  validateParams,
  validateQuery,
  schemas,
} from "../middleware/validation.js";
import Joi from "joi";

// Helper to create mock Express req/res/next
function createMocks(overrides = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe("validateBody", () => {
  describe("with dashboardSchema", () => {
    const middleware = validateBody(schemas.dashboardSchema);

    it("should call next() for valid dashboard data", () => {
      const { req, res, next } = createMocks({
        body: {
          id: "dash-001",
          name: "My Dashboard",
          widgets: [],
          layout: [],
        },
      });

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 400 when required fields are missing", () => {
      const { req, res, next } = createMocks({
        body: {},
      });

      middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
          error: expect.stringContaining("Validation Error"),
        }),
      );
    });

    it("should return 400 when name is too long", () => {
      const { req, res, next } = createMocks({
        body: {
          id: "dash-001",
          name: "x".repeat(101),
          widgets: [],
          layout: [],
        },
      });

      middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when id is too short", () => {
      const { req, res, next } = createMocks({
        body: {
          id: "ab", // min 3
          name: "Dashboard",
        },
      });

      middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should accept widgets as a JSON string", () => {
      const { req, res, next } = createMocks({
        body: {
          id: "dash-001",
          name: "Dashboard",
          widgets: JSON.stringify([{ id: "w1" }]),
          layout: "[]",
        },
      });

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("with opcuaConnectionSchema", () => {
    const middleware = validateBody(schemas.opcuaConnectionSchema);

    it("should pass for valid OPC UA connection", () => {
      const { req, res, next } = createMocks({
        body: {
          ip: "localhost",
          port: 4840,
          resourcePath: "",
        },
      });

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("should fail when ip is missing", () => {
      const { req, res, next } = createMocks({
        body: { port: 4840 },
      });

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should fail when port is missing", () => {
      const { req, res, next } = createMocks({
        body: { ip: "localhost" },
      });

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});

describe("validateParams", () => {
  it("should validate params against a schema", () => {
    const paramSchema = Joi.object({
      id: Joi.string().required(),
    });

    const middleware = validateParams(paramSchema);
    const { req, res, next } = createMocks({
      params: { id: "abc" },
    });

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("should return 400 for invalid params", () => {
    const paramSchema = Joi.object({
      id: Joi.number().required(),
    });

    const middleware = validateParams(paramSchema);
    const { req, res, next } = createMocks({
      params: { id: "not-a-number" },
    });

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("validateQuery", () => {
  it("should validate query parameters", () => {
    const querySchema = Joi.object({
      page: Joi.number().default(1),
      limit: Joi.number().default(10),
    });

    const middleware = validateQuery(querySchema);
    const { req, res, next } = createMocks({
      query: { page: 2, limit: 20 },
    });

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.query.page).toBe(2);
    expect(req.query.limit).toBe(20);
  });

  it("should return 400 for invalid query params", () => {
    const querySchema = Joi.object({
      page: Joi.number().required(),
    });

    const middleware = validateQuery(querySchema);
    const { req, res, next } = createMocks({
      query: {},
    });

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
