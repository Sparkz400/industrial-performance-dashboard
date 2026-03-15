export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class OPCUAError extends AppError {
  constructor(message: string) {
    super(message, 500);
    this.name = "OPCUAError";
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, 503);
    this.name = "DatabaseError";
  }
}
