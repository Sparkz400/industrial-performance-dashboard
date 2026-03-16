import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// Mock the logger
vi.mock("../../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock errors module
vi.mock("../../utils/errors.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return actual;
});

import { requireAuth, requireRole } from "../../middleware/auth.js";
import { UnauthorizedError, ForbiddenError } from "../../utils/errors.js";

function createMockReqResNext(sessionData: Record<string, any> = {}) {
  const req = {
    session: sessionData,
    method: "GET",
    originalUrl: "/test",
  } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe("requireAuth middleware", () => {
  it("should call next() when session has userId", () => {
    const { req, res, next } = createMockReqResNext({
      userId: 1,
      userRole: "admin",
    });
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(); // no error
  });

  it("should call next with UnauthorizedError when no userId in session", () => {
    const { req, res, next } = createMockReqResNext({});
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("should call next with UnauthorizedError when session is undefined", () => {
    const req = { method: "GET", originalUrl: "/test" } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});

describe("requireRole middleware", () => {
  it("should call next() when user has the required role", () => {
    const { req, res, next } = createMockReqResNext({
      userId: 1,
      userRole: "admin",
      username: "admin",
    });

    const middleware = requireRole("admin");
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(); // no error
  });

  it("should call next with ForbiddenError when user lacks required role", () => {
    const { req, res, next } = createMockReqResNext({
      userId: 2,
      userRole: "viewer",
      username: "viewer",
    });

    const middleware = requireRole("admin");
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("should accept multiple roles", () => {
    const { req, res, next } = createMockReqResNext({
      userId: 2,
      userRole: "viewer",
      username: "viewer",
    });

    const middleware = requireRole("admin", "viewer");
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(); // no error — viewer is in the allowed list
  });

  it("should reject when userRole is undefined", () => {
    const { req, res, next } = createMockReqResNext({ userId: 1 });

    const middleware = requireRole("admin");
    middleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });
});
