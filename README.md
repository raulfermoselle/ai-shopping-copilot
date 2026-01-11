# AI Shopping Copilot

Cart preparation agent for Auchan.pt grocery shopping. Reduces recurring ~2-hour grocery sessions to a short review + approval workflow.

## Project Structure

```
ai-shopping-copilot/
├── src/
│   ├── agents/           # Agent implementations
│   │   ├── coordinator/  # Orchestrates session, creates review pack
│   │   ├── cart-builder/ # Loads/merges prior orders, favorites
│   │   ├── substitution/ # Finds replacements for unavailable items
│   │   ├── stock-pruner/ # Removes low-likelihood items
│   │   └── slot-scout/   # Collects delivery slot options
│   ├── tools/            # Playwright tool wrappers
│   ├── memory/           # Memory/persistence layer
│   ├── types/            # Shared TypeScript types
│   └── utils/            # Shared utilities
├── tests/                # Test files
├── config/               # Configuration files
├── scripts/              # Development scripts
├── docs/                 # Technical documentation
└── Sprints/              # Sprint management
```

## Getting Started

### Prerequisites

- Node.js 20+ (LTS)
- npm or pnpm

### Installation

```bash
npm install
```

### Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm run test

# Lint
npm run lint
```

## Architecture

```
User (Control Panel UI)
         ↓
    Coordinator Agent
         ↓
    ┌────┼────┬────────┬────────────┐
    ↓    ↓    ↓        ↓            ↓
CartBuilder  Substitution  StockPruner  SlotScout
    ↓    ↓    ↓        ↓            ↓
         Playwright (Auchan.pt)
                  ↓
           Review Pack → User Approval → Order
```

**Key Safety Constraint:** The agent NEVER places orders automatically. It stops at a ready-to-review cart state.

## Agents

| Agent | Purpose |
|-------|---------|
| **Coordinator** | Orchestrates the run, manages state, creates review checklist |
| **CartBuilder** | Loads previous orders, favorites, merges into draft cart |
| **Substitution** | Finds replacements for unavailable items |
| **StockPruner** | Removes items based on household stock/restock cadence |
| **SlotScout** | Collects best delivery slot options |

## License

Private project.
