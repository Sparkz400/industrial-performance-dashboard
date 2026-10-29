import express, { type Request, type Response } from "express";
import { eq, asc, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import Joi from "joi";
import { validateBody } from "../middleware/validation.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import db from "../database/db.js";
import config from "../config/config.js";
import { users } from "../database/schema.js";
import logger from "../utils/logger.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  fromDatabaseError,
} from "../utils/errors.js";

import { sessionEvents } from "../services/sessionAccess.js";

const router = express.Router();

const SALT_ROUNDS = 12;

// --- Validation Schemas ---
const loginSchema = Joi.object({
  username: Joi.string().min(1).max(100).required(),
  password: Joi.string().min(1).max(255).required(),
});

const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(255).required(),
  role: Joi.string()
    .valid("admin", "viewer", "wallboard", "operator", "supervisor")
    .default("viewer"),
});

const updateUserSchema = Joi.object({
  email: Joi.string().email().optional(),
  role: Joi.string()
    .valid("admin", "viewer", "wallboard", "operator", "supervisor")
    .optional(),
  isActive: Joi.boolean().optional(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).required(),
  newPassword: Joi.string().min(8).max(255).required(),
});

// --- POST /api/auth/login ---
router.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { username, password } = req.body;

    const result = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        passwordHash: users.passwordHash,
        updatedAt: users.updatedAt,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.username, username));

    // Unknown names are not stored: a password typed into the name field must not be kept.
    const failed = (
      reason: string,
      account?: { id: number; username: string },
    ) =>
      auditLogService.recordEvent(
        {
          action: "auth.login.failed",
          entityType: "auth",
          entityId: account?.id ?? null,
          entityName: account?.username ?? null,
          message: `Failed sign-in: ${reason}`,
        },
        getAuditActor(req),
      );
    if (result.length === 0) {
      await failed("unknown account");
      throw new UnauthorizedError("Invalid username or password.");
    }

    const user = result[0];

    if (!user.isActive) {
      await failed("deactivated account", user);
      throw new ForbiddenError(
        "Account is deactivated. Contact an administrator.",
      );
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      await failed("wrong password", user);
      throw new UnauthorizedError("Invalid username or password.");
    }

    // Regenerate session to prevent session fixation
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) reject(new AppError("Login failed. Please try again.", 500));
        else resolve();
      });
    });

    req.session.userId = user.id;
    req.session.userVersion = user.updatedAt?.toISOString();
    req.session.userRole = user.role;
    req.session.username = user.username;

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(new AppError("Login failed. Please try again.", 500));
        else resolve();
      });
    });

    logger.info(
      `[Auth] User "${user.username}" (role: ${user.role}) logged in.`,
    );
    await auditLogService.recordEvent(
      {
        action: "auth.login",
        entityType: "auth",
        entityId: user.id,
        entityName: user.username,
        message: `User "${user.username}" logged in`,
      },
      getAuditActor(req),
    );
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        recoveryMode: config.RECOVERY_MODE,
      },
    });
  }),
);

// --- POST /api/auth/logout ---
router.post("/logout", (req: Request, res: Response, next) => {
  const username = req.session?.username || "unknown";
  const actor = getAuditActor(req);
  const sessionId = req.sessionID;
  req.session.destroy((err) => {
    if (err) {
      next(new AppError("Logout failed.", 500));
      return;
    }
    sessionEvents.emit("sessionRevoked", sessionId);
    res.clearCookie("connect.sid");
    logger.info(`[Auth] User "${username}" logged out.`);
    void auditLogService.recordEvent(
      {
        action: "auth.logout",
        entityType: "auth",
        entityName: username,
        message: `User "${username}" logged out`,
      },
      actor,
    );
    res.json({ message: "Logged out successfully." });
  });
});

// --- GET /api/auth/me --- current user info
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.session.userId!));

    if (result.length === 0) {
      req.session.destroy(() => {});
      throw new UnauthorizedError("User not found.");
    }

    const user = result[0];
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        recoveryMode: config.RECOVERY_MODE,
      },
    });
  }),
);

// --- POST /api/auth/change-password ---
router.post(
  "/change-password",
  requireAuth,
  validateBody(changePasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;

    const result = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, req.session.userId!));

    if (result.length === 0) {
      throw new NotFoundError("User");
    }

    const valid = await bcrypt.compare(currentPassword, result[0].passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Current password is incorrect.");
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: sql`greatest(now(), ${users.updatedAt} + interval '1 millisecond')`,
      })
      .where(eq(users.id, req.session.userId!));

    sessionEvents.emit("userRevoked", req.session.userId);
    logger.info(
      `[Auth] User "${req.session.username}" changed their password.`,
    );
    await auditLogService.recordEvent(
      {
        action: "auth.password_changed",
        entityType: "auth",
        entityId: req.session.userId,
        entityName: req.session.username,
        message: `User "${req.session.username}" changed their password`,
      },
      getAuditActor(req),
    );
    res.json({ message: "Password changed successfully." });
  }),
);

// --- Admin: POST /api/auth/register ---
router.post(
  "/register",
  requireAuth,
  requireRole("admin"),
  validateBody(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { username, email, password, role } = req.body;
    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    try {
      const [created] = await db
        .insert(users)
        .values({ username, email, passwordHash: hash, role })
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
        });

      logger.info(
        `[Auth] Admin "${req.session.username}" registered new user "${username}" (role: ${role}).`,
      );
      await auditLogService.recordEvent(
        {
          action: "user.created",
          entityType: "user",
          entityId: created.id,
          entityName: created.username,
          message: `Admin "${req.session.username}" created user "${created.username}"`,
          metadata: {
            role: created.role,
            isActive: created.isActive,
          },
        },
        getAuditActor(req),
      );
      res.status(201).json({ user: created });
    } catch (err: any) {
      if (err.code === "23505") throw fromDatabaseError(err);
      throw err;
    }
  }),
);

// --- Admin: GET /api/auth/users ---
router.get(
  "/users",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt));

    res.json(result);
  }),
);

// --- Admin: PUT /api/auth/users/:id ---
router.put(
  "/users/:id",
  requireAuth,
  requireRole("admin"),
  validateBody(updateUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    const { email, role, isActive } = req.body;
    if (id === req.session.userId && isActive === false)
      throw new ValidationError("You cannot deactivate your own account.");

    if (id === req.session.userId && role && role !== "admin") {
      throw new ValidationError("You cannot change your own role.");
    }

    const updates: Record<string, any> = {
      updatedAt: sql`greatest(now(), ${users.updatedAt} + interval '1 millisecond')`,
    };
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;

    if (Object.keys(updates).length === 1) {
      throw new ValidationError("No fields to update.");
    }

    try {
      const [before] = await db
        .select({
          email: users.email,
          role: users.role,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.id, id));
      const result = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
          updatedAt: users.updatedAt,
        });

      if (result.length === 0) {
        throw new NotFoundError("User");
      }

      sessionEvents.emit("userRevoked", id);
      logger.info(
        `[Auth] Admin "${req.session.username}" updated user id=${id}.`,
      );
      await auditLogService.recordEvent(
        {
          action: "user.updated",
          entityType: "user",
          entityId: result[0].id,
          entityName: result[0].username,
          message: `Admin "${req.session.username}" updated user "${result[0].username}"`,
          metadata: {
            role: result[0].role,
            isActive: result[0].isActive,
            // Previous and new value of each submitted field, for access review.
            changes: Object.fromEntries(
              (["email", "role", "isActive"] as const)
                .filter((field) => req.body[field] !== undefined)
                .map((field) => [
                  field,
                  { from: before?.[field], to: result[0][field] },
                ]),
            ),
          },
        },
        getAuditActor(req),
      );
      if (id === req.session.userId)
        req.session.userVersion = result[0].updatedAt?.toISOString();
      res.json({ user: result[0] });
    } catch (err: any) {
      if (err.code === "23505") throw fromDatabaseError(err);
      throw err;
    }
  }),
);

export default router;
