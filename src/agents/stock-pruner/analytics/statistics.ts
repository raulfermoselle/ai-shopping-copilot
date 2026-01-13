/**
 * Statistics Utilities
 *
 * Pure functions for statistical calculations used in product analytics.
 * All functions are deterministic and side-effect free.
 */

/**
 * Calculate the mean (average) of an array of numbers.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate the median of an array of numbers.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Calculate the mode (most frequent value) of an array of numbers.
 * Returns the smallest mode if there are ties.
 */
export function mode(values: number[]): number {
  if (values.length === 0) return 0;

  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  let maxCount = 0;
  let modeValue = values[0]!;
  for (const [value, count] of counts) {
    if (count > maxCount || (count === maxCount && value < modeValue)) {
      maxCount = count;
      modeValue = value;
    }
  }

  return modeValue;
}

/**
 * Calculate the variance of an array of numbers.
 * Uses sample variance (n-1 denominator) for unbiased estimation.
 */
export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const squaredDiffs = values.map((v) => (v - m) ** 2);
  return squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
}

/**
 * Calculate the standard deviation of an array of numbers.
 */
export function stdDev(values: number[]): number {
  return Math.sqrt(variance(values));
}

/**
 * Calculate the coefficient of variation (CV = stdDev / mean).
 * Returns 0 if mean is 0 to avoid division by zero.
 */
export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  return stdDev(values) / m;
}

/**
 * Calculate the z-score of a value given mean and standard deviation.
 * Z-score indicates how many standard deviations from the mean.
 */
export function zScore(value: number, meanVal: number, stdDevVal: number): number {
  if (stdDevVal === 0) return 0;
  return (value - meanVal) / stdDevVal;
}

/**
 * Linear regression result.
 */
export interface LinearRegressionResult {
  /** Slope of the regression line */
  slope: number;
  /** Y-intercept of the regression line */
  intercept: number;
  /** R² (coefficient of determination) - how well the line fits */
  rSquared: number;
}

/**
 * Perform simple linear regression on x, y pairs.
 * Returns slope, intercept, and R² value.
 */
export function linearRegression(
  xValues: number[],
  yValues: number[],
): LinearRegressionResult {
  if (xValues.length !== yValues.length || xValues.length < 2) {
    return { slope: 0, intercept: 0, rSquared: 0 };
  }

  const n = xValues.length;
  const xMean = mean(xValues);
  const yMean = mean(yValues);

  // Calculate slope: Σ((x - x̄)(y - ȳ)) / Σ((x - x̄)²)
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const xDiff = xValues[i]! - xMean;
    const yDiff = yValues[i]! - yMean;
    numerator += xDiff * yDiff;
    denominator += xDiff * xDiff;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  // Calculate R²
  let ssRes = 0; // Residual sum of squares
  let ssTot = 0; // Total sum of squares
  for (let i = 0; i < n; i++) {
    const predicted = slope * xValues[i]! + intercept;
    ssRes += (yValues[i]! - predicted) ** 2;
    ssTot += (yValues[i]! - yMean) ** 2;
  }

  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

/**
 * Calculate intervals between consecutive dates (in days).
 * Assumes dates are sorted in ascending order.
 */
export function calculateIntervals(dates: Date[]): number[] {
  if (dates.length < 2) return [];

  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const daysDiff =
      (dates[i]!.getTime() - dates[i - 1]!.getTime()) / (1000 * 60 * 60 * 24);
    intervals.push(daysDiff);
  }

  return intervals;
}

/**
 * Calculate days between two dates.
 */
export function daysBetween(date1: Date, date2: Date): number {
  return Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Get the month (1-12) from a date.
 */
export function getMonth(date: Date): number {
  return date.getMonth() + 1; // Convert from 0-indexed to 1-indexed
}

/**
 * Calculate monthly distribution of purchases.
 * Returns a map of month (1-12) to count.
 */
export function monthlyDistribution(dates: Date[]): Map<number, number> {
  const distribution = new Map<number, number>();

  // Initialize all months to 0
  for (let m = 1; m <= 12; m++) {
    distribution.set(m, 0);
  }

  for (const date of dates) {
    const month = getMonth(date);
    distribution.set(month, (distribution.get(month) ?? 0) + 1);
  }

  return distribution;
}

/**
 * Calculate chi-squared statistic for seasonality detection.
 * Compares observed monthly distribution to uniform distribution.
 * Higher values indicate stronger seasonality.
 */
export function seasonalityChiSquared(dates: Date[]): number {
  if (dates.length < 12) return 0; // Need at least 12 data points

  const distribution = monthlyDistribution(dates);
  const expected = dates.length / 12; // Expected count per month if uniform

  let chiSquared = 0;
  for (const count of distribution.values()) {
    chiSquared += (count - expected) ** 2 / expected;
  }

  return chiSquared;
}

/**
 * Identify peak months (significantly above average).
 */
export function findPeakMonths(dates: Date[], threshold = 1.5): number[] {
  const distribution = monthlyDistribution(dates);
  const avgCount = dates.length / 12;

  const peaks: number[] = [];
  for (const [month, count] of distribution) {
    if (count >= avgCount * threshold) {
      peaks.push(month);
    }
  }

  return peaks.sort((a, b) => a - b);
}

/**
 * Identify trough months (significantly below average).
 */
export function findTroughMonths(dates: Date[], threshold = 0.5): number[] {
  const distribution = monthlyDistribution(dates);
  const avgCount = dates.length / 12;

  const troughs: number[] = [];
  for (const [month, count] of distribution) {
    if (count <= avgCount * threshold && count < avgCount) {
      troughs.push(month);
    }
  }

  return troughs.sort((a, b) => a - b);
}

/**
 * Normalize a seasonality chi-squared value to 0-1 range.
 * Uses a sigmoid-like transformation.
 */
export function normalizeSeasonalityScore(chiSquared: number): number {
  // Chi-squared with df=11 has mean=11, values above ~20 indicate strong seasonality
  // We use a sigmoid to map to 0-1 range
  const scaled = (chiSquared - 11) / 10; // Center around expected value
  return 1 / (1 + Math.exp(-scaled)); // Sigmoid
}

/**
 * Calculate Jaccard similarity between two sets.
 */
export function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 0;

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Calculate lift for co-occurrence.
 * Lift = P(A and B) / (P(A) * P(B))
 * Values > 1 indicate positive association.
 */
export function calculateLift(
  coOccurrenceCount: number,
  countA: number,
  countB: number,
  totalOrders: number,
): number {
  if (countA === 0 || countB === 0 || totalOrders === 0) return 0;

  const pA = countA / totalOrders;
  const pB = countB / totalOrders;
  const pAB = coOccurrenceCount / totalOrders;

  return pAB / (pA * pB);
}

/**
 * Clamp a value to a range.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Round to specified decimal places.
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
