import { describe, it, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  DatabaseError,
  OPCUAError,
  fromDatabaseError,
} from "../../utils/errors.js";

describe("AppError", () => {
  it("should create an error with status code and message", () => {
    const err = new AppError("Something went wrong", 500);
    expect(err.message).toBe("Something went wrong");
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe("AppError");
    expect(err).toBeInstanceOf(Error);
  });

  it("should support optional error code", () => {
    const err = new AppError("Bad request", 400, "BAD_REQUEST");
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("should capture stack trace", () => {
    const err = new AppError("Test", 500);
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("errors.test");
  });
});

describe("NotFoundError", () => {
  it('should default to "Resource not found"', () => {
    const err = new NotFoundError();
    expect(err.message).toBe("Resource not found");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("should accept custom resource name", () => {
    const err = new NotFoundError("Dashboard");
    expect(err.message).toBe("Dashboard not found");
  });
});

describe("ValidationError", () => {
  it("should have status 400 and validation code", () => {
    const err = new ValidationError("Invalid input");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("should accept details array", () => {
    const details = ['Field "name" is required', 'Field "email" must be valid'];
    const err = new ValidationError("Validation failed", details);
    expect(err.details).toEqual(details);
  });
});

describe("ConflictError", () => {
  it('should default to "Resource already exists"', () => {
    const err = new ConflictError();
    expect(err.message).toBe("Resource already exists");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });

  it("should accept custom message", () => {
    const err = new ConflictError("Username already taken");
    expect(err.message).toBe("Username already taken");
  });
});

describe("UnauthorizedError", () => {
  it("should have status 401 and default message", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toContain("Authentication required");
  });

  it("should accept custom message", () => {
    const err = new UnauthorizedError("Invalid credentials");
    expect(err.message).toBe("Invalid credentials");
  });
});

describe("ForbiddenError", () => {
  it("should have status 403", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });
});

describe("DatabaseError", () => {
  it("should have status 503", () => {
    const err = new DatabaseError();
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("DATABASE_ERROR");
  });
});

describe("OPCUAError", () => {
  it("should have status 500", () => {
    const err = new OPCUAError("Connection failed");
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("OPCUA_ERROR");
    expect(err.message).toBe("Connection failed");
  });
});

describe("fromDatabaseError", () => {
  it("should map 23505 (unique_violation) to ConflictError", () => {
    const err = fromDatabaseError({ code: "23505", detail: "" });
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.statusCode).toBe(409);
  });

  it("should detect username conflict from detail", () => {
    const err = fromDatabaseError({
      code: "23505",
      detail: "Key (username)=(test) already exists.",
    });
    expect(err.message).toBe("Username already taken.");
  });

  it("should detect email conflict from detail", () => {
    const err = fromDatabaseError({
      code: "23505",
      detail: "Key (email)=(test@test.com) already exists.",
    });
    expect(err.message).toBe("Email already registered.");
  });

  it("should detect endpoint conflict from detail", () => {
    const err = fromDatabaseError({
      code: "23505",
      detail: "Key (endpoint_url)=(opc.tcp://...) already exists.",
    });
    expect(err.message).toContain("endpoint URL already exists");
  });

  it("should map ECONNREFUSED to DatabaseError", () => {
    const err = fromDatabaseError({ code: "ECONNREFUSED" });
    expect(err).toBeInstanceOf(DatabaseError);
    expect(err.message).toContain("connect to the database");
  });

  it("should map 08006 (connection_failure) to DatabaseError", () => {
    const err = fromDatabaseError({ code: "08006" });
    expect(err).toBeInstanceOf(DatabaseError);
  });

  it("should map 42P01 (undefined_table) to DatabaseError", () => {
    const err = fromDatabaseError({ code: "42P01" });
    expect(err).toBeInstanceOf(DatabaseError);
    expect(err.message).toContain("Table does not exist");
  });

  it("should map unknown codes to generic DatabaseError", () => {
    const err = fromDatabaseError({ code: "99999", message: "Unknown error" });
    expect(err).toBeInstanceOf(DatabaseError);
    expect(err.message).toBe("Unknown error");
  });
});
