/**
 * CLI Renderer for Control Panel
 *
 * Terminal-based renderer for displaying the Review Pack to users.
 * Uses ANSI color codes for terminal coloring and box-drawing characters
 * for structured layout.
 *
 * Features:
 * - Progress bar visualization
 * - Cart summary with totals
 * - Cart diff with color-coded changes
 * - Pruning recommendations
 * - Delivery slot options
 * - Approval prompt
 */

import type {
  ReviewPack,
  ProgressState,
  DecisionReasoning,
} from './types.js';
import {
  formatPrice,
  formatDate,
  getConfidenceLabel,
} from './types.js';
import {
  formatDuration,
  formatRemainingTime,
} from './components/progress-tracker.js';

// =============================================================================
// ANSI Color Codes
// =============================================================================

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
  bgBlue: '\x1b[44m',
};

// =============================================================================
// Box Drawing Characters
// =============================================================================

const box = {
  topLeft: '\u250C',
  topRight: '\u2510',
  bottomLeft: '\u2514',
  bottomRight: '\u2518',
  horizontal: '\u2500',
  vertical: '\u2502',
  teeRight: '\u251C',
  teeLeft: '\u2524',
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a horizontal line of specified width.
 */
function horizontalLine(width: number): string {
  return box.horizontal.repeat(width);
}

/**
 * Pad or truncate a string to fit a specific width.
 */
function padString(str: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  // Remove ANSI codes for length calculation
  const cleanStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = width - cleanStr.length;

  if (padding <= 0) {
    // Truncate if too long
    return cleanStr.substring(0, width);
  }

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + str;
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
    }
    default:
      return str + ' '.repeat(padding);
  }
}

/**
 * Create a boxed row with proper padding.
 */
function boxRow(content: string, width: number): string {
  return `${box.vertical} ${padString(content, width - 4)} ${box.vertical}`;
}

/**
 * Create a separator row.
 */
function separatorRow(width: number): string {
  return `${box.teeRight}${horizontalLine(width - 2)}${box.teeLeft}`;
}

// =============================================================================
// CLI Renderer Class
// =============================================================================

/**
 * CLI Renderer for displaying Review Pack in the terminal.
 */
export class CLIRenderer {
  private readonly boxWidth: number;

  constructor(boxWidth: number = 55) {
    this.boxWidth = boxWidth;
  }

  /**
   * Render a progress bar.
   */
  renderProgressBar(percent: number, width: number = 30): string {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const filled = Math.round((clampedPercent / 100) * width);
    const empty = width - filled;

    const filledBar = colors.green + '\u2588'.repeat(filled) + colors.reset;
    const emptyBar = colors.dim + '\u2591'.repeat(empty) + colors.reset;

    return `[${filledBar}${emptyBar}] ${Math.round(clampedPercent)}%`;
  }

  /**
   * Render the header section.
   */
  renderHeader(reviewPack: ReviewPack): string {
    const lines: string[] = [];
    const w = this.boxWidth;

    // Top border
    lines.push(`${box.topLeft}${horizontalLine(w - 2)}${box.topRight}`);

    // Session title
    const sessionIdShort = reviewPack.sessionId.substring(0, 20);
    const title = `REVIEW PACK - Session ${sessionIdShort}`;
    lines.push(boxRow(`${colors.cyan}${colors.bright}${title}${colors.reset}`, w));

    // Generated at
    const generatedStr = formatDate(reviewPack.generatedAt);
    lines.push(boxRow(`${colors.dim}Generated: ${generatedStr}${colors.reset}`, w));

    // Confidence
    const confidencePercent = Math.round(reviewPack.confidence * 100);
    const confidenceLabel = getConfidenceLabel(confidencePercent);
    const confidenceColor = confidenceLabel === 'High' ? colors.green :
                           confidenceLabel === 'Medium' ? colors.yellow : colors.red;
    lines.push(boxRow(`Confidence: ${confidenceColor}${confidencePercent}% (${confidenceLabel})${colors.reset}`, w));

    return lines.join('\n');
  }

  /**
   * Render the cart summary section.
   */
  renderCartSummary(reviewPack: ReviewPack): string {
    const lines: string[] = [];
    const w = this.boxWidth;

    // Separator
    lines.push(separatorRow(w));

    // Title
    lines.push(boxRow(`${colors.bright}CART SUMMARY${colors.reset}`, w));

    // Calculate totals
    const itemCount = reviewPack.addedItems.length;
    const subtotal = formatPrice(reviewPack.subtotal);

    lines.push(boxRow(`${colors.cyan}${itemCount} items${colors.reset}, ${colors.green}${subtotal}${colors.reset}`, w));

    // Delivery cost if available
    if (reviewPack.estimatedDeliveryCost !== undefined) {
      const deliveryCost = formatPrice(reviewPack.estimatedDeliveryCost);
      lines.push(boxRow(`Delivery: ${deliveryCost}`, w));
    }

    // Estimated total
    const estimatedTotal = formatPrice(reviewPack.estimatedTotal);
    lines.push(boxRow(`${colors.bright}Estimated Total: ${colors.green}${estimatedTotal}${colors.reset}`, w));

    // Orders analyzed
    if (reviewPack.ordersAnalyzed.length > 0) {
      const ordersCount = reviewPack.ordersAnalyzed.length;
      lines.push(boxRow(`${colors.dim}Based on ${ordersCount} previous order(s)${colors.reset}`, w));
    }

    return lines.join('\n');
  }

  /**
   * Render the cart diff section.
   */
  renderCartDiff(reviewPack: ReviewPack): string {
    const lines: string[] = [];
    const w = this.boxWidth;

    // Separator
    lines.push(separatorRow(w));

    // Title
    lines.push(boxRow(`${colors.bright}CHANGES${colors.reset}`, w));

    // Added items
    const addedCount = reviewPack.addedItems.length;
    if (addedCount > 0) {
      lines.push(boxRow(`  ${colors.green}+ Added: ${addedCount} items${colors.reset}`, w));
    }

    // Quantity changes
    const changedCount = reviewPack.quantityChanges.length;
    if (changedCount > 0) {
      lines.push(boxRow(`  ${colors.yellow}~ Changed: ${changedCount} items${colors.reset}`, w));
    }

    // Unavailable items
    const unavailableCount = reviewPack.unavailableItems.length;
    if (unavailableCount > 0) {
      lines.push(boxRow(`  ${colors.red}! Unavailable: ${unavailableCount} items${colors.reset}`, w));
    }

    // Suggested removals (from pruning)
    const removalCount = reviewPack.suggestedRemovals.length;
    if (removalCount > 0) {
      lines.push(boxRow(`  ${colors.magenta}- Suggested removals: ${removalCount} items${colors.reset}`, w));
    }

    // Show a few examples of changes if any
    if (unavailableCount > 0) {
      lines.push(boxRow('', w));
      lines.push(boxRow(`${colors.dim}Unavailable items:${colors.reset}`, w));

      const itemsToShow = reviewPack.unavailableItems.slice(0, 3);
      for (const item of itemsToShow) {
        const name = item.name.length > 35 ? item.name.substring(0, 32) + '...' : item.name;
        const subsCount = item.substitutes.length;
        const subsText = subsCount > 0 ? `${colors.cyan}(${subsCount} substitutes)${colors.reset}` : `${colors.red}(no subs)${colors.reset}`;
        lines.push(boxRow(`    ${name} ${subsText}`, w));
      }

      if (unavailableCount > 3) {
        lines.push(boxRow(`    ${colors.dim}... and ${unavailableCount - 3} more${colors.reset}`, w));
      }
    }

    return lines.join('\n');
  }

  /**
   * Render pruning recommendations section.
   */
  renderPruningRecommendations(reviewPack: ReviewPack): string {
    const lines: string[] = [];
    const w = this.boxWidth;

    const removals = reviewPack.suggestedRemovals;
    if (removals.length === 0) {
      return '';
    }

    // Separator
    lines.push(separatorRow(w));

    // Title
    lines.push(boxRow(`${colors.bright}PRUNING RECOMMENDATIONS${colors.reset}`, w));

    // Group by confidence
    const highConfidence = removals.filter(r => r.confidence >= 0.7);
    const uncertain = removals.filter(r => r.confidence < 0.7 && r.confidence >= 0.4);

    // High confidence removals
    for (const item of highConfidence.slice(0, 5)) {
      const name = item.name.length > 30 ? item.name.substring(0, 27) + '...' : item.name;
      const days = item.daysSinceLastPurchase;
      const daysText = days !== undefined ? `${days}d ago` : '';

      lines.push(boxRow(`  ${colors.red}\u2702${colors.reset} ${name} ${colors.dim}(${daysText})${colors.reset}`, w));

      // Show reason if available
      if (item.reason) {
        const reason = item.reason.length > 40 ? item.reason.substring(0, 37) + '...' : item.reason;
        lines.push(boxRow(`    ${colors.dim}${reason}${colors.reset}`, w));
      }
    }

    if (highConfidence.length > 5) {
      lines.push(boxRow(`  ${colors.dim}... and ${highConfidence.length - 5} more high-confidence${colors.reset}`, w));
    }

    // Uncertain items
    for (const item of uncertain.slice(0, 3)) {
      const name = item.name.length > 30 ? item.name.substring(0, 27) + '...' : item.name;
      const confPercent = Math.round(item.confidence * 100);

      lines.push(boxRow(`  ${colors.yellow}?${colors.reset} ${name} ${colors.dim}(${confPercent}% conf)${colors.reset}`, w));
    }

    if (uncertain.length > 3) {
      lines.push(boxRow(`  ${colors.dim}... and ${uncertain.length - 3} more uncertain${colors.reset}`, w));
    }

    return lines.join('\n');
  }

  /**
   * Render delivery slots section.
   */
  renderDeliverySlots(reviewPack: ReviewPack): string {
    const lines: string[] = [];
    const w = this.boxWidth;

    if (!reviewPack.slotsAvailable || reviewPack.slotOptions.length === 0) {
      // Separator
      lines.push(separatorRow(w));
      lines.push(boxRow(`${colors.bright}DELIVERY SLOTS${colors.reset}`, w));
      lines.push(boxRow(`${colors.yellow}No delivery slots available${colors.reset}`, w));
      return lines.join('\n');
    }

    // Separator
    lines.push(separatorRow(w));

    // Title
    lines.push(boxRow(`${colors.bright}DELIVERY SLOTS${colors.reset}`, w));

    // Sort by rank and show top slots
    const sortedSlots = [...reviewPack.slotOptions].sort((a, b) => a.rank - b.rank);

    for (let i = 0; i < Math.min(sortedSlots.length, 4); i++) {
      const slot = sortedSlots[i];
      if (!slot) continue;

      const isBest = i === 0;
      const icon = isBest ? `${colors.green}\u2605${colors.reset}` : ' ';

      // Format date
      const dateObj = new Date(slot.date);
      const dayName = slot.dayName || dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = dateObj.getDate();
      const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
      const timeWindow = `${slot.startTime}-${slot.endTime}`;

      // Format cost
      const costText = slot.isFree
        ? `${colors.green}FREE${colors.reset}`
        : slot.deliveryCost !== undefined
          ? formatPrice(slot.deliveryCost)
          : '';

      const bestLabel = isBest ? ` ${colors.green}(Best)${colors.reset}` : '';

      lines.push(boxRow(`  ${icon} ${dayName} ${dayNum} ${month}, ${timeWindow} - ${costText}${bestLabel}`, w));

      // Show reason for best slot
      if (isBest && slot.reason) {
        const reason = slot.reason.length > 40 ? slot.reason.substring(0, 37) + '...' : slot.reason;
        lines.push(boxRow(`    ${colors.dim}${reason}${colors.reset}`, w));
      }
    }

    if (sortedSlots.length > 4) {
      lines.push(boxRow(`  ${colors.dim}... and ${sortedSlots.length - 4} more slots${colors.reset}`, w));
    }

    return lines.join('\n');
  }

  /**
   * Render the complete Review Pack.
   */
  renderReviewPack(reviewPack: ReviewPack): string {
    const sections: string[] = [];
    const w = this.boxWidth;

    // Header
    sections.push(this.renderHeader(reviewPack));

    // Cart Summary
    sections.push(this.renderCartSummary(reviewPack));

    // Cart Diff
    sections.push(this.renderCartDiff(reviewPack));

    // Pruning Recommendations (if any)
    const pruning = this.renderPruningRecommendations(reviewPack);
    if (pruning) {
      sections.push(pruning);
    }

    // Delivery Slots
    sections.push(this.renderDeliverySlots(reviewPack));

    // Warnings (if any)
    if (reviewPack.warnings && reviewPack.warnings.length > 0) {
      const warningLines: string[] = [];
      warningLines.push(separatorRow(w));
      warningLines.push(boxRow(`${colors.yellow}${colors.bright}WARNINGS${colors.reset}`, w));

      for (const warning of reviewPack.warnings.slice(0, 3)) {
        const warnText = warning.length > 45 ? warning.substring(0, 42) + '...' : warning;
        warningLines.push(boxRow(`  ${colors.yellow}\u26A0${colors.reset} ${warnText}`, w));
      }

      sections.push(warningLines.join('\n'));
    }

    // Approval prompt
    sections.push(this.renderApprovalPrompt());

    // Bottom border
    sections.push(`${box.bottomLeft}${horizontalLine(w - 2)}${box.bottomRight}`);

    return sections.join('\n');
  }

  /**
   * Render the approval prompt.
   */
  renderApprovalPrompt(): string {
    const lines: string[] = [];
    const w = this.boxWidth;

    // Separator
    lines.push(separatorRow(w));

    // Action buttons
    const approveBtn = `${colors.bgGreen}${colors.bright} [A] Approve ${colors.reset}`;
    const rejectBtn = `${colors.bgRed}${colors.bright} [R] Reject ${colors.reset}`;
    const quitBtn = `${colors.dim}[Q] Quit${colors.reset}`;

    lines.push(boxRow(`${approveBtn}  ${rejectBtn}  ${quitBtn}`, w));

    return lines.join('\n');
  }

  /**
   * Render progress state for real-time updates.
   */
  renderProgress(state: ProgressState): string {
    const lines: string[] = [];
    const w = this.boxWidth;

    // Top border
    lines.push(`${box.topLeft}${horizontalLine(w - 2)}${box.topRight}`);

    // Phase title
    lines.push(boxRow(`${colors.cyan}${colors.bright}${state.phaseDescription}${colors.reset}`, w));

    // Progress bar
    const progressBar = this.renderProgressBar(state.progress, 35);
    lines.push(boxRow(progressBar, w));

    // Current action
    if (state.currentAction) {
      const action = state.currentAction.length > 45
        ? state.currentAction.substring(0, 42) + '...'
        : state.currentAction;
      lines.push(boxRow(`${colors.dim}${action}${colors.reset}`, w));
    }

    // Time remaining
    if (state.estimatedRemainingSeconds !== undefined) {
      const remaining = formatRemainingTime(state.estimatedRemainingSeconds);
      lines.push(boxRow(`${colors.dim}${remaining}${colors.reset}`, w));
    }

    // Separator
    lines.push(separatorRow(w));

    // Worker statuses
    lines.push(boxRow(`${colors.bright}Workers:${colors.reset}`, w));

    for (const worker of state.workers) {
      let statusColor = colors.gray;
      let statusIcon = '\u25CB'; // Empty circle

      switch (worker.status) {
        case 'running':
          statusColor = colors.blue;
          statusIcon = '\u25CF'; // Filled circle
          break;
        case 'complete':
          statusColor = colors.green;
          statusIcon = '\u2713'; // Checkmark
          break;
        case 'failed':
          statusColor = colors.red;
          statusIcon = '\u2717'; // X mark
          break;
        case 'skipped':
          statusColor = colors.gray;
          statusIcon = '\u2212'; // Minus
          break;
      }

      let line = `  ${statusColor}${statusIcon}${colors.reset} ${worker.displayName}`;

      if (worker.status === 'running' && worker.progress > 0) {
        line += ` ${colors.dim}(${Math.round(worker.progress)}%)${colors.reset}`;
      }

      if (worker.status === 'complete' && worker.durationMs) {
        line += ` ${colors.dim}(${formatDuration(worker.durationMs)})${colors.reset}`;
      }

      if (worker.status === 'failed' && worker.errorMessage) {
        const errMsg = worker.errorMessage.length > 25
          ? worker.errorMessage.substring(0, 22) + '...'
          : worker.errorMessage;
        line += ` ${colors.red}${errMsg}${colors.reset}`;
      }

      lines.push(boxRow(line, w));
    }

    // Bottom border
    lines.push(`${box.bottomLeft}${horizontalLine(w - 2)}${box.bottomRight}`);

    return lines.join('\n');
  }

  /**
   * Render decision reasoning for an item.
   */
  renderDecisionReasoning(reasoning: DecisionReasoning): string {
    const lines: string[] = [];

    // Decision icon and type
    let icon = '\u2022'; // Bullet
    let color = colors.white;

    switch (reasoning.decision) {
      case 'added':
        icon = '+';
        color = colors.green;
        break;
      case 'removed':
        icon = '-';
        color = colors.red;
        break;
      case 'substituted':
        icon = '\u2194'; // Left-right arrow
        color = colors.cyan;
        break;
      case 'quantity_changed':
        icon = '~';
        color = colors.yellow;
        break;
      case 'kept':
        icon = '\u2713';
        color = colors.green;
        break;
    }

    // Item name and decision
    lines.push(`${color}${icon}${colors.reset} ${colors.bright}${reasoning.itemName}${colors.reset}`);

    // Reasoning
    lines.push(`  ${colors.dim}${reasoning.reasoning}${colors.reset}`);

    // Factors
    if (reasoning.factors.length > 0) {
      for (const factor of reasoning.factors.slice(0, 3)) {
        lines.push(`    ${colors.dim}\u2022 ${factor}${colors.reset}`);
      }
    }

    // Confidence
    const confPercent = Math.round(reasoning.confidence.score * 100);
    const confColor = reasoning.confidence.level === 'high' ? colors.green :
                      reasoning.confidence.level === 'medium' ? colors.yellow : colors.red;
    lines.push(`  ${colors.dim}Confidence: ${confColor}${confPercent}%${colors.reset}`);

    return lines.join('\n');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new CLI renderer instance.
 */
export function createCLIRenderer(boxWidth?: number): CLIRenderer {
  return new CLIRenderer(boxWidth);
}

// =============================================================================
// Standalone Render Functions
// =============================================================================

/**
 * Render a progress bar without creating an instance.
 */
export function renderProgressBar(percent: number, width: number = 30): string {
  const renderer = new CLIRenderer();
  return renderer.renderProgressBar(percent, width);
}

/**
 * Render a complete Review Pack without creating an instance.
 */
export function renderReviewPack(reviewPack: ReviewPack, boxWidth?: number): string {
  const renderer = new CLIRenderer(boxWidth);
  return renderer.renderReviewPack(reviewPack);
}

/**
 * Render progress state without creating an instance.
 */
export function renderProgress(state: ProgressState, boxWidth?: number): string {
  const renderer = new CLIRenderer(boxWidth);
  return renderer.renderProgress(state);
}
