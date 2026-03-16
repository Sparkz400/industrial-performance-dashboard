import { alertRepository } from "../repositories/alertRepository.js";
import type { AlertRuleRow, AlertHistoryRow } from "../database/schema.js";
import logger from "../utils/logger.js";

export interface AlertEvaluationData {
  key: string;
  value: unknown;
  timestamp: string;
  machineId?: number;
}

export interface AlertResult {
  rule: AlertRuleRow;
  triggerValue: number;
  message: string;
  historyEntry: AlertHistoryRow;
}

class AlertEvaluationService {
  private ruleCache = new Map<string, AlertRuleRow[]>();
  private cooldownMap = new Map<number, number>();
  private lastValues = new Map<string, number[]>();

  private static SLIDING_WINDOW_SIZE = 20;

  async loadRules(): Promise<void> {
    try {
      const rules = await alertRepository.getAllActiveRules();
      this.ruleCache.clear();

      for (const rule of rules) {
        const cacheKey = `${rule.machineId ?? "*"}:${rule.nodeKey}`;
        const existing = this.ruleCache.get(cacheKey) ?? [];
        existing.push(rule);
        this.ruleCache.set(cacheKey, existing);
      }

      logger.info(
        `[AlertEvaluation] Loaded ${rules.length} active alert rules into cache`,
      );
    } catch (err) {
      logger.error("[AlertEvaluation] Failed to load rules:", err);
    }
  }

  async evaluate(data: AlertEvaluationData): Promise<AlertResult[]> {
    if (data.value === null || data.value === undefined) return [];

    const numericValue = Number(data.value);
    if (isNaN(numericValue)) return [];

    const machineId = data.machineId;
    const nodeKey = data.key;
    const valueKey = `${machineId ?? "*"}:${nodeKey}`;

    // Update sliding window
    const window = this.lastValues.get(valueKey) ?? [];
    window.push(numericValue);
    if (window.length > AlertEvaluationService.SLIDING_WINDOW_SIZE) {
      window.shift();
    }
    this.lastValues.set(valueKey, window);

    // Look up matching rules: exact machineId match + wildcard rules
    const matchingRules: AlertRuleRow[] = [];

    const exactKey = `${machineId ?? "*"}:${nodeKey}`;
    const wildcardKey = `*:${nodeKey}`;

    const exactRules = this.ruleCache.get(exactKey);
    if (exactRules) matchingRules.push(...exactRules);

    if (machineId != null) {
      const wildcard = this.ruleCache.get(wildcardKey);
      if (wildcard) matchingRules.push(...wildcard);
    }

    if (matchingRules.length === 0) return [];

    const results: AlertResult[] = [];
    const now = Date.now();

    for (const rule of matchingRules) {
      // Check cooldown
      const lastFired = this.cooldownMap.get(rule.id) ?? 0;
      const cooldownMs = (rule.cooldownSeconds ?? 300) * 1000;
      if (now - lastFired < cooldownMs) continue;

      const triggered = this.evaluateCondition(
        rule.condition,
        numericValue,
        rule.threshold,
        rule.thresholdHigh,
        rule.rateWindowSeconds,
        window,
        data.timestamp,
      );

      if (!triggered) continue;

      // Update cooldown
      this.cooldownMap.set(rule.id, now);

      const message = `${rule.name}: value ${numericValue} ${rule.condition} threshold ${rule.threshold} on ${nodeKey}`;

      try {
        const historyEntry = await alertRepository.createAlertHistoryEntry({
          ruleId: rule.id,
          ruleName: rule.name,
          machineId: rule.machineId,
          nodeKey: rule.nodeKey,
          triggerValue: numericValue,
          threshold: rule.threshold,
          severity: rule.severity,
          status: "active",
          message,
          metadata: {
            timestamp: data.timestamp,
            condition: rule.condition,
            thresholdHigh: rule.thresholdHigh,
          },
        });

        results.push({
          rule,
          triggerValue: numericValue,
          message,
          historyEntry,
        });

        logger.warn(
          `[AlertEvaluation] Alert triggered: ${rule.name} (value=${numericValue}, threshold=${rule.threshold})`,
        );
      } catch (err) {
        logger.error(
          `[AlertEvaluation] Failed to create alert history for rule ${rule.id}:`,
          err,
        );
      }
    }

    return results;
  }

  async refreshRules(): Promise<void> {
    await this.loadRules();
  }

  private evaluateCondition(
    condition: string,
    value: number,
    threshold: number | null,
    thresholdHigh: number | null,
    rateWindowSeconds: number | null,
    window: number[],
    timestamp: string,
  ): boolean {
    switch (condition) {
      case "gt":
        return threshold != null && value > threshold;

      case "lt":
        return threshold != null && value < threshold;

      case "eq":
        return threshold != null && value === threshold;

      case "neq":
        return threshold != null && value !== threshold;

      case "range":
        // Out-of-range: fires when value is below threshold or above thresholdHigh
        return (
          threshold != null &&
          thresholdHigh != null &&
          (value < threshold || value > thresholdHigh)
        );

      case "rate_of_change": {
        if (threshold == null || window.length < 2) return false;
        const prev = window[window.length - 2];
        const rateWindow = rateWindowSeconds ?? 1;
        const ratePerSecond = Math.abs(value - prev) / rateWindow;
        return ratePerSecond > threshold;
      }

      case "state_change": {
        if (window.length < 2) return false;
        const lastValue = window[window.length - 2];
        return value !== lastValue;
      }

      default:
        return false;
    }
  }
}

const alertEvaluationService = new AlertEvaluationService();
export default alertEvaluationService;
