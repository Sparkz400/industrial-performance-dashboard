import Joi from "joi";

// bcrypt ignores bytes after 72; reject new passwords that would be silently truncated.
export const newPasswordSchema = Joi.string()
  .min(12)
  .max(72, "utf8")
  .required();
