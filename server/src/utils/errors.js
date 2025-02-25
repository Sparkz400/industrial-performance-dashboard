class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class OPCUAError extends AppError {
    constructor(message) {
        super(message, 500);
        this.name = 'OPCUAError';
    }
}

class DatabaseError extends AppError {
    constructor(message) {
        super(message, 503);
        this.name = 'DatabaseError';
    }
}

module.exports = { AppError, OPCUAError, DatabaseError };