import { z } from "zod";
import { router, authedProcedure, adminProcedure } from "../trpc.js";
import { alarmRepository } from "../../repositories/alarmRepository.js";
import alarmEvaluator, {
  alarmConditions,
} from "../../services/alarmService.js";

export const alarmRouter = router({
  list: authedProcedure
    .input(
      z
        .object({
          severity: z
            .enum(["critical", "high", "medium", "low", "info"])
            .optional(),
          status: z
            .enum(["active", "acknowledged", "resolved", "silenced"])
            .optional(),
          machineId: z.number().int().optional(),
          limit: z.number().int().min(1).max(5000).default(100),
          offset: z.number().int().min(0).default(0),
          startDate: z.string().datetime().optional(),
          endDate: z.string().datetime().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      return alarmRepository.listAlarms(input ?? {});
    }),

  acknowledge: authedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const alarm = await alarmEvaluator.acknowledge(
        input.id,
        ctx.session.userId,
      );
      if (!alarm) throw new Error("Alarm not found");
      return { alarm };
    }),

  clear: authedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(() => {
      throw new Error(
        "Alarms clear only when good measurements confirm recovery",
      );
    }),

  // Rules
  listRules: authedProcedure.query(async () => {
    return alarmRepository.listRules();
  }),

  createRule: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        machineId: z.number().int(),
        nodeKey: z.string(),
        condition: z.enum(alarmConditions),
        threshold: z.number(),
        thresholdHigh: z.number().optional(),
        rateWindowSeconds: z.number().int().min(1).max(86400).optional(),
        debounceSeconds: z.number().int().min(0).max(86400).optional(),
        clearDebounceSeconds: z.number().int().min(0).max(86400).optional(),
        hysteresis: z.number().min(0).optional(),
        severity: z
          .enum(["critical", "high", "medium", "low", "info"])
          .default("medium"),
        cooldownSeconds: z.number().int().min(0).default(300),
        channels: z.array(z.never()).default([]),
        isActive: z.boolean().default(true),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const rule = await alarmRepository.createRule({
        ...input,
        createdBy: ctx.session.userId,
      });
      await alarmEvaluator.reloadRules();
      return rule;
    }),

  updateRule: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        data: z.object({
          name: z.string().min(1).max(255).optional(),
          condition: z.string().optional(),
          threshold: z.number().optional(),
          thresholdHigh: z.number().optional(),
          rateWindowSeconds: z.number().int().min(1).max(86400).optional(),
          debounceSeconds: z.number().int().min(0).max(86400).optional(),
          clearDebounceSeconds: z.number().int().min(0).max(86400).optional(),
          hysteresis: z.number().min(0).optional(),
          severity: z
            .enum(["critical", "high", "medium", "low", "info"])
            .optional(),
          cooldownSeconds: z.number().int().min(0).optional(),
          isActive: z.boolean().optional(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      const rule = await alarmRepository.updateRule(input.id, input.data);
      if (!rule) throw new Error("Rule not found");
      await alarmEvaluator.reloadRules();
      return rule;
    }),

  deleteRule: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const deleted = await alarmRepository.deleteRule(input.id);
      if (!deleted) throw new Error("Rule not found");
      await alarmEvaluator.reloadRules();
      return { message: "Rule deleted successfully" };
    }),
});
