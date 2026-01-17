/**
 * Cart Diff Logic Tests
 *
 * Comprehensive tests for calculateCartDiff and related functions.
 * Tests cover normal operations, edge cases, and boundary conditions.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCartDiff,
  hasChanges,
  requiresUserAttention,
  getItemsNeedingSubstitution,
  calculateAvailabilityPercentage,
  generateDiffSummary,
} from '../diff.js';
import type { CartItem, ItemAvailability } from '../../../types/cart.js';
import type { OrderItem } from '../../../types/orders.js';

// Test Data Factories
function createOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: 'prod-001',
    name: 'Test Product',
    unitPrice: 2.99,
    quantity: 1,
    lineTotal: 2.99,
    ...overrides,
  };
}

function createCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'cart-001',
    productId: 'prod-001',
    name: 'Test Product',
    price: 2.99,
    quantity: 1,
    availability: 'available' as ItemAvailability,
    ...overrides,
  };
}

describe('calculateCartDiff', () => {
  describe('edge cases', () => {
    it('should handle empty original order and empty cart', () => {
      const diff = calculateCartDiff([], []);

      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.quantityChanged).toHaveLength(0);
      expect(diff.priceChanged).toHaveLength(0);
      expect(diff.nowUnavailable).toHaveLength(0);
      expect(diff.summary.priceDifference).toBe(0);
    });

    it('should handle empty original order with cart items', () => {
      const cartItems = [
        createCartItem({ productId: 'prod-001' }),
        createCartItem({ productId: 'prod-002', id: 'cart-002' }),
      ];

      const diff = calculateCartDiff([], cartItems);

      expect(diff.added).toHaveLength(2);
      expect(diff.removed).toHaveLength(0);
      expect(diff.summary.addedCount).toBe(2);
    });

    it('should handle empty cart with original order items', () => {
      const orderItems = [
        createOrderItem({ productId: 'prod-001' }),
        createOrderItem({ productId: 'prod-002' }),
      ];

      const diff = calculateCartDiff(orderItems, []);

      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(2);
      expect(diff.summary.removedCount).toBe(2);
    });
  });

  describe('added items', () => {
    it('should identify items added to cart that were not in original order', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001' })];
      const cartItems = [
        createCartItem({ productId: 'prod-001' }),
        createCartItem({ productId: 'prod-new', id: 'cart-new', name: 'New Item' }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].productId).toBe('prod-new');
      expect(diff.summary.addedCount).toBe(1);
    });

    it('should include all properties of added cart items', () => {
      const cartItems = [
        createCartItem({
          productId: 'new-prod',
          name: 'New Product',
          price: 5.99,
          quantity: 2,
          category: 'dairy',
          brand: 'TestBrand',
        }),
      ];

      const diff = calculateCartDiff([], cartItems);

      expect(diff.added[0]).toMatchObject({
        productId: 'new-prod',
        name: 'New Product',
        price: 5.99,
        quantity: 2,
        category: 'dairy',
        brand: 'TestBrand',
      });
    });
  });

  describe('removed items', () => {
    it('should identify items removed from cart that were in original order', () => {
      const orderItems = [
        createOrderItem({ productId: 'prod-001' }),
        createOrderItem({ productId: 'prod-removed', name: 'Removed Item' }),
      ];
      const cartItems = [createCartItem({ productId: 'prod-001' })];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0].productId).toBe('prod-removed');
      expect(diff.removed[0].name).toBe('Removed Item');
      expect(diff.summary.removedCount).toBe(1);
    });

    it('should convert removed OrderItem to CartItem format', () => {
      const orderItems = [
        createOrderItem({
          productId: 'removed-prod',
          name: 'To Remove',
          unitPrice: 3.99,
          quantity: 2,
          imageUrl: 'http://example.com/img.jpg',
          category: 'bakery',
        }),
      ];

      const diff = calculateCartDiff(orderItems, []);

      expect(diff.removed[0]).toMatchObject({
        productId: 'removed-prod',
        name: 'To Remove',
        price: 3.99,
        quantity: 2,
        imageUrl: 'http://example.com/img.jpg',
        category: 'bakery',
        fromOriginalOrder: true,
        originalQuantity: 2,
      });
    });
  });

  describe('quantity changes', () => {
    it('should identify items with changed quantities', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001', quantity: 2 })];
      const cartItems = [createCartItem({ productId: 'prod-001', quantity: 5 })];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.quantityChanged).toHaveLength(1);
      expect(diff.quantityChanged[0].originalQuantity).toBe(2);
      expect(diff.quantityChanged[0].newQuantity).toBe(5);
      expect(diff.summary.quantityChangedCount).toBe(1);
    });

    it('should not flag items with same quantity', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001', quantity: 3 })];
      const cartItems = [createCartItem({ productId: 'prod-001', quantity: 3 })];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.quantityChanged).toHaveLength(0);
    });

    it('should handle quantity decrease', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001', quantity: 10 })];
      const cartItems = [createCartItem({ productId: 'prod-001', quantity: 2 })];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.quantityChanged[0].originalQuantity).toBe(10);
      expect(diff.quantityChanged[0].newQuantity).toBe(2);
    });
  });

  describe('price changes', () => {
    it('should identify items with changed prices', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001', unitPrice: 2.99 })];
      const cartItems = [createCartItem({ productId: 'prod-001', price: 3.49 })];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.priceChanged).toHaveLength(1);
      expect(diff.priceChanged[0].originalPrice).toBe(2.99);
      expect(diff.priceChanged[0].newPrice).toBe(3.49);
      expect(diff.summary.priceChangedCount).toBe(1);
    });

    it('should not flag items with same price', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001', unitPrice: 2.99 })];
      const cartItems = [createCartItem({ productId: 'prod-001', price: 2.99 })];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.priceChanged).toHaveLength(0);
    });

    it('should handle very small price differences (within tolerance)', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001', unitPrice: 2.99 })];
      const cartItems = [createCartItem({ productId: 'prod-001', price: 2.9905 })];

      const diff = calculateCartDiff(orderItems, cartItems);

      // Sub-cent difference should not be flagged
      expect(diff.priceChanged).toHaveLength(0);
    });

    it('should handle price of 0 (free items)', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001', unitPrice: 0 })];
      const cartItems = [createCartItem({ productId: 'prod-001', price: 0 })];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.priceChanged).toHaveLength(0);
    });

    it('should detect change from free to paid', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001', unitPrice: 0 })];
      const cartItems = [createCartItem({ productId: 'prod-001', price: 1.99 })];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.priceChanged).toHaveLength(1);
      expect(diff.priceChanged[0].originalPrice).toBe(0);
      expect(diff.priceChanged[0].newPrice).toBe(1.99);
    });
  });

  describe('unavailable items', () => {
    it('should identify items that are now out of stock', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001' })];
      const cartItems = [
        createCartItem({ productId: 'prod-001', availability: 'out-of-stock' }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.nowUnavailable).toHaveLength(1);
      expect(diff.nowUnavailable[0].productId).toBe('prod-001');
      expect(diff.summary.unavailableCount).toBe(1);
    });

    it('should identify items with quantity 0 as unavailable', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001' })];
      const cartItems = [
        createCartItem({ productId: 'prod-001', quantity: 0, availability: 'available' }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.nowUnavailable).toHaveLength(1);
    });

    it('should not flag available items', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001' })];
      const cartItems = [
        createCartItem({ productId: 'prod-001', availability: 'available' }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.nowUnavailable).toHaveLength(0);
    });

    it('should not flag low-stock items as unavailable', () => {
      const orderItems = [createOrderItem({ productId: 'prod-001' })];
      const cartItems = [
        createCartItem({ productId: 'prod-001', availability: 'low-stock' }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.nowUnavailable).toHaveLength(0);
    });
  });

  describe('price difference calculation', () => {
    it('should calculate positive price difference (cart costs more)', () => {
      const orderItems = [
        createOrderItem({ productId: 'prod-001', unitPrice: 2.00, quantity: 2, lineTotal: 4.00 }),
      ];
      const cartItems = [
        createCartItem({ productId: 'prod-001', price: 3.00, quantity: 2 }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.summary.priceDifference).toBe(2.00);
    });

    it('should calculate negative price difference (cart costs less)', () => {
      const orderItems = [
        createOrderItem({ productId: 'prod-001', unitPrice: 5.00, quantity: 1, lineTotal: 5.00 }),
      ];
      const cartItems = [
        createCartItem({ productId: 'prod-001', price: 3.00, quantity: 1 }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.summary.priceDifference).toBe(-2.00);
    });

    it('should account for added items in price difference', () => {
      const orderItems = [
        createOrderItem({ productId: 'prod-001', unitPrice: 2.00, quantity: 1, lineTotal: 2.00 }),
      ];
      const cartItems = [
        createCartItem({ productId: 'prod-001', price: 2.00, quantity: 1 }),
        createCartItem({ productId: 'prod-new', price: 5.00, quantity: 1 }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.summary.priceDifference).toBe(5.00);
    });

    it('should account for removed items in price difference', () => {
      const orderItems = [
        createOrderItem({ productId: 'prod-001', unitPrice: 2.00, quantity: 1, lineTotal: 2.00 }),
        createOrderItem({ productId: 'prod-002', unitPrice: 3.00, quantity: 1, lineTotal: 3.00 }),
      ];
      const cartItems = [
        createCartItem({ productId: 'prod-001', price: 2.00, quantity: 1 }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.summary.priceDifference).toBe(-3.00);
    });

    it('should round price difference to cents', () => {
      const orderItems = [
        createOrderItem({ productId: 'prod-001', unitPrice: 1.111, quantity: 3, lineTotal: 3.333 }),
      ];
      const cartItems = [
        createCartItem({ productId: 'prod-001', price: 1.222, quantity: 3 }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      // (1.222 * 3) - 3.333 = 3.666 - 3.333 = 0.333 -> 0.33
      expect(diff.summary.priceDifference).toBe(0.33);
    });
  });

  describe('complex scenarios', () => {
    it('should handle mixed changes (add, remove, quantity, price, unavailable)', () => {
      const orderItems = [
        createOrderItem({ productId: 'keep-same', unitPrice: 1.00, quantity: 1, lineTotal: 1.00 }),
        createOrderItem({ productId: 'change-qty', unitPrice: 2.00, quantity: 1, lineTotal: 2.00 }),
        createOrderItem({ productId: 'change-price', unitPrice: 3.00, quantity: 1, lineTotal: 3.00 }),
        createOrderItem({ productId: 'now-unavail', unitPrice: 4.00, quantity: 1, lineTotal: 4.00 }),
        createOrderItem({ productId: 'removed', unitPrice: 5.00, quantity: 1, lineTotal: 5.00 }),
      ];
      const cartItems = [
        createCartItem({ productId: 'keep-same', price: 1.00, quantity: 1 }),
        createCartItem({ productId: 'change-qty', price: 2.00, quantity: 3 }),
        createCartItem({ productId: 'change-price', price: 3.50, quantity: 1 }),
        createCartItem({ productId: 'now-unavail', price: 4.00, quantity: 1, availability: 'out-of-stock' }),
        createCartItem({ productId: 'added-new', price: 2.00, quantity: 1 }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.summary).toEqual({
        addedCount: 1,
        removedCount: 1,
        quantityChangedCount: 1,
        priceChangedCount: 1,
        unavailableCount: 1,
        priceDifference: expect.any(Number),
      });

      expect(diff.added[0].productId).toBe('added-new');
      expect(diff.removed[0].productId).toBe('removed');
      expect(diff.quantityChanged[0].item.productId).toBe('change-qty');
      expect(diff.priceChanged[0].item.productId).toBe('change-price');
      expect(diff.nowUnavailable[0].productId).toBe('now-unavail');
    });

    it('should handle item with both quantity and price change', () => {
      const orderItems = [
        createOrderItem({ productId: 'prod-001', unitPrice: 2.00, quantity: 2, lineTotal: 4.00 }),
      ];
      const cartItems = [
        createCartItem({ productId: 'prod-001', price: 2.50, quantity: 3 }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      expect(diff.quantityChanged).toHaveLength(1);
      expect(diff.priceChanged).toHaveLength(1);
      // Both arrays reference the same cart item
      expect(diff.quantityChanged[0].item.productId).toBe('prod-001');
      expect(diff.priceChanged[0].item.productId).toBe('prod-001');
    });

    it('should handle unavailable item with price change', () => {
      const orderItems = [
        createOrderItem({ productId: 'prod-001', unitPrice: 2.00, quantity: 1, lineTotal: 2.00 }),
      ];
      const cartItems = [
        createCartItem({
          productId: 'prod-001',
          price: 2.50,
          quantity: 1,
          availability: 'out-of-stock',
        }),
      ];

      const diff = calculateCartDiff(orderItems, cartItems);

      // Should appear in both nowUnavailable and priceChanged
      expect(diff.nowUnavailable).toHaveLength(1);
      expect(diff.priceChanged).toHaveLength(1);
    });
  });
});

describe('hasChanges', () => {
  it('should return false for empty diff', () => {
    const diff = calculateCartDiff([], []);
    expect(hasChanges(diff)).toBe(false);
  });

  it('should return true when items added', () => {
    const diff = calculateCartDiff([], [createCartItem()]);
    expect(hasChanges(diff)).toBe(true);
  });

  it('should return true when items removed', () => {
    const diff = calculateCartDiff([createOrderItem()], []);
    expect(hasChanges(diff)).toBe(true);
  });

  it('should return false when cart matches order exactly', () => {
    const orderItems = [createOrderItem({ productId: 'prod-001', unitPrice: 2.99, quantity: 1 })];
    const cartItems = [createCartItem({ productId: 'prod-001', price: 2.99, quantity: 1 })];
    const diff = calculateCartDiff(orderItems, cartItems);
    expect(hasChanges(diff)).toBe(false);
  });
});

describe('requiresUserAttention', () => {
  it('should return true when items are unavailable', () => {
    const orderItems = [createOrderItem({ productId: 'prod-001' })];
    const cartItems = [
      createCartItem({ productId: 'prod-001', availability: 'out-of-stock' }),
    ];
    const diff = calculateCartDiff(orderItems, cartItems);

    expect(requiresUserAttention(diff)).toBe(true);
  });

  it('should return true when items are removed', () => {
    const diff = calculateCartDiff([createOrderItem()], []);
    expect(requiresUserAttention(diff)).toBe(true);
  });

  it('should return true when price increase exceeds threshold', () => {
    const orderItems = [
      createOrderItem({ productId: 'prod-001', unitPrice: 10.00, quantity: 1, lineTotal: 10.00 }),
    ];
    const cartItems = [
      createCartItem({ productId: 'prod-001', price: 20.00, quantity: 1 }),
    ];
    const diff = calculateCartDiff(orderItems, cartItems);

    expect(requiresUserAttention(diff, 5.0)).toBe(true);
  });

  it('should return false when price increase is below threshold', () => {
    const orderItems = [
      createOrderItem({ productId: 'prod-001', unitPrice: 10.00, quantity: 1, lineTotal: 10.00 }),
    ];
    const cartItems = [
      createCartItem({ productId: 'prod-001', price: 12.00, quantity: 1 }),
    ];
    const diff = calculateCartDiff(orderItems, cartItems);

    expect(requiresUserAttention(diff, 5.0)).toBe(false);
  });

  it('should use custom threshold', () => {
    const orderItems = [
      createOrderItem({ productId: 'prod-001', unitPrice: 10.00, quantity: 1, lineTotal: 10.00 }),
    ];
    const cartItems = [
      createCartItem({ productId: 'prod-001', price: 12.00, quantity: 1 }),
    ];
    const diff = calculateCartDiff(orderItems, cartItems);

    expect(requiresUserAttention(diff, 1.0)).toBe(true);
    expect(requiresUserAttention(diff, 3.0)).toBe(false);
  });
});

describe('getItemsNeedingSubstitution', () => {
  it('should return unavailable items that were in original order', () => {
    const orderItems = [createOrderItem({ productId: 'prod-001' })];
    const cartItems = [
      createCartItem({
        productId: 'prod-001',
        availability: 'out-of-stock',
        fromOriginalOrder: true,
      }),
    ];
    const diff = calculateCartDiff(orderItems, cartItems);

    const needSub = getItemsNeedingSubstitution(diff);
    expect(needSub).toHaveLength(1);
    expect(needSub[0].productId).toBe('prod-001');
  });

  it('should exclude unavailable items not from original order', () => {
    const cartItems = [
      createCartItem({
        productId: 'prod-new',
        availability: 'out-of-stock',
        fromOriginalOrder: false,
      }),
    ];
    const diff = calculateCartDiff([], cartItems);

    // Item is added (not from original), so shouldn't need substitution
    const needSub = getItemsNeedingSubstitution(diff);
    expect(needSub).toHaveLength(0);
  });
});

describe('calculateAvailabilityPercentage', () => {
  it('should return 100 for empty original order', () => {
    const diff = calculateCartDiff([], []);
    expect(calculateAvailabilityPercentage([], diff)).toBe(100);
  });

  it('should return 100 when all items available', () => {
    const orderItems = [
      createOrderItem({ productId: 'prod-001' }),
      createOrderItem({ productId: 'prod-002' }),
    ];
    const cartItems = [
      createCartItem({ productId: 'prod-001', availability: 'available' }),
      createCartItem({ productId: 'prod-002', availability: 'available' }),
    ];
    const diff = calculateCartDiff(orderItems, cartItems);

    expect(calculateAvailabilityPercentage(orderItems, diff)).toBe(100);
  });

  it('should return 0 when all items unavailable', () => {
    const orderItems = [
      createOrderItem({ productId: 'prod-001' }),
      createOrderItem({ productId: 'prod-002' }),
    ];
    const cartItems = [
      createCartItem({ productId: 'prod-001', availability: 'out-of-stock', fromOriginalOrder: true }),
      createCartItem({ productId: 'prod-002', availability: 'out-of-stock', fromOriginalOrder: true }),
    ];
    const diff = calculateCartDiff(orderItems, cartItems);

    expect(calculateAvailabilityPercentage(orderItems, diff)).toBe(0);
  });

  it('should calculate correct percentage for partial availability', () => {
    const orderItems = [
      createOrderItem({ productId: 'prod-001' }),
      createOrderItem({ productId: 'prod-002' }),
      createOrderItem({ productId: 'prod-003' }),
      createOrderItem({ productId: 'prod-004' }),
    ];
    const cartItems = [
      createCartItem({ productId: 'prod-001', availability: 'available' }),
      createCartItem({ productId: 'prod-002', availability: 'out-of-stock', fromOriginalOrder: true }),
      createCartItem({ productId: 'prod-003', availability: 'available' }),
      createCartItem({ productId: 'prod-004', availability: 'available' }),
    ];
    const diff = calculateCartDiff(orderItems, cartItems);

    expect(calculateAvailabilityPercentage(orderItems, diff)).toBe(75);
  });
});

describe('generateDiffSummary', () => {
  it('should return "No changes detected" for empty diff', () => {
    const diff = calculateCartDiff([], []);
    expect(generateDiffSummary(diff)).toBe('No changes detected');
  });

  it('should list added items', () => {
    const diff = calculateCartDiff([], [createCartItem()]);
    expect(generateDiffSummary(diff)).toContain('1 item(s) added');
  });

  it('should list removed items', () => {
    const diff = calculateCartDiff([createOrderItem()], []);
    expect(generateDiffSummary(diff)).toContain('1 item(s) removed');
  });

  it('should include price difference', () => {
    const orderItems = [
      createOrderItem({ productId: 'prod-001', unitPrice: 10.00, quantity: 1, lineTotal: 10.00 }),
    ];
    const cartItems = [
      createCartItem({ productId: 'prod-001', price: 15.00, quantity: 1 }),
    ];
    const diff = calculateCartDiff(orderItems, cartItems);

    const summary = generateDiffSummary(diff);
    expect(summary).toContain('+5.00');
  });

  it('should show negative price difference', () => {
    const orderItems = [
      createOrderItem({ productId: 'prod-001', unitPrice: 15.00, quantity: 1, lineTotal: 15.00 }),
    ];
    const cartItems = [
      createCartItem({ productId: 'prod-001', price: 10.00, quantity: 1 }),
    ];
    const diff = calculateCartDiff(orderItems, cartItems);

    const summary = generateDiffSummary(diff);
    expect(summary).toContain('-5.00');
  });

  it('should combine multiple change types', () => {
    const orderItems = [
      createOrderItem({ productId: 'prod-001', unitPrice: 2.00, quantity: 1, lineTotal: 2.00 }),
      createOrderItem({ productId: 'prod-removed', unitPrice: 3.00, quantity: 1, lineTotal: 3.00 }),
    ];
    const cartItems = [
      createCartItem({ productId: 'prod-001', price: 2.50, quantity: 2 }),
      createCartItem({ productId: 'prod-new', price: 1.00, quantity: 1 }),
    ];
    const diff = calculateCartDiff(orderItems, cartItems);

    const summary = generateDiffSummary(diff);
    expect(summary).toContain('item(s) added');
    expect(summary).toContain('item(s) removed');
    expect(summary).toContain('quantity change');
    expect(summary).toContain('price change');
  });
});
