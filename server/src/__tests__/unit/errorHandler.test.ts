import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { errorHandler, asyncHandler } from "../../middleware/errorHandler.js";
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
} from "../../utils/errors.js";

function createMockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

function createMockReq(overrides: Record<string, any> = {}) {
  return {
    originalUrl: "/test",
    method: "GET",
    ip: "127.0.0.1",
    sessionID: "test-session",
    session: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

describe("errorHandler", () => {
  const invalidCsrfTokenError = new Error("Invalid CSRF");
  const handler = errorHandler(invalidCsrfTokenError);
  const next = vi.fn() as unknown as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle CSRF errors with 403 status", () => {
    const res = createMockRes();
    const req = createMockReq();

    handler(invalidCsrfTokenError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        code: "INVALID_CSRF_TOKEN",
      }),
    );
  });

  it("should handle CSRF errors by code", () => {
    const res = createMockRes();
    const req = createMockReq();
    const err: any = new Error("CSRF failed");
    err.code = "EBADCSRFTOKEN";

    handler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_CSRF_TOKEN" }),
    );
  });

  it("should handle AppError subclasses", () => {
    const res = createMockRes();
    const req = createMockReq();

    handler(new NotFoundError("Dashboard"), req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        error: "Dashboard not found",
        code: "NOT_FOUND",
      }),
    );
  });

  it("should handle UnauthorizedError", () => {
    const res = createMockRes();
    const req = createMockReq();

    handler(new UnauthorizedError(), req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED" }),
    );
  });

  it("should include details for ValidationError", () => {
    const res = createMockRes();
    const req = createMockReq();
    const details = ["Field is required", "Invalid format"];

    handler(new ValidationError("Bad input", details), req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        details,
      }),
    );
  });

  it("should handle unexpected errors with 500 status", () => {
    const res = createMockRes();
    const req = createMockReq();

    handler(new Error("Something unexpected"), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        code: "INTERNAL_ERROR",
      }),
    );
  });

  it("should hide error details in production for unexpected errors", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const res = createMockRes();
    const req = createMockReq();

    handler(new Error("Internal details"), req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "An unexpected error occurred.",
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it("should attach requestId when present", () => {
    const res = createMockRes();
    const req = createMockReq({ requestId: "req-123" });

    handler(new NotFoundError(), req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-123" }),
    );
  });
});

describe("asyncHandler", () => {
  it("should call the handler function", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapped = asyncHandler(handler);
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();

    wrapped(req, res, next);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
  });

  it("should forward rejected promises to next()", async () => {
    const error = new Error("Async error");
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = asyncHandler(handler);
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();

    wrapped(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(error));
  });
});
