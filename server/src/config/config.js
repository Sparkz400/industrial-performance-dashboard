const Joi = require('joi');

const schema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    PORT: Joi.number().port().default(3000),
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().port().default(5432),
    OPCUA_PORT: Joi.number().port().default(4840)
});

const { value: config, error } = schema.validate(process.env, { allowUnknown: true });

if (error) throw new Error(`Config validation error: ${error.message}`);

module.exports = config;