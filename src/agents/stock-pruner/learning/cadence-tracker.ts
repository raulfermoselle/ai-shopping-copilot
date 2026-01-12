/**
 * Cadence Tracker - Pure Functions for Tracking Prediction Accuracy
 *
 * Tracks when pruning predictions were correct vs incorrect to enable
 * adaptive learning of household-specific restock patterns.
 *
 * All functions are pure: deterministic, no side effects, operate only on inputs.
 */

import { ProductCategory, CATEGORY_CADENCE_DEFAULTS } from '../types.js';
import {
  type CadenceAccuracy,
  type CadencePrediction,
  type LearningState,
  type ProductKey,
  type AdaptiveCadenceConfig,
  getProductKey,
  createDefaultAdaptiveCadenceConfig,
} from './types.js';

// =============================================================================
// Prediction Recording
// =============================================================================

/**
 * Result of recording a new prediction.
 */
export interface RecordPredictionResult {
  /** Updated cadence accuracy record */
  accuracy: CadenceAccuracy;
  /** Human-readable description of what was recorded */
  description: string;
}

/**
 * Record a new cadence prediction for a product.
 *
 * @param currentAccuracy - Existing accuracy record (or null if new)
 * @param productId - Product identifier (optional)
 * @param productName - Product name
 * @param category - Product category
 * @param predictedCadence - Predicted restock cadence in days
 * @param sessionId - Current session ID
 * @param timestamp - When prediction was made
 * @returns Updated accuracy record
 *
 * @example
 * const result = recordPrediction(
 *   null,
 *   'prod-123',
 *   'Leite Mimosa 1L',
 *   ProductCategory.DAIRY,
 *   8,
 *   'session-abc',
 *   new Date()
 * );
 */
export function recordPrediction(
  currentAccuracy: CadenceAccuracy | null,
  productId: string | undefined,
  productName: string,
  category: ProductCategory,
  predictedCadence: number,
  sessionId: string,
  timestamp: Date = new Date()
): RecordPredictionResult {
  const defaultCadence = CATEGORY_CADENCE_DEFAULTS[category];

  const newPrediction: CadencePrediction = {
    predictedCadence,
    actualCadence: null,
    wasCorrect: null,
    timestamp,
    sessionId,
  };

  if (currentAccuracy) {
    // Add to existing record
    const updatedPredictions = [...currentAccuracy.predictions, newPrediction];

    return {
      accuracy: {
        ...currentAccuracy,
        predictions: updatedPredictions,
        updatedAt: timestamp,
      },
      description: `Added prediction #${updatedPredictions.length} for "${productName}": ${predictedCadence} days`,
    };
  }

  // Create new record
  const newAccuracy: CadenceAccuracy = {
    productId,
    productName,
    category,
    predictions: [newPrediction],
    learnedCadence: defaultCadence,
    defaultCadence,
    confidence: 0.3, // Low initial confidence
    updatedAt: timestamp,
  };

  return {
    accuracy: newAccuracy,
    description: `Created accuracy record for "${productName}" with initial prediction: ${predictedCadence} days`,
  };
}

// =============================================================================
// Outcome Recording
// =============================================================================

/**
 * Result of recording prediction outcome.
 */
export interface RecordOutcomeResult {
  /** Updated cadence accuracy record */
  accuracy: CadenceAccuracy;
  /** Whether the prediction was correct */
  wasCorrect: boolean;
  /** Prediction error in days (positive = predicted too long, negative = too short) */
  errorDays: number;
  /** Human-readable description */
  description: string;
}

/**
 * Tolerance for considering a prediction "correct" (in days).
 * If actual cadence is within this range of predicted, it's considered correct.
 */
const PREDICTION_TOLERANCE_DAYS = 2;

/**
 * Record the actual outcome of a prediction.
 *
 * Called when we learn how long it actually took for the user to restock.
 *
 * @param accuracy - Current accuracy record
 * @param predictionIndex - Index of the prediction to update (or -1 for most recent)
 * @param actualCadence - Actual days until user restocked
 * @param timestamp - When outcome was recorded
 * @returns Updated accuracy record with outcome
 *
 * @example
 * const result = recordPredictionOutcome(accuracy, -1, 10, new Date());
 * // Records that the last prediction resulted in 10-day actual cadence
 */
export function recordPredictionOutcome(
  accuracy: CadenceAccuracy,
  predictionIndex: number,
  actualCadence: number,
  timestamp: Date = new Date()
): RecordOutcomeResult {
  // Resolve index (-1 = most recent)
  const index = predictionIndex === -1
    ? accuracy.predictions.length - 1
    : predictionIndex;

  if (index < 0 || index >= accuracy.predictions.length) {
    return {
      accuracy,
      wasCorrect: false,
      errorDays: 0,
      description: `Invalid prediction index: ${predictionIndex}`,
    };
  }

  const prediction = accuracy.predictions[index];
  if (!prediction) {
    return {
      accuracy,
      wasCorrect: false,
      errorDays: 0,
      description: `Prediction not found at index: ${index}`,
    };
  }

  const errorDays = prediction.predictedCadence - actualCadence;
  const wasCorrect = Math.abs(errorDays) <= PREDICTION_TOLERANCE_DAYS;

  // Update the prediction
  const updatedPredictions = [...accuracy.predictions];
  updatedPredictions[index] = {
    ...prediction,
    actualCadence,
    wasCorrect,
  };

  // Recalculate confidence and learned cadence
  const { confidence, learnedCadence } = calculateLearnedCadence(
    updatedPredictions,
    accuracy.defaultCadence,
    createDefaultAdaptiveCadenceConfig()
  );

  const updatedAccuracy: CadenceAccuracy = {
    ...accuracy,
    predictions: updatedPredictions,
    learnedCadence,
    confidence,
    updatedAt: timestamp,
  };

  const direction = errorDays > 0 ? 'overestimated' : 'underestimated';
  const correctStr = wasCorrect ? 'correct' : `incorrect (${direction} by ${Math.abs(errorDays)} days)`;

  return {
    accuracy: updatedAccuracy,
    wasCorrect,
    errorDays,
    description: `Recorded outcome for "${accuracy.productName}": prediction was ${correctStr}. ` +
      `Predicted ${prediction.predictedCadence} days, actual ${actualCadence} days.`,
  };
}

// =============================================================================
// Learned Cadence Calculation
// =============================================================================

/**
 * Result of learned cadence calculation.
 */
export interface LearnedCadenceResult {
  /** Calculated learned cadence in days */
  learnedCadence: number;
  /** Confidence in this cadence (0-1) */
  confidence: number;
  /** Number of data points used */
  dataPointsUsed: number;
  /** Human-readable reasoning */
  reasoning: string[];
}

/**
 * Calculate learned cadence from prediction history.
 *
 * Uses weighted average of actual cadences, with recent predictions
 * weighted more heavily. Falls back to default when insufficient data.
 *
 * @param predictions - Array of predictions with outcomes
 * @param defaultCadence - Default cadence to fall back to
 * @param config - Adaptive cadence configuration
 * @param referenceDate - Reference date for age calculations
 * @returns Learned cadence and confidence
 *
 * @example
 * const result = calculateLearnedCadence(predictions, 8, config);
 * // Returns { learnedCadence: 7, confidence: 0.75, ... }
 */
export function calculateLearnedCadence(
  predictions: CadencePrediction[],
  defaultCadence: number,
  config: AdaptiveCadenceConfig,
  referenceDate: Date = new Date()
): LearnedCadenceResult {
  const reasoning: string[] = [];

  // Filter to predictions with known outcomes
  const completedPredictions = predictions.filter(
    (p): p is CadencePrediction & { actualCadence: number } =>
      p.actualCadence !== null
  );

  // Not enough data - return default
  if (completedPredictions.length < config.minPredictionsForLearning) {
    reasoning.push(
      `Insufficient data: ${completedPredictions.length}/${config.minPredictionsForLearning} predictions needed`
    );
    return {
      learnedCadence: defaultCadence,
      confidence: 0.3,
      dataPointsUsed: completedPredictions.length,
      reasoning,
    };
  }

  // Filter by age
  const maxAgeMs = config.predictionMaxAgeDays * 24 * 60 * 60 * 1000;
  const recentPredictions = completedPredictions.filter((p) => {
    const ageMs = referenceDate.getTime() - new Date(p.timestamp).getTime();
    return ageMs <= maxAgeMs;
  });

  if (recentPredictions.length < config.minPredictionsForLearning) {
    reasoning.push(
      `Only ${recentPredictions.length} recent predictions (within ${config.predictionMaxAgeDays} days)`
    );
    return {
      learnedCadence: defaultCadence,
      confidence: 0.35,
      dataPointsUsed: recentPredictions.length,
      reasoning,
    };
  }

  // Calculate weighted average of actual cadences
  // More recent = higher weight
  let totalWeight = 0;
  let weightedSum = 0;
  let correctCount = 0;

  for (const prediction of recentPredictions) {
    const ageMs = referenceDate.getTime() - new Date(prediction.timestamp).getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    // Exponential decay based on age
    const weight = Math.exp(-config.predictionDecayRate * ageDays / 30);

    weightedSum += prediction.actualCadence * weight;
    totalWeight += weight;

    if (prediction.wasCorrect) {
      correctCount++;
    }
  }

  const weightedAverage = totalWeight > 0 ? weightedSum / totalWeight : defaultCadence;

  // Blend learned with default based on config
  const blendedCadence =
    weightedAverage * config.learnedCadenceWeight +
    defaultCadence * (1 - config.learnedCadenceWeight);

  // Clamp adjustment to max percent change from default
  const maxChange = defaultCadence * config.maxAdjustmentPercent;
  const learnedCadence = Math.round(
    Math.max(
      defaultCadence - maxChange,
      Math.min(defaultCadence + maxChange, blendedCadence)
    )
  );

  // Calculate confidence
  const accuracyRate = correctCount / recentPredictions.length;
  const dataConfidence = Math.min(recentPredictions.length / 10, 1);
  const confidence = Math.min(
    0.4 + accuracyRate * 0.3 + dataConfidence * 0.25,
    0.95
  );

  reasoning.push(
    `Based on ${recentPredictions.length} predictions (${correctCount} correct)`,
    `Weighted average: ${weightedAverage.toFixed(1)} days`,
    `Blended with default (${defaultCadence} days): ${learnedCadence} days`,
    `Accuracy rate: ${(accuracyRate * 100).toFixed(0)}%`
  );

  return {
    learnedCadence,
    confidence,
    dataPointsUsed: recentPredictions.length,
    reasoning,
  };
}

// =============================================================================
// Accuracy Statistics
// =============================================================================

/**
 * Statistics about prediction accuracy.
 */
export interface AccuracyStats {
  /** Total predictions made */
  totalPredictions: number;
  /** Predictions with known outcomes */
  completedPredictions: number;
  /** Predictions that were correct */
  correctPredictions: number;
  /** Accuracy rate (0-1) */
  accuracyRate: number;
  /** Average prediction error in days */
  avgErrorDays: number;
  /** Standard deviation of error */
  stdDevErrorDays: number;
  /** Bias direction (positive = tends to overestimate, negative = underestimate) */
  biasDirection: number;
}

/**
 * Calculate accuracy statistics from predictions.
 *
 * @param predictions - Array of predictions
 * @returns Accuracy statistics
 */
export function calculateAccuracyStats(predictions: CadencePrediction[]): AccuracyStats {
  const completed = predictions.filter(
    (p): p is CadencePrediction & { actualCadence: number; wasCorrect: boolean } =>
      p.actualCadence !== null && p.wasCorrect !== null
  );

  if (completed.length === 0) {
    return {
      totalPredictions: predictions.length,
      completedPredictions: 0,
      correctPredictions: 0,
      accuracyRate: 0,
      avgErrorDays: 0,
      stdDevErrorDays: 0,
      biasDirection: 0,
    };
  }

  const errors = completed.map((p) => p.predictedCadence - p.actualCadence);
  const correctCount = completed.filter((p) => p.wasCorrect).length;

  const avgError = errors.reduce((sum, e) => sum + e, 0) / errors.length;
  const variance = errors.reduce((sum, e) => sum + Math.pow(e - avgError, 2), 0) / errors.length;
  const stdDev = Math.sqrt(variance);

  return {
    totalPredictions: predictions.length,
    completedPredictions: completed.length,
    correctPredictions: correctCount,
    accuracyRate: correctCount / completed.length,
    avgErrorDays: Math.abs(avgError),
    stdDevErrorDays: stdDev,
    biasDirection: avgError, // Positive = overestimate, negative = underestimate
  };
}

// =============================================================================
// Learning State Updates
// =============================================================================

/**
 * Result of updating learning state with a prediction.
 */
export interface UpdateLearningStateResult {
  /** Updated learning state */
  state: LearningState;
  /** Product key that was updated */
  productKey: ProductKey;
  /** Description of what was updated */
  description: string;
}

/**
 * Update learning state with a new prediction.
 *
 * @param state - Current learning state
 * @param productId - Product identifier
 * @param productName - Product name
 * @param category - Product category
 * @param predictedCadence - Predicted cadence in days
 * @param sessionId - Current session ID
 * @param timestamp - When prediction was made
 * @returns Updated learning state
 */
export function updateStateWithPrediction(
  state: LearningState,
  productId: string | undefined,
  productName: string,
  category: ProductCategory,
  predictedCadence: number,
  sessionId: string,
  timestamp: Date = new Date()
): UpdateLearningStateResult {
  const key = getProductKey(productId, productName);
  const existingAccuracy = state.cadenceAccuracy[key] ?? null;

  const { accuracy, description } = recordPrediction(
    existingAccuracy,
    productId,
    productName,
    category,
    predictedCadence,
    sessionId,
    timestamp
  );

  const updatedCadenceAccuracy = {
    ...state.cadenceAccuracy,
    [key]: accuracy,
  };

  const updatedState: LearningState = {
    ...state,
    cadenceAccuracy: updatedCadenceAccuracy,
    lastUpdated: timestamp,
    stats: {
      ...state.stats,
      totalPredictions: state.stats.totalPredictions + 1,
      productsLearned: Object.keys(updatedCadenceAccuracy).length,
    },
  };

  return {
    state: updatedState,
    productKey: key,
    description,
  };
}

/**
 * Update learning state with a prediction outcome.
 *
 * @param state - Current learning state
 * @param productKey - Key of the product
 * @param actualCadence - Actual days until restock
 * @param timestamp - When outcome was recorded
 * @returns Updated learning state
 */
export function updateStateWithOutcome(
  state: LearningState,
  productKey: ProductKey,
  actualCadence: number,
  timestamp: Date = new Date()
): UpdateLearningStateResult {
  const existingAccuracy = state.cadenceAccuracy[productKey];

  if (!existingAccuracy) {
    return {
      state,
      productKey,
      description: `No accuracy record found for key: ${productKey}`,
    };
  }

  const { accuracy, wasCorrect, description } = recordPredictionOutcome(
    existingAccuracy,
    -1, // Most recent prediction
    actualCadence,
    timestamp
  );

  const updatedState: LearningState = {
    ...state,
    cadenceAccuracy: {
      ...state.cadenceAccuracy,
      [productKey]: accuracy,
    },
    lastUpdated: timestamp,
    stats: {
      ...state.stats,
      correctPredictions: wasCorrect
        ? state.stats.correctPredictions + 1
        : state.stats.correctPredictions,
    },
  };

  return {
    state: updatedState,
    productKey,
    description,
  };
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get learned cadence for a product.
 *
 * @param state - Learning state
 * @param productId - Product identifier
 * @param productName - Product name
 * @param category - Product category
 * @param config - Adaptive cadence config
 * @returns Learned cadence result
 */
export function getLearnedCadence(
  state: LearningState,
  productId: string | undefined,
  productName: string,
  category: ProductCategory,
  config: AdaptiveCadenceConfig = createDefaultAdaptiveCadenceConfig()
): LearnedCadenceResult {
  const key = getProductKey(productId, productName);
  const accuracy = state.cadenceAccuracy[key];
  const defaultCadence = CATEGORY_CADENCE_DEFAULTS[category];

  if (!accuracy) {
    return {
      learnedCadence: defaultCadence,
      confidence: 0.3,
      dataPointsUsed: 0,
      reasoning: [`No learning data for "${productName}". Using category default: ${defaultCadence} days`],
    };
  }

  return calculateLearnedCadence(accuracy.predictions, defaultCadence, config);
}

/**
 * Get products with low prediction accuracy.
 * These products may need user attention or have inconsistent patterns.
 *
 * @param state - Learning state
 * @param minPredictions - Minimum predictions to consider
 * @param maxAccuracyRate - Maximum accuracy rate to flag (0-1)
 * @returns Array of product keys with low accuracy
 */
export function getProblematicProducts(
  state: LearningState,
  minPredictions: number = 5,
  maxAccuracyRate: number = 0.5
): ProductKey[] {
  const problematic: ProductKey[] = [];

  for (const [key, accuracy] of Object.entries(state.cadenceAccuracy)) {
    const stats = calculateAccuracyStats(accuracy.predictions);

    if (
      stats.completedPredictions >= minPredictions &&
      stats.accuracyRate < maxAccuracyRate
    ) {
      problematic.push(key);
    }
  }

  return problematic;
}
