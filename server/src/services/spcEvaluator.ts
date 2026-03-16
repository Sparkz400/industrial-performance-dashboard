/**
 * Pure stateless SPC / anomaly-detection functions.
 *
 * Every function receives raw numeric data and returns detection results
 * without side-effects (no DB access, no logging).
 */

export interface AnomalyResult {
  isAnomaly: boolean;
  zScore?: number;
  alertType?: "ucl_breach" | "lcl_breach" | "trend" | "shift";
}

// ---- Z-Score Check ----

export function zScoreCheck(
  value: number,
  mean: number,
  stddev: number,
  sensitivity: number,
): AnomalyResult {
  if (stddev === 0) {
    // If there is no variance, any deviation from mean is anomalous
    const isAnomaly = value !== mean;
    return {
      isAnomaly,
      zScore: isAnomaly ? Infinity : 0,
      alertType: isAnomaly
        ? value > mean
          ? "ucl_breach"
          : "lcl_breach"
        : undefined,
    };
  }

  const zScore = (value - mean) / stddev;

  if (Math.abs(zScore) >= sensitivity) {
    return {
      isAnomaly: true,
      zScore,
      alertType: zScore > 0 ? "ucl_breach" : "lcl_breach",
    };
  }

  return { isAnomaly: false, zScore };
}

// ---- Moving Average Check ----

export interface MovingAverageResult extends AnomalyResult {
  movingAverage: number;
  deviation: number;
}

export function movingAverageCheck(
  values: number[],
  windowSize: number,
  sensitivity: number,
): MovingAverageResult {
  if (values.length === 0) {
    return { isAnomaly: false, movingAverage: 0, deviation: 0 };
  }

  const window = values.slice(-windowSize);
  const sum = window.reduce((a, b) => a + b, 0);
  const movingAverage = sum / window.length;

  // Standard deviation of window
  const variance =
    window.reduce((acc, v) => acc + (v - movingAverage) ** 2, 0) /
    window.length;
  const stddev = Math.sqrt(variance);

  const latest = values[values.length - 1];
  const deviation = stddev > 0 ? Math.abs(latest - movingAverage) / stddev : 0;

  if (deviation >= sensitivity) {
    return {
      isAnomaly: true,
      movingAverage,
      deviation,
      alertType: latest > movingAverage ? "ucl_breach" : "lcl_breach",
    };
  }

  return { isAnomaly: false, movingAverage, deviation };
}

// ---- CUSUM Check ----

export interface CusumResult extends AnomalyResult {
  cusumHigh: number;
  cusumLow: number;
}

export function cusumCheck(
  values: number[],
  target: number,
  allowance: number,
): CusumResult {
  if (values.length === 0) {
    return { isAnomaly: false, cusumHigh: 0, cusumLow: 0 };
  }

  let cusumHigh = 0;
  let cusumLow = 0;

  // The decision interval H is typically 4-5 times the allowance
  const decisionInterval = allowance * 5;

  for (const value of values) {
    cusumHigh = Math.max(0, cusumHigh + (value - target) - allowance);
    cusumLow = Math.max(0, cusumLow - (value - target) - allowance);
  }

  if (cusumHigh > decisionInterval) {
    return {
      isAnomaly: true,
      cusumHigh,
      cusumLow,
      alertType: "ucl_breach",
    };
  }

  if (cusumLow > decisionInterval) {
    return {
      isAnomaly: true,
      cusumHigh,
      cusumLow,
      alertType: "lcl_breach",
    };
  }

  return { isAnomaly: false, cusumHigh, cusumLow };
}

// ---- Western Electric Rules ----

export interface WesternElectricResult {
  isAnomaly: boolean;
  triggeredRules: string[];
  alertType?: "trend" | "shift" | "ucl_breach" | "lcl_breach";
}

/**
 * Checks Western Electric rules on the most recent values:
 *   Rule 1: 1 point beyond 3-sigma
 *   Rule 2: 2 of 3 consecutive points beyond 2-sigma (same side)
 *   Rule 3: 4 of 5 consecutive points beyond 1-sigma (same side)
 *   Rule 4: 8 consecutive points on the same side of centre
 */
export function westernElectricRules(
  recentValues: number[],
  mean: number,
  stddev: number,
): WesternElectricResult {
  const triggeredRules: string[] = [];

  if (recentValues.length === 0 || stddev === 0) {
    return { isAnomaly: false, triggeredRules };
  }

  const latest = recentValues[recentValues.length - 1];
  const sigma1 = stddev;
  const sigma2 = 2 * stddev;
  const sigma3 = 3 * stddev;

  // Rule 1 - any single point beyond 3-sigma
  if (Math.abs(latest - mean) > sigma3) {
    triggeredRules.push("rule1_beyond_3sigma");
  }

  // Rule 2 - 2 of last 3 beyond 2-sigma (same side)
  if (recentValues.length >= 3) {
    const last3 = recentValues.slice(-3);
    const above2Sigma = last3.filter((v) => v - mean > sigma2).length;
    const below2Sigma = last3.filter((v) => mean - v > sigma2).length;
    if (above2Sigma >= 2 || below2Sigma >= 2) {
      triggeredRules.push("rule2_2of3_beyond_2sigma");
    }
  }

  // Rule 3 - 4 of last 5 beyond 1-sigma (same side)
  if (recentValues.length >= 5) {
    const last5 = recentValues.slice(-5);
    const above1Sigma = last5.filter((v) => v - mean > sigma1).length;
    const below1Sigma = last5.filter((v) => mean - v > sigma1).length;
    if (above1Sigma >= 4 || below1Sigma >= 4) {
      triggeredRules.push("rule3_4of5_beyond_1sigma");
    }
  }

  // Rule 4 - 8 consecutive points same side of mean
  if (recentValues.length >= 8) {
    const last8 = recentValues.slice(-8);
    const allAbove = last8.every((v) => v > mean);
    const allBelow = last8.every((v) => v < mean);
    if (allAbove || allBelow) {
      triggeredRules.push("rule4_8_consecutive_same_side");
    }
  }

  if (triggeredRules.length === 0) {
    return { isAnomaly: false, triggeredRules };
  }

  // Determine alert type
  let alertType: WesternElectricResult["alertType"] = "shift";
  if (triggeredRules.includes("rule1_beyond_3sigma")) {
    alertType = latest > mean ? "ucl_breach" : "lcl_breach";
  } else if (triggeredRules.includes("rule4_8_consecutive_same_side")) {
    alertType = "shift";
  } else {
    alertType = "trend";
  }

  return { isAnomaly: true, triggeredRules, alertType };
}
