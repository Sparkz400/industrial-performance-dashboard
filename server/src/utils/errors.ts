export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  details?: string[];

  constructor(message: string, details?: string[]) {
    super(message, 400, "VALIDATION_ERROR");
    this.details = details;
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(message, 409, "CONFLICT");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required. Please log in.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class DatabaseError extends AppError {
  constructor(message = "Database service unavailable") {
    super(message, 503, "DATABASE_ERROR");
  }
}

export class OPCUAError extends AppError {
  constructor(message: string) {
    super(message, 500, "OPCUA_ERROR");
  }
}

/**
 * Maps well-known PostgreSQL error codes to appropriate AppError subclasses.
 */
export function fromDatabaseError(err: any): AppError {
  switch (err.code) {
    case "23505": {
      // unique_violation
      const detail: string = err.detail || "";
      let message = "Resource already exists";
      if (detail.includes("username")) message = "Username already taken.";
      else if (detail.includes("email")) message = "Email already registered.";
      else if (detail.includes("endpoint"))
        message = "A machine with this endpoint URL already exists";
      return new ConflictError(message);
    }
    case "ECONNREFUSED":
    case "08006": // connection_failure
      return new DatabaseError("Unable to connect to the database");
    case "42P01": // undefined_table
      return new DatabaseError(
        "Table does not exist. Did you run the database setup?",
      );
    default:
      return new DatabaseError(
        err.message || "An unexpected database error occurred",
      );
  }
}
