# How the Learning System Works

The AI Shopping Copilot uses a multi-layered memory system to learn household preferences and improve suggestions over time. This document explains the learning mechanisms.

## Memory Architecture Overview

```
                    +-------------------+
                    |   Working Memory  |
                    |   (Per Session)   |
                    +--------+----------+
                             |
         +-------------------+-------------------+
         |                                       |
+--------v---------+                   +---------v--------+
|  Long-term Memory |                  |  Episodic Memory |
|   (Persistent)    |                  |   (Persistent)   |
+------------------+                   +------------------+
| - Household prefs |                  | - Session outcomes|
| - Usual items     |                  | - User decisions  |
| - Restock cadence |                  | - Feedback logs   |
| - Substitutions   |                  | - Learning events |
+------------------+                   +------------------+
```

### Memory Types

| Type | Persistence | Purpose | Example Data |
|------|-------------|---------|--------------|
| Working | Session | Current changes | Out-of-stock items, proposed substitutions |
| Long-term | Persistent | Household preferences | Usual items, brand preferences, cadences |
| Episodic | Persistent | Historical outcomes | Approved/rejected suggestions, corrections |

## Preference Learning

### How Preferences Are Captured

Preferences are learned from:

1. **Order History Analysis**
   - Products purchased repeatedly
   - Typical quantities
   - Brand patterns
   - Category preferences

2. **User Feedback**
   - Approved cart items (positive signal)
   - Removed items (negative signal)
   - Substitution acceptances/rejections
   - Pruning decision feedback

3. **Implicit Signals**
   - Items always kept in cart
   - Items frequently removed
   - Substitution patterns

### Preference Types

```typescript
interface HouseholdPreferences {
  // Item preferences
  usualItems: {
    productId: string;
    name: string;
    typicalQuantity: number;
    frequency: 'weekly' | 'biweekly' | 'monthly' | 'occasional';
    confidence: number; // 0-1
  }[];

  // Brand preferences per category
  brandPreferences: {
    category: string;
    preferredBrands: string[];
    avoidBrands: string[];
  }[];

  // Substitution rules
  substitutionRules: {
    originalProduct: string;
    acceptableSubs: string[];
    rejectedSubs: string[];
    priceTolerancePercent: number;
  }[];
}
```

## Cadence Learning (Restock Intervals)

### How Cadences Are Learned

The StockPruner learns restock intervals from purchase history:

```
Purchase 1: Detergent on Jan 1
Purchase 2: Detergent on Feb 1  --> 31 days interval
Purchase 3: Detergent on Mar 5  --> 32 days interval

Learned cadence: ~31 days (confidence: 0.85)
```

### Cadence Learning Algorithm

```typescript
function learnCadence(purchaseHistory: PurchaseRecord[]): RestockProfile {
  // Sort purchases by date
  const sorted = purchaseHistory.sort((a, b) =>
    a.purchaseDate.getTime() - b.purchaseDate.getTime()
  );

  // Calculate intervals between purchases
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = daysBetween(sorted[i-1].purchaseDate, sorted[i].purchaseDate);
    intervals.push(days);
  }

  // Calculate average cadence
  const avgCadence = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  // Calculate confidence based on consistency
  const stdDev = calculateStdDev(intervals);
  const confidence = Math.max(0, 1 - (stdDev / avgCadence));

  return {
    restockCadenceDays: Math.round(avgCadence),
    confidence,
    source: 'learned',
  };
}
```

### Category Defaults

When insufficient history exists, category defaults are used:

| Category | Default Cadence | Confidence |
|----------|-----------------|------------|
| Fresh Produce | 5 days | Low |
| Dairy | 8 days | Low |
| Bread/Bakery | 4 days | Low |
| Pantry Staples | 37 days | Medium |
| Laundry | 45 days | Medium |
| Cleaning | 45 days | Medium |
| Paper Products | 37 days | Medium |
| Personal Hygiene | 45 days | Medium |
| Baby Care | 22 days | Medium |
| Pet Supplies | 25 days | Medium |

### Cadence Source Hierarchy

```
1. User Override (highest priority)
   "I always need detergent every 3 weeks"
        |
        v
2. Learned Cadence (if confidence > 0.6)
   Calculated from 3+ purchase intervals
        |
        v
3. Category Default (fallback)
   Based on product category
        |
        v
4. Conservative Default (21 days)
   When category unknown
```

## Substitution Learning

### How Substitution Preferences Are Learned

When users accept or reject substitutions, the system records:

```typescript
interface SubstitutionFeedback {
  originalProductId: string;
  proposedSubstituteId: string;
  accepted: boolean;
  reason?: string;  // Optional user explanation
  sessionId: string;
  timestamp: Date;
}
```

### Building Substitution Rules

Over time, patterns emerge:

```
"Leite Mimosa 1L" unavailable:
  - Accepted: "Leite Agros 1L" (3 times)
  - Accepted: "Leite Terra Nostra 1L" (1 time)
  - Rejected: "Leite Desnatado 1L" (2 times)  --> User prefers full-fat

Learned rule:
  For "Leite Mimosa 1L":
    - Prefer: Leite Agros, Leite Terra Nostra (same fat content)
    - Avoid: Desnatado variants
    - Price tolerance: +15%
```

### Scoring Substitutes

Substitutes are scored based on learned preferences:

```typescript
function scoreSubstitute(
  original: Product,
  candidate: Product,
  preferences: UserPreferences
): number {
  let score = 0;

  // Brand similarity (30% weight)
  score += preferences.brandPreferences.includes(candidate.brand) ? 0.3 : 0;

  // Size match (20% weight)
  score += sizeSimilarity(original.size, candidate.size) * 0.2;

  // Price proximity (30% weight)
  const priceDelta = Math.abs(candidate.price - original.price) / original.price;
  score += Math.max(0, 1 - priceDelta / preferences.priceTolerancePercent) * 0.3;

  // Category match (20% weight)
  score += original.category === candidate.category ? 0.2 : 0;

  // Past acceptance bonus
  if (preferences.acceptedSubstitutes.includes(candidate.productId)) {
    score += 0.2;
  }

  // Past rejection penalty
  if (preferences.rejectedSubstitutes.includes(candidate.productId)) {
    score -= 0.5;
  }

  return Math.max(0, Math.min(1, score));
}
```

## Confidence Scoring

### What Confidence Means

Confidence scores (0-1) indicate certainty in decisions:

| Score | Meaning | Action |
|-------|---------|--------|
| 0.9-1.0 | Very high confidence | Auto-apply suggestion |
| 0.7-0.9 | High confidence | Show as recommendation |
| 0.5-0.7 | Medium confidence | Present options, ask user |
| 0.3-0.5 | Low confidence | Flag for review |
| 0.0-0.3 | Very low confidence | Do not suggest |

### Factors Affecting Confidence

1. **Data Volume**
   - More purchase history = higher confidence
   - More feedback = higher confidence

2. **Consistency**
   - Consistent intervals = higher cadence confidence
   - Consistent choices = higher preference confidence

3. **Recency**
   - Recent data weighted more heavily
   - Old patterns may be outdated

### Confidence Calculation Example

```typescript
function calculateOverallConfidence(
  dataPoints: number,
  consistency: number,  // 0-1, how consistent the data is
  recency: number       // 0-1, how recent the data is
): number {
  // Base confidence from data volume (diminishing returns)
  const volumeConfidence = 1 - Math.exp(-dataPoints / 5);

  // Weight by consistency and recency
  return volumeConfidence * consistency * recency;
}

// Examples:
// 2 purchases, inconsistent, old   --> 0.32
// 5 purchases, consistent, recent  --> 0.82
// 10 purchases, consistent, recent --> 0.95
```

## Feedback Loop

### How User Feedback Improves the System

```
        User Session
             |
             v
    +------------------+
    |  Review Pack     |
    |  presented       |
    +--------+---------+
             |
    +--------v---------+
    |  User Actions:   |
    |  - Approve item  |
    |  - Remove item   |
    |  - Accept sub    |
    |  - Reject sub    |
    +--------+---------+
             |
    +--------v---------+
    |  Episodic Memory |
    |  records outcome |
    +--------+---------+
             |
    +--------v---------+
    |  Long-term Memory|
    |  updates prefs   |
    +------------------+
             |
             v
    Improved suggestions
    in next session
```

### Feedback Storage

```json
{
  "sessionId": "session-20260112-001",
  "feedback": [
    {
      "type": "prune_decision",
      "productName": "Detergente Skip",
      "suggested": "remove",
      "userChoice": "keep",
      "timestamp": "2026-01-12T10:30:00Z"
    },
    {
      "type": "substitution",
      "originalProduct": "Leite Mimosa 1L",
      "proposedSubstitute": "Leite Agros 1L",
      "accepted": true,
      "timestamp": "2026-01-12T10:31:00Z"
    }
  ]
}
```

## Learning Over Time

### Cold Start

Initial sessions with no history:
- Uses category defaults
- Relies on order history patterns
- Lower confidence scores
- More items flagged for review

### After 3-5 Sessions

- Cadences begin to stabilize
- Brand preferences emerge
- Substitution patterns learned
- Confidence scores increase

### After 10+ Sessions

- High-confidence predictions
- Personalized suggestions
- Fewer items needing review
- Accurate pruning recommendations

### Continuous Improvement

```
Session 1:  Cart accuracy ~60%, many manual edits
            |
Session 5:  Cart accuracy ~75%, substitution learning active
            |
Session 10: Cart accuracy ~85%, pruning suggestions reliable
            |
Session 20: Cart accuracy ~92%, minimal user intervention
```

## Data Privacy Considerations

### What Is Stored

- Product preferences (no personal data)
- Purchase patterns (aggregated)
- Feedback on suggestions (anonymized)

### What Is NOT Stored

- Payment information
- Delivery addresses
- Personal identification

### Data Location

All learning data is stored locally in `data/` directory:
- No cloud sync
- User controls their data
- Can be deleted at any time
