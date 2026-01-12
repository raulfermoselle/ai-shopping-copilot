# Setup & Configuration Guide

This guide covers installation, configuration, and running the AI Shopping Copilot.

## Prerequisites

### System Requirements

- **Node.js**: v20.0.0 or higher
- **npm**: v9.0.0 or higher (comes with Node.js)
- **Operating System**: Windows, macOS, or Linux
- **Memory**: Minimum 4GB RAM (8GB recommended for browser automation)

### Required Software

1. **Node.js** - Download from [nodejs.org](https://nodejs.org/)
   ```bash
   # Verify installation
   node --version  # Should be v20.0.0 or higher
   npm --version
   ```

2. **Playwright Browsers** - Installed automatically during setup

## Installation

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd ai-shopping-copilot

# Install dependencies
npm install
```

### 2. Install Playwright Browsers

Playwright requires browser binaries for automation:

```bash
# Install all browsers (Chromium, Firefox, WebKit)
npx playwright install

# Or install only Chromium (recommended for this project)
npx playwright install chromium
```

### 3. Configure Environment

Create a `.env` file in the project root:

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` with your Auchan.pt credentials:

```bash
# REQUIRED - Auchan.pt Credentials
AUCHAN_EMAIL=your-email@example.com
AUCHAN_PASSWORD=your-password

# OPTIONAL - Browser Settings
BROWSER_HEADLESS=true       # Set to false for visual debugging
BROWSER_SLOW_MO=0           # Slow down actions (ms) for debugging

# OPTIONAL - Session Settings
SESSION_STORAGE_DIR=./sessions

# OPTIONAL - Logging
LOG_LEVEL=info              # debug, info, warn, error
LOG_OUTPUT_DIR=./logs
```

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AUCHAN_EMAIL` | Your Auchan.pt account email | `user@example.com` |
| `AUCHAN_PASSWORD` | Your Auchan.pt account password | `secretpassword` |

### Browser Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BROWSER_HEADLESS` | Run browser without UI | `true` |
| `BROWSER_SLOW_MO` | Delay between actions (ms) | `0` |
| `BROWSER_VIEWPORT_WIDTH` | Browser window width | `1280` |
| `BROWSER_VIEWPORT_HEIGHT` | Browser window height | `720` |

### Auchan Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `AUCHAN_BASE_URL` | Auchan website URL | `https://www.auchan.pt` |
| `AUCHAN_TIMEOUT_NAVIGATION` | Page load timeout (ms) | `30000` |
| `AUCHAN_TIMEOUT_ELEMENT` | Element wait timeout (ms) | `10000` |

### Session & Logging

| Variable | Description | Default |
|----------|-------------|---------|
| `SESSION_STORAGE_DIR` | Session file storage | `./sessions` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `LOG_OUTPUT_DIR` | Log file directory | `./logs` |

## Configuration File

The default configuration is in `config/default.json`:

```json
{
  "auchan": {
    "baseUrl": "https://www.auchan.pt",
    "timeouts": {
      "navigation": 30000,
      "element": 10000
    }
  },
  "browser": {
    "headless": true,
    "slowMo": 0,
    "viewport": {
      "width": 1280,
      "height": 720
    }
  },
  "logging": {
    "level": "info",
    "outputDir": "./logs"
  }
}
```

Environment variables override these defaults.

## Running the Coordinator

### Basic Usage

```bash
# Build the project
npm run build

# Run the demo coordinator
npm run demo
```

### Development Mode

```bash
# Watch mode - rebuilds on file changes
npm run dev

# Interactive browser session (non-headless)
npm run dev:browser
```

### Programmatic Usage

```typescript
import { Coordinator, createCoordinator } from 'ai-shopping-copilot';
import { chromium } from 'playwright';

async function runSession() {
  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Create coordinator with configuration
  const coordinator = createCoordinator({
    maxOrdersToLoad: 3,
    mergeStrategy: 'latest',
    enableSubstitution: true,
    enableStockPruning: true,
    enableSlotScouting: true,
    sessionTimeout: 300000, // 5 minutes
    maxRetries: 2,
  });

  // Create agent context
  const context = {
    page,
    logger: console,
    sessionId: `session-${Date.now()}`,
  };

  // Run the session
  const result = await coordinator.run(
    context,
    process.env.AUCHAN_EMAIL!,
    'household-001'
  );

  if (result.success && result.data) {
    console.log('Review Pack ready:', result.data.reviewPack);
  }

  await browser.close();
}
```

## Browser Automation Setup

### Session Persistence

Sessions are stored in `./sessions/auchan-session.json` by default. This allows:
- Reusing login sessions (avoiding repeated logins)
- 24-hour session validity
- Automatic session restoration

### Debug Mode

For troubleshooting automation issues:

```bash
# Environment variables for debug mode
BROWSER_HEADLESS=false
BROWSER_SLOW_MO=100
LOG_LEVEL=debug
```

Or via code:

```typescript
const browser = await chromium.launch({
  headless: false,
  slowMo: 100,
  devtools: true,
});
```

### Screenshot Capture

Screenshots are automatically captured at key steps and stored in the `screenshots/` directory:
- `login-page-{timestamp}.png` - Before login
- `login-success-{timestamp}.png` - After successful login
- Various automation step screenshots

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Watch mode compilation |
| `npm run dev:browser` | Interactive browser session |
| `npm run demo` | Run the demo coordinator |
| `npm run test` | Run unit tests (watch mode) |
| `npm run test:run` | Run unit tests once |
| `npm run test:e2e` | Run E2E Playwright tests |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix linting issues |
| `npm run typecheck` | TypeScript type checking |
| `npm run check` | Run all checks (typecheck + lint + test) |

## Verification

### Check Installation

```bash
# Run all checks
npm run check

# Expected output: All tests pass, no lint errors, no type errors
```

### Test Login

```bash
# Run the demo script
npm run demo

# Or run login test specifically
npm run test:e2e -- --grep "login"
```

### Verify Configuration

```typescript
import { loadConfig, hasCredentials } from 'ai-shopping-copilot';

// Load and validate config
const config = loadConfig();
console.log('Config loaded:', config);

// Check credentials
if (hasCredentials()) {
  console.log('Credentials configured');
} else {
  console.log('Missing AUCHAN_EMAIL or AUCHAN_PASSWORD');
}
```

## Common Setup Issues

### Node.js Version

```bash
# Error: Engine "node" is incompatible
# Solution: Update Node.js to v20+
nvm install 20
nvm use 20
```

### Playwright Browsers

```bash
# Error: Executable doesn't exist at /path/to/chromium
# Solution: Install browsers
npx playwright install
```

### Missing Credentials

```bash
# Error: Missing required environment variable: AUCHAN_EMAIL
# Solution: Create .env file with credentials
cp .env.example .env
# Edit .env with your credentials
```

### Session Directory

```bash
# Error: ENOENT: no such file or directory, './sessions/...'
# Solution: Create directories
mkdir -p sessions logs screenshots
```

## Next Steps

After setup:
1. Run `npm run demo` to test the basic flow
2. Review the [Architecture Overview](./architecture-overview.md) to understand the system
3. Check [Troubleshooting Guide](./troubleshooting.md) if issues occur
