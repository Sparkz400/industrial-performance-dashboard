import { EventEmitter } from "events";
import type { OpcuaNodeData } from "@performance-dashboard/shared";
import { alarmRepository } from "../repositories/alarmRepository.js";
import logger from "../utils/logger.js";

interface RuleState {
  lastTriggeredAt: number;
  inAlarmState: boolean;
}

interface LoadedRule {
  id: number;
  machineId: number | null;
  nodeKey: string;
  name: string;
  condition: string;
  threshold: number | null;
  thresholdHigh: number | null;
  severity: string;
  cooldownSeconds: number | null;
}

class AlarmEvaluator extends EventEmitter {
  private rules: LoadedRule[] = [];
  private ruleState = new Map<number, RuleState>();
  private loaded = false;

  async loadRules(): Promise<void> {
    try {
      this.rules = await alarmRepository.getAllActiveRules();
      this.loaded = true;
      logger.info(
        `[AlarmEvaluator] Loaded ${this.rules.length} active alarm rules`,
      );
    } catch (err) {
      logger.error("[AlarmEvaluator] Failed to load rules:", err);
    }
  }

  async reloadRules(): Promise<void> {
    await this.loadRules();
  }

  evaluate(nodeData: OpcuaNodeData): void {
    if (!this.loaded || typeof nodeData.value !== "number") return;

    const value = nodeData.value as number;
    const machineId = nodeData.machineId;

    for (const rule of this.rules) {
      if (rule.nodeKey !== nodeData.key) continue;
      if (
        machineId != null &&
        rule.machineId != null &&
        rule.machineId !== machineId
      )
        continue;

      const triggered = this.evaluateCondition(
        rule.condition,
        value,
        rule.threshold,
        rule.thresholdHigh,
      );

      const state = this.ruleState.get(rule.id) ?? {
        lastTriggeredAt: 0,
        inAlarmState: false,
      };

      if (triggered && !state.inAlarmState) {
        const cooldown = (rule.cooldownSeconds ?? 300) * 1000;
        const now = Date.now();

        if (now - state.lastTriggeredAt < cooldown) continue;

        state.inAlarmState = true;
        state.lastTriggeredAt = now;
        this.ruleState.set(rule.id, state);

        void this.triggerAlarm(rule, value, nodeData);
      } else if (!triggered && state.inAlarmState) {
        state.inAlarmState = false;
        this.ruleState.set(rule.id, state);
      }
    }
  }

  private evaluateCondition(
    condition: string,
    value: number,
    threshold: number | null,
    thresholdHigh: number | null,
  ): boolean {
    if (threshold == null) return false;

    switch (condition) {
      case "gt":
        return value > threshold;
      case "gte":
        return value >= threshold;
      case "lt":
        return value < threshold;
      case "lte":
        return value <= threshold;
      case "eq":
        return value === threshold;
      case "between":
        return (
          thresholdHigh != null && value >= threshold && value <= thresholdHigh
        );
      case "outside":
        return (
          thresholdHigh != null && (value < threshold || value > thresholdHigh)
        );
      default:
        return false;
    }
  }

  private async triggerAlarm(
    rule: LoadedRule,
    value: number,
    nodeData: OpcuaNodeData,
  ): Promise<void> {
    try {
      const alarm = await alarmRepository.createAlarm({
        ruleId: rule.id,
        ruleName: rule.name,
        machineId: rule.machineId,
        nodeKey: rule.nodeKey,
        triggerValue: value,
        threshold: rule.threshold,
        severity: rule.severity as any,
        status: "active" as any,
        message: `${rule.name}: value ${value} ${rule.condition} ${rule.threshold} on ${nodeData.key}`,
        metadata: {
          label: nodeData.label,
          dataType: nodeData.dataType,
          timestamp: nodeData.timestamp,
        },
      });

      logger.warn(
        `[AlarmEvaluator] Alarm triggered: ${rule.name} (value=${value}, threshold=${rule.threshold})`,
      );

      this.emit("alarmTriggered", {
        id: alarm.id,
        ruleId: rule.id,
        machineId: rule.machineId,
        nodeKey: rule.nodeKey,
        severity: rule.severity,
        status: "active",
        message: alarm.message,
        source: rule.name,
        value,
        threshold: rule.threshold,
        triggeredAt: alarm.createdAt?.toISOString() ?? new Date().toISOString(),
        acknowledgedAt: null,
        clearedAt: null,
        acknowledgedBy: null,
      });
    } catch (err) {
      logger.error(
        `[AlarmEvaluator] Failed to create alarm for rule ${rule.id}:`,
        err,
      );
    }
  }
}

const alarmEvaluator = new AlarmEvaluator();
export default alarmEvaluator;
