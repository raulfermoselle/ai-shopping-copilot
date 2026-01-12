# Memory Layout

This document describes the data directory structure, file formats, and persistence strategy for the AI Shopping Copilot.

## Directory Structure

```
ai-shopping-copilot/
├── data/
│   ├── selectors/              # UI selector definitions
│   │   ├── registry.json       # Master selector index
│   │   └── pages/
│   │       ├── login/
│   │       │   └── v1.json     # Login page selectors
│   │       ├── cart/
│   │       │   └── v1.json     # Cart page selectors
│   │       ├── order-history/
│   │       │   └── v1.json     # Order history selectors
│   │       ├── order-detail/
│   │       │   └── v1.json     # Order detail selectors
│   │       ├── search/
│   │       │   └── v1.json     # Search results selectors
│   │       └── product-detail/
│   │           └── v1.json     # Product page selectors
│   ├── sessions/               # Browser session storage
│   │   └── auchan-session.json # Persistent login session
│   ├── households/             # Per-household data (planned)
│   │   └── {householdId}/
│   │       ├── preferences.json
│   │       ├── purchase-history.json
│   │       ├── restock-profiles.json
│   │       ├── user-overrides.json
│   │       └── feedback/
│   │           └── session-{id}.json
│   └── exploration/            # Debug data from page analysis
│       └── *.json
├── logs/                       # Application logs
│   └── *.log
├── screenshots/                # Automation screenshots
│   └── *.png
└── config/
    └── default.json            # Default configuration
```

## JSON File Formats

### Selector Registry (`data/selectors/registry.json`)

Master index of all page selectors:

```json
{
  "schemaVersion": "1.0.0",
  "lastValidated": "2026-01-11T22:30:00Z",
  "pages": {
    "login": {
      "name": "Login Page",
      "urlPattern": "^https://(www\\.)?auchan\\.pt|login\\.salesforce\\.com",
      "activeVersion": 1,
      "versions": [1],
      "lastValidation": {
        "timestamp": "2026-01-11T00:00:00Z",
        "status": "valid",
        "failedSelectors": []
      }
    },
    "cart": {
      "name": "Shopping Cart",
      "urlPattern": "^https://(www\\.)?auchan\\.pt/pt/carrinho-compras",
      "activeVersion": 1,
      "versions": [1],
      "lastValidation": {
        "timestamp": "2026-01-11T00:00:00Z",
        "status": "partial",
        "failedSelectors": []
      },
      "notes": "Some selectors need verification with populated cart"
    }
  }
}
```

### Page Selector Definition (`data/selectors/pages/{page}/v{n}.json`)

Versioned selector definitions for a specific page:

```json
{
  "pageId": "cart",
  "version": 1,
  "urlPattern": "^https://(www\\.)?auchan\\.pt/pt/carrinho-compras",
  "validatedAt": "2026-01-11T00:00:00Z",
  "selectors": {
    "cartContainer": {
      "primary": "[data-testid='cart-container']",
      "fallbacks": [
        ".cart-container",
        "#shopping-cart"
      ],
      "description": "Main cart container element",
      "stability": 90
    },
    "cartItem": {
      "primary": ".auc-cart-item",
      "fallbacks": [
        "[data-component='cart-item']",
        ".cart-product-line"
      ],
      "description": "Individual cart item row",
      "stability": 75
    },
    "itemName": {
      "primary": ".auc-cart-item__name",
      "fallbacks": [
        ".cart-item-name",
        "[data-field='product-name']"
      ],
      "description": "Product name within cart item",
      "stability": 70
    },
    "itemPrice": {
      "primary": ".auc-cart-item__price",
      "fallbacks": [".cart-item-price"],
      "description": "Product price within cart item",
      "stability": 70
    },
    "cartTotal": {
      "primary": ".auc-cart-summary__total",
      "fallbacks": [
        "[data-testid='cart-total']",
        ".cart-total-value"
      ],
      "description": "Cart total price",
      "stability": 80
    }
  }
}
```

### Purchase History (`data/households/{id}/purchase-history.json`)

Historical purchase records for cadence learning:

```json
{
  "records": [
    {
      "productId": "P123456",
      "productName": "Detergente Skip 30 Doses",
      "purchaseDate": "2026-01-01T10:00:00Z",
      "quantity": 1,
      "orderId": "ORD-2026-001",
      "unitPrice": 12.99,
      "category": "laundry"
    },
    {
      "productId": "P789012",
      "productName": "Leite Mimosa 1L",
      "purchaseDate": "2026-01-01T10:00:00Z",
      "quantity": 6,
      "orderId": "ORD-2026-001",
      "unitPrice": 0.89,
      "category": "dairy"
    }
  ],
  "lastUpdated": "2026-01-12T08:00:00Z"
}
```

### Restock Profiles (`data/households/{id}/restock-profiles.json`)

Learned restock cadences for each product:

```json
{
  "profiles": {
    "P123456": {
      "productId": "P123456",
      "productName": "Detergente Skip 30 Doses",
      "category": "laundry",
      "restockCadenceDays": 42,
      "confidence": 0.85,
      "lastPurchaseDate": "2026-01-01T10:00:00Z",
      "averageQuantity": 1,
      "source": "learned",
      "updatedAt": "2026-01-12T08:00:00Z"
    },
    "P789012": {
      "productId": "P789012",
      "productName": "Leite Mimosa 1L",
      "category": "dairy",
      "restockCadenceDays": 8,
      "confidence": 0.92,
      "lastPurchaseDate": "2026-01-08T10:00:00Z",
      "averageQuantity": 6,
      "source": "learned",
      "updatedAt": "2026-01-12T08:00:00Z"
    }
  },
  "lastUpdated": "2026-01-12T08:00:00Z"
}
```

### User Overrides (`data/households/{id}/user-overrides.json`)

User-specified rules that override learned behavior:

```json
{
  "overrides": {
    "P123456": {
      "productId": "P123456",
      "productName": "Detergente Skip 30 Doses",
      "neverPrune": false,
      "alwaysPrune": false,
      "customCadenceDays": 30,
      "notes": "We use more detergent with the new baby",
      "createdAt": "2026-01-05T14:00:00Z"
    },
    "P999999": {
      "productId": "P999999",
      "productName": "Vinho Reserva",
      "neverPrune": true,
      "notes": "Always want this in cart for special occasions",
      "createdAt": "2026-01-10T09:00:00Z"
    }
  },
  "lastUpdated": "2026-01-10T09:00:00Z"
}
```

### Session Feedback (`data/households/{id}/feedback/session-{id}.json`)

User decisions captured during a session:

```json
{
  "sessionId": "session-20260112-001",
  "householdId": "household-001",
  "timestamp": "2026-01-12T10:30:00Z",
  "feedback": [
    {
      "type": "prune_decision",
      "productId": "P123456",
      "productName": "Detergente Skip 30 Doses",
      "suggested": "remove",
      "userChoice": "keep",
      "confidence": 0.72,
      "reason": "Recently purchased (15 days ago)",
      "timestamp": "2026-01-12T10:31:00Z"
    },
    {
      "type": "substitution",
      "originalProductId": "P789012",
      "originalProductName": "Leite Mimosa 1L",
      "substituteProductId": "P789013",
      "substituteProductName": "Leite Agros 1L",
      "accepted": true,
      "priceDelta": -0.10,
      "timestamp": "2026-01-12T10:32:00Z"
    },
    {
      "type": "cart_item",
      "productId": "P555555",
      "productName": "Bolachas Maria",
      "action": "removed",
      "reason": "user_manual",
      "timestamp": "2026-01-12T10:33:00Z"
    }
  ]
}
```

### Browser Session (`data/sessions/auchan-session.json`)

Playwright session storage for login persistence:

```json
{
  "cookies": [...],
  "origins": [
    {
      "origin": "https://www.auchan.pt",
      "localStorage": [...],
      "sessionStorage": [...]
    }
  ]
}
```

## Household Data Separation

Each household maintains isolated data:

```
data/households/
├── household-001/          # Family 1
│   ├── preferences.json
│   ├── purchase-history.json
│   ├── restock-profiles.json
│   └── feedback/
└── household-002/          # Family 2 (if multi-tenant)
    ├── preferences.json
    ├── purchase-history.json
    ├── restock-profiles.json
    └── feedback/
```

Benefits:
- Privacy isolation between households
- Independent preference learning
- Easy backup/restore per household
- Portable data (copy folder to migrate)

## Versioning Strategy

### Selector Versioning

Selectors are versioned to handle website changes:

```
data/selectors/pages/cart/
├── v1.json         # Initial selectors
├── v2.json         # After Auchan redesign
└── v3.json         # Current version
```

Version selection:
1. Registry points to `activeVersion`
2. Tool loads versioned file
3. Fallback chain tries selectors in order
4. Failed selectors trigger validation update

### Data Schema Versioning

Each file includes schema version:

```json
{
  "schemaVersion": "1.0.0",
  "data": {...}
}
```

Migration on version mismatch:
1. Check current vs. file schema version
2. Apply migrations in sequence
3. Update schema version
4. Save migrated data

### Migration Example

```typescript
// migrations/purchase-history.ts
const migrations = {
  '1.0.0-1.1.0': (data) => {
    // Add category field to records
    return {
      ...data,
      schemaVersion: '1.1.0',
      records: data.records.map(r => ({
        ...r,
        category: r.category || inferCategory(r.productName)
      }))
    };
  },
  '1.1.0-2.0.0': (data) => {
    // Restructure for multi-household
    return {
      schemaVersion: '2.0.0',
      householdId: 'default',
      records: data.records
    };
  }
};
```

## Data Migration

### Manual Migration

```bash
# Backup current data
cp -r data/ data-backup-$(date +%Y%m%d)/

# Run migration script
npm run migrate

# Verify migration
npm run verify-data
```

### Automatic Migration

The system auto-migrates on load:

```typescript
class DataLoader {
  load(filePath: string) {
    const data = JSON.parse(readFileSync(filePath));

    if (data.schemaVersion !== CURRENT_VERSION) {
      const migrated = this.migrate(data);
      writeFileSync(filePath, JSON.stringify(migrated));
      return migrated;
    }

    return data;
  }
}
```

## Backup & Recovery

### Backup Locations

| Data Type | Location | Backup Priority |
|-----------|----------|-----------------|
| Household data | `data/households/` | High |
| Selectors | `data/selectors/` | Medium |
| Sessions | `data/sessions/` | Low (regenerable) |
| Logs | `logs/` | Low |
| Screenshots | `screenshots/` | Low |

### Backup Script

```bash
#!/bin/bash
# backup-data.sh
BACKUP_DIR="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup household data (most important)
cp -r data/households/ "$BACKUP_DIR/households/"

# Backup selectors
cp -r data/selectors/ "$BACKUP_DIR/selectors/"

# Compress
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

echo "Backup created: $BACKUP_DIR.tar.gz"
```

### Recovery

```bash
# Extract backup
tar -xzf backups/20260112-100000.tar.gz

# Restore household data
cp -r 20260112-100000/households/* data/households/

# Restart application
npm run build && npm run demo
```

## File Size Management

### Pruning Old Data

```typescript
// Prune feedback older than 90 days
const RETENTION_DAYS = 90;

function pruneOldFeedback(householdDir: string) {
  const feedbackDir = path.join(householdDir, 'feedback');
  const cutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);

  for (const file of readdirSync(feedbackDir)) {
    const filePath = path.join(feedbackDir, file);
    const stats = statSync(filePath);

    if (stats.mtimeMs < cutoff) {
      unlinkSync(filePath);
    }
  }
}
```

### Size Limits

| File Type | Max Size | Action on Exceed |
|-----------|----------|------------------|
| purchase-history.json | 10 MB | Archive old records |
| Feedback files | 1 MB each | Consolidate monthly |
| Session logs | 50 MB total | Rotate daily |
| Screenshots | 500 MB total | Delete after 7 days |

## File Locking

For concurrent access safety:

```typescript
import { lockfile } from 'proper-lockfile';

async function updateData(filePath: string, updater: (data: any) => any) {
  const release = await lockfile(filePath, { retries: 3 });

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    const updated = updater(data);
    writeFileSync(filePath, JSON.stringify(updated, null, 2));
  } finally {
    await release();
  }
}
```

## Integrity Checks

### Validation on Load

```typescript
function validatePurchaseHistory(data: unknown): PurchaseHistory {
  const result = PurchaseHistorySchema.safeParse(data);

  if (!result.success) {
    console.error('Invalid purchase history:', result.error);
    throw new ValidationError('Purchase history validation failed');
  }

  return result.data;
}
```

### Periodic Health Checks

```bash
# Run data integrity check
npm run check-data

# Output:
# Checking households/household-001/purchase-history.json... OK
# Checking households/household-001/restock-profiles.json... OK
# Checking selectors/registry.json... OK
# All data files valid.
```
