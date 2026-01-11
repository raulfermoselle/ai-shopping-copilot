/**
 * Selector Registry Types
 *
 * Type definitions for the page discovery and selector registry system.
 */

/**
 * Master registry index tracking all pages and their active versions
 */
export interface SelectorRegistryIndex {
  /** Schema version for migrations */
  schemaVersion: '1.0.0';

  /** Last global validation timestamp */
  lastValidated: string;

  /** Registered pages */
  pages: Record<string, PageRegistryEntry>;
}

/**
 * Entry in the registry index for a single page
 */
export interface PageRegistryEntry {
  /** Human-readable name */
  name: string;

  /** URL pattern (regex) to identify this page */
  urlPattern: string;

  /** Current active version */
  activeVersion: number;

  /** Available versions */
  versions: number[];

  /** Last validation result */
  lastValidation: {
    timestamp: string;
    status: 'valid' | 'degraded' | 'invalid';
    failedSelectors: string[];
  };
}

/**
 * Selector definitions for a specific page version
 */
export interface PageSelectorDefinition {
  /** Page identifier (e.g., "login", "cart") */
  pageId: string;

  /** Version number */
  version: number;

  /** When this version was created */
  createdAt: string;

  /** Who/what created this version */
  createdBy: string;

  /** Optional notes about this version */
  notes?: string;

  /** URL pattern to identify this page */
  urlPattern: string;

  /** Prerequisites to reach this page */
  prerequisites?: {
    requiredPages?: string[];
    requiresAuth: boolean;
  };

  /** Selector definitions */
  selectors: Record<string, SelectorDefinition>;
}

/**
 * Individual selector with fallbacks and metadata
 */
export interface SelectorDefinition {
  /** Human-readable description */
  description: string;

  /** Element type */
  elementType:
    | 'button'
    | 'input'
    | 'link'
    | 'container'
    | 'text'
    | 'image'
    | 'form'
    | 'list'
    | 'item';

  /** Primary selector (most stable) */
  primary: string;

  /** Fallback selectors in priority order */
  fallbacks: string[];

  /** Selector strategy used */
  strategy:
    | 'data-testid'
    | 'aria'
    | 'role'
    | 'css-class'
    | 'css-id'
    | 'xpath'
    | 'text-content';

  /** Stability score (0-100) */
  stabilityScore: number;

  /** When last validated */
  lastValidated?: string;

  /** Validation status */
  validationStatus?: 'valid' | 'degraded' | 'invalid';

  /** Behavior notes */
  behaviorNotes?: string;
}

/**
 * Selector candidate from discovery
 */
export interface SelectorCandidate {
  /** The selector string */
  selector: string;

  /** Strategy type */
  strategy: SelectorDefinition['strategy'];

  /** Stability score */
  stabilityScore: number;

  /** Whether unique on page */
  isUnique: boolean;

  /** Number of matches */
  matchCount: number;

  /** Score explanation */
  scoreReason: string;
}

/**
 * Target to discover on a page
 */
export interface DiscoveryTarget {
  /** Unique key for this selector */
  key: string;

  /** Description of what we're looking for */
  description: string;

  /** Expected element type */
  elementType: SelectorDefinition['elementType'];

  /** Hints to help find the element */
  hints?: {
    textContent?: string;
    labelText?: string;
    attributes?: Record<string, string>;
    classPatterns?: string[];
    region?: 'header' | 'footer' | 'main' | 'sidebar' | 'modal';
  };
}

/**
 * Result from page discovery
 */
export interface DiscoveryResult {
  /** Page ID */
  pageId: string;

  /** Page name */
  pageName: string;

  /** URL analyzed */
  url: string;

  /** Timestamp */
  timestamp: string;

  /** Snapshot paths */
  snapshots?: {
    html: string;
    screenshot: string;
  };

  /** Discoveries by target key */
  discoveries: Record<
    string,
    {
      target: DiscoveryTarget;
      candidates: SelectorCandidate[];
      confident: boolean;
      recommended?: SelectorCandidate;
    }
  >;

  /** Discovery status */
  status: 'complete' | 'partial' | 'failed';

  /** Elements not found */
  notFound: string[];

  /** Warnings */
  warnings: string[];
}

/**
 * Validation report for a page
 */
export interface ValidationReport {
  /** Page ID */
  pageId: string;

  /** Version validated */
  version?: number;

  /** Timestamp */
  timestamp: string;

  /** Overall status */
  status: 'valid' | 'degraded' | 'invalid' | 'error';

  /** Error message if status is error */
  error?: string;

  /** Individual selector results */
  results: SelectorValidationResult[];

  /** Summary counts */
  summary?: {
    total: number;
    valid: number;
    degraded: number;
    invalid: number;
  };
}

/**
 * Validation result for a single selector
 */
export interface SelectorValidationResult {
  /** Selector key */
  key: string;

  /** Status */
  status: 'valid' | 'degraded' | 'invalid';

  /** Which selector matched */
  matchedSelector?: string;

  /** How it matched (primary or fallback index) */
  matchedUsing?: string;

  /** Warning if degraded */
  warning?: string;

  /** Error if invalid */
  error?: string;
}
