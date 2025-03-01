const Joi = require('joi');

// Dashboard validation schema
const dashboardSchema = Joi.object({
    name: Joi.string().required().trim().min(1).max(100),
    widgets: Joi.array().required(),
    layout: Joi.array().required(),
    serverLastModified: Joi.string().isoDate(),
    localLastModified: Joi.string().isoDate()
});

// OPC UA connection validation schema
const opcuaConnectionSchema = Joi.object({
    ip: Joi.string().required().hostname(),
    port: Joi.number().port().required(),
    resourcePath: Joi.string().default('/UA/MyLittleServer')
});

// Database test validation schema
const dbTestSchema = Joi.object({
    host: Joi.string().hostname().optional(),
    port: Joi.number().port().optional(),
    user: Joi.string().optional(),
    database: Joi.string().optional()
});

// Middleware function to validate request body
const validateBody = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body);

        if (error) {
            return res.status(400).json({
                error: `Validation Error: ${error.details[0].message}`
            });
        }

        // Replace the request body with the validated value
        req.body = value;
        next();
    };
};

// Middleware function to validate request params
const validateParams = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.params);

        if (error) {
            return res.status(400).json({
                error: `Validation Error: ${error.details[0].message}`
            });
        }

        // Replace the request params with the validated value
        req.params = value;
        next();
    };
};

module.exports = {
    schemas: {
        dashboardSchema,
        opcuaConnectionSchema,
        dbTestSchema
    },
    validateBody,
    validateParams
};