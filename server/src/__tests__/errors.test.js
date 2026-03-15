import { AppError, OPCUAError, DatabaseError } from "../utils/errors.js";

describe("AppError", () => {
  it("should create an error with message and statusCode", () => {
    const err = new AppError("Something went wrong", 400);
    expect(err.message).toBe("Something went wrong");
    expect(err.statusCode).toBe(400);
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it("should capture a stack trace", () => {
    const err = new AppError("stack test", 500);
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("stack test");
  });
});

describe("OPCUAError", () => {
  it("should default to status 500 and set name", () => {
    const err = new OPCUAError("OPC UA connection failed");
    expect(err.message).toBe("OPC UA connection failed");
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe("OPCUAError");
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(OPCUAError);
  });
});

describe("DatabaseError", () => {
  it("should default to status 503 and set name", () => {
    const err = new DatabaseError("DB unavailable");
    expect(err.message).toBe("DB unavailable");
    expect(err.statusCode).toBe(503);
    expect(err.name).toBe("DatabaseError");
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(DatabaseError);
  });
});
