# Data Model: {FEATURE_NAME}

**Date**: {DATE}
**Specification**: {SPEC_PATH}
**Version**: 1.0

---

## Overview

{1-2 sentences describing the data model purpose and scope}

---

## Entity Definitions

{For each entity/type in the system}

### {EntityName}

**Purpose**: {What this entity represents}

**Lifecycle**: {When created, how it's modified, when deleted}

#### Fields

| Field Name | Type | Required | Default | Validation Rules | Description |
|------------|------|----------|---------|------------------|-------------|
| `id` | `string` | Yes | auto-generated UUID | Must be valid UUID v4 | Unique identifier |
| `{fieldName}` | `{type}` | {Yes/No} | `{default value or N/A}` | {validation constraints} | {purpose of field} |
| `createdAt` | `Date` | Yes | `new Date()` | Must be valid ISO 8601 | Creation timestamp |
| `updatedAt` | `Date` | Yes | `new Date()` | Must be valid ISO 8601 | Last update timestamp |

#### Example

```typescript
{
  "id": "uuid-here",
  "{fieldName}": "{example value}",
  "createdAt": "2025-01-19T10:00:00Z",
  "updatedAt": "2025-01-19T10:00:00Z"
}
```

#### Type Definition

```typescript
interface {EntityName} {
  id: string;
  {fieldName}: {Type};
  createdAt: Date;
  updatedAt: Date;
}

// Zod schema for runtime validation
const {EntityName}Schema = z.object({
  id: z.string().uuid(),
  {fieldName}: z.{type}().{constraints}(),
  createdAt: z.date(),
  updatedAt: z.date()
});
```

---

### {NextEntityName}

{Repeat structure for each entity}

---

## Relationships

{Define how entities relate to each other}

### One-to-Many

| Parent Entity | Child Entity | Relationship | Cascade Behavior |
|---------------|--------------|--------------|------------------|
| {Parent} | {Child} | {Description of relationship} | {What happens on delete} |

**Example**: A `User` has many `Orders`. When a User is deleted, their Orders are soft-deleted (archived).

### Many-to-Many

| Entity A | Entity B | Join Entity | Constraints |
|----------|----------|-------------|-------------|
| {EntityA} | {EntityB} | {JoinEntity} | {Uniqueness, etc.} |

**Example**: A `Product` can be in many `Categories`, and a `Category` contains many `Products`. The join table `ProductCategory` has a unique constraint on `(productId, categoryId)`.

### One-to-One

| Entity A | Entity B | Relationship | Enforcement |
|----------|----------|--------------|-------------|
| {EntityA} | {EntityB} | {Description} | {Foreign key, unique constraint} |

---

## State Transitions

{For entities with state machines}

### {EntityName} State Machine

```
{StateDiagram}
Example:
[Draft] --submit--> [Pending] --approve--> [Active]
  |                     |                     |
  +----delete----------+-----reject---------+---> [Archived]
```

#### States

| State | Description | Valid Transitions | Entry Actions | Exit Actions |
|-------|-------------|-------------------|---------------|--------------|
| `{State1}` | {Description} | {State2, State3} | {Actions on entering state} | {Actions on leaving state} |
| `{State2}` | {Description} | {State3} | {Actions on entering state} | {Actions on leaving state} |

#### Transition Rules

**{State1} → {State2}**:
- **Trigger**: {What causes transition}
- **Conditions**: {Pre-conditions that must be met}
- **Actions**: {Side effects of transition}
- **Validation**: {Business rules to check}

---

## Business Rules

{Constraints and invariants that must always hold}

### Validation Rules

1. **{Rule Name}**: {Description}
   - **Applies to**: {Entity/Field}
   - **Enforcement**: {Runtime/Database/Application}
   - **Error Message**: "{Message shown when violated}"

2. **{Rule Name}**: {Description}
   - **Applies to**: {Entity/Field}
   - **Enforcement**: {Runtime/Database/Application}
   - **Error Message**: "{Message shown when violated}"

### Computed Fields

{Fields derived from other fields}

| Field | Formula | When Computed | Cached? |
|-------|---------|---------------|---------|
| `{computedField}` | `{formula}` | {On read/write/schedule} | {Yes/No} |

### Invariants

{Properties that must always be true}

- {Invariant 1}: {Description and enforcement mechanism}
- {Invariant 2}: {Description and enforcement mechanism}

---

## Storage & Indexing

### Primary Storage

- **Type**: {Database, File System, Memory, etc.}
- **Location**: {Path, table name, collection, etc.}
- **Persistence**: {Durable, Ephemeral, Cached}

### Indexes

{For database entities}

| Index Name | Fields | Type | Purpose | Uniqueness |
|------------|--------|------|---------|------------|
| `idx_{name}` | `({field1}, {field2})` | {B-tree, Hash, etc.} | {Query optimization target} | {Unique/Non-unique} |

**Example Queries Optimized**:
```sql
-- Query 1: Find active orders for user
SELECT * FROM orders WHERE userId = ? AND status = 'active';
-- Uses: idx_orders_userId_status

-- Query 2: Search products by name
SELECT * FROM products WHERE name LIKE ?;
-- Uses: idx_products_name
```

### Sharding Strategy

{If applicable}

- **Shard Key**: {Field used for sharding}
- **Shard Count**: {Number of shards}
- **Distribution**: {How data is distributed}

---

## Performance Considerations

### Data Volume

- **Expected Size**: {Records per entity}
- **Growth Rate**: {Increase per day/month/year}
- **Retention Policy**: {How long data is kept}

### Access Patterns

| Operation | Frequency | Latency Target | Optimization |
|-----------|-----------|----------------|--------------|
| {Operation 1} | {Requests/sec} | {Milliseconds} | {Index, cache, etc.} |
| {Operation 2} | {Requests/sec} | {Milliseconds} | {Index, cache, etc.} |

### Caching Strategy

- **Cache Type**: {Redis, In-memory, CDN, etc.}
- **Cached Entities**: {List entities}
- **TTL**: {Time to live}
- **Invalidation**: {When cache is cleared}

---

## Migration Strategy

{If this changes existing data}

### From Current State

**Current Schema**:
```typescript
{Current structure}
```

**New Schema**:
```typescript
{New structure}
```

### Migration Steps

1. **{Step 1}**: {Description}
   - SQL: `{Migration SQL if applicable}`
   - Backfill: {How to populate new fields}

2. **{Step 2}**: {Description}
   - SQL: `{Migration SQL if applicable}`
   - Backfill: {How to populate new fields}

### Rollback Plan

{How to revert if migration fails}

---

## Security & Privacy

### Sensitive Data

| Field | Sensitivity Level | Encryption | Access Control |
|-------|-------------------|------------|----------------|
| `{field}` | {High/Medium/Low} | {At rest/in transit/both} | {Who can access} |

### PII Handling

- **PII Fields**: {List fields containing PII}
- **Retention**: {How long PII is kept}
- **Anonymization**: {How PII is anonymized}
- **Deletion**: {How to delete user data}

---

## Example Usage

{Real-world examples of how data flows through the system}

### Scenario 1: {Use Case}

```typescript
// Create new entity
const {entity} = new {EntityName}({
  {field}: {value}
});

// Validate
{EntityName}Schema.parse({entity});

// Save
await repository.save({entity});

// Query
const results = await repository.findBy{Criteria}({criteria});

// Update state
{entity}.transitionTo({newState});
await repository.update({entity});
```

---

## Notes

{Additional context, gotchas, or important considerations}
