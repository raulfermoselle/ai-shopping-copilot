/**
 * Order History Extractor Tests
 *
 * Tests the extractOrderHistory function against realistic DOM structures.
 * Uses JSDOM for DOM simulation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractOrderHistory, isOnOrderHistoryPage, getOrderCount } from '../order-history.js';

describe('Order History Extractor', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window & typeof globalThis;

  /**
   * Create a mock order card element with realistic Auchan.pt structure
   */
  function createOrderCard(options: {
    orderId: string;
    date: string; // ISO format
    day: string;
    month: string;
    productCount: number;
    price: string; // Portuguese format "123,45 €"
  }): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card auc-card auc-orders__order-card';

    card.innerHTML = `
      <div class="auc-orders__order-section">
        <div class="row no-gutters">
          <div class="col-12 col-md-7 d-inline-flex align-items-center">
            <div class="auc-orders__order-date text-center">
              <span class="auc-orders--date auc-run--day" data-date="${options.date}" data-locale="pt_PT">${options.day}</span>
              <span class="auc-orders--month auc-run--monthd" data-date="${options.date}" data-locale="pt_PT">${options.month}</span>
            </div>
            <div class="h5 auc-orders__order-number">
              <span>Encomenda</span>
              <span>${options.orderId}</span>
            </div>
          </div>
          <div class="col-12 col-md-5 d-inline-flex align-items-center justify-content-between">
            <div class="auc-orders__order-products">
              ${options.productCount}
              Produtos
            </div>
            <div class="auc-orders__order-price auc-orders--price">
              ${options.price}
            </div>
          </div>
        </div>
      </div>
    `;

    return card;
  }

  beforeEach(() => {
    // Create a fresh JSDOM instance for each test
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://www.auchan.pt/pt/historico-encomendas',
    });
    document = dom.window.document;
    window = dom.window as unknown as Window & typeof globalThis;

    // Set up global document and window for the extractor
    global.document = document;
    global.window = window;
  });

  afterEach(() => {
    // Clean up
    dom.window.close();
  });

  describe('extractOrderHistory', () => {
    it('should extract a single order correctly', () => {
      const orderCard = createOrderCard({
        orderId: '002915480',
        date: '2026-01-02T14:00:30+00:00',
        day: '02',
        month: 'jan',
        productCount: 38,
        price: '162,51 €',
      });

      document.body.appendChild(orderCard);

      const result = extractOrderHistory();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        orderId: '002915480',
        date: '2026-01-02T14:00:30+00:00',
        timestamp: new Date('2026-01-02T14:00:30+00:00').getTime(),
        total: 162.51,
        itemCount: 38,
        status: 'delivered',
        deliveryDate: undefined,
      });
    });

    it('should extract multiple orders', () => {
      const orders = [
        {
          orderId: '002915480',
          date: '2026-01-02T14:00:30+00:00',
          day: '02',
          month: 'jan',
          productCount: 38,
          price: '162,51 €',
        },
        {
          orderId: '002853812',
          date: '2025-12-06T09:13:56+00:00',
          day: '06',
          month: 'dez',
          productCount: 25,
          price: '134,20 €',
        },
        {
          orderId: '002800123',
          date: '2025-11-15T10:00:00+00:00',
          day: '15',
          month: 'nov',
          productCount: 42,
          price: '201,99 €',
        },
      ];

      orders.forEach(order => {
        document.body.appendChild(createOrderCard(order));
      });

      const result = extractOrderHistory();

      expect(result).toHaveLength(3);
      expect(result[0].orderId).toBe('002915480');
      expect(result[1].orderId).toBe('002853812');
      expect(result[2].orderId).toBe('002800123');
    });

    it('should respect the limit parameter', () => {
      const orders = [
        {
          orderId: '001',
          date: '2026-01-02T14:00:30+00:00',
          day: '02',
          month: 'jan',
          productCount: 10,
          price: '100,00 €',
        },
        {
          orderId: '002',
          date: '2026-01-01T14:00:30+00:00',
          day: '01',
          month: 'jan',
          productCount: 20,
          price: '200,00 €',
        },
        {
          orderId: '003',
          date: '2025-12-31T14:00:30+00:00',
          day: '31',
          month: 'dez',
          productCount: 30,
          price: '300,00 €',
        },
      ];

      orders.forEach(order => {
        document.body.appendChild(createOrderCard(order));
      });

      const result = extractOrderHistory({ limit: 2 });

      expect(result).toHaveLength(2);
      expect(result[0].orderId).toBe('001');
      expect(result[1].orderId).toBe('002');
    });

    it('should parse Portuguese price format correctly', () => {
      const testCases = [
        { price: '162,51 €', expected: 162.51 },
        { price: '€ 162,51', expected: 162.51 },
        { price: '1.234,56 €', expected: 1234.56 }, // Thousands separator
        { price: '12,00 €', expected: 12.00 },
        { price: '9,99 €', expected: 9.99 },
      ];

      testCases.forEach(({ price, expected }, index) => {
        const orderCard = createOrderCard({
          orderId: `00${index}`,
          date: '2026-01-02T14:00:30+00:00',
          day: '02',
          month: 'jan',
          productCount: 10,
          price,
        });

        document.body.innerHTML = '';
        document.body.appendChild(orderCard);

        const result = extractOrderHistory();
        expect(result[0].total).toBe(expected);
      });
    });

    it('should handle missing data-date attribute gracefully', () => {
      const card = document.createElement('div');
      card.className = 'card auc-card auc-orders__order-card';

      // Create card WITHOUT data-date attribute (fallback to day/month text)
      card.innerHTML = `
        <div class="auc-orders__order-section">
          <div class="row no-gutters">
            <div class="col-12 col-md-7 d-inline-flex align-items-center">
              <div class="auc-orders__order-date text-center">
                <span class="auc-run--day">15</span>
                <span class="auc-run--monthd">dez</span>
              </div>
              <div class="h5 auc-orders__order-number">
                <span>Encomenda</span>
                <span>002800000</span>
              </div>
            </div>
            <div class="col-12 col-md-5 d-inline-flex align-items-center justify-content-between">
              <div class="auc-orders__order-products">10 Produtos</div>
              <div class="auc-orders__order-price auc-orders--price">100,00 €</div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(card);

      const result = extractOrderHistory();

      expect(result).toHaveLength(1);
      expect(result[0].orderId).toBe('002800000');
      // Should construct date from day/month (current year assumed)
      const currentYear = new Date().getFullYear();
      expect(result[0].date).toBe(`${currentYear}-12-15T00:00:00Z`);
    });

    it('should return empty array when no orders found', () => {
      document.body.innerHTML = '<div class="empty-state">No orders found</div>';

      const result = extractOrderHistory();

      expect(result).toEqual([]);
    });

    it('should skip malformed order cards gracefully', () => {
      const goodCard = createOrderCard({
        orderId: '002915480',
        date: '2026-01-02T14:00:30+00:00',
        day: '02',
        month: 'jan',
        productCount: 38,
        price: '162,51 €',
      });

      // Create a malformed card (missing order ID)
      const badCard = document.createElement('div');
      badCard.className = 'card auc-card auc-orders__order-card';
      badCard.innerHTML = '<div>Malformed order</div>';

      document.body.appendChild(goodCard);
      document.body.appendChild(badCard);

      const result = extractOrderHistory();

      // Should only extract the good card (malformed card is silently skipped)
      expect(result).toHaveLength(1);
      expect(result[0].orderId).toBe('002915480');
    });

    it('should handle product count in various formats', () => {
      const testCases = [
        { text: '38 Produtos', expected: 38 },
        { text: '5 Produtos', expected: 5 },
        { text: '1 Produto', expected: 1 },
        { text: '100 Produtos', expected: 100 },
      ];

      testCases.forEach(({ text, expected }, index) => {
        const card = createOrderCard({
          orderId: `00${index}`,
          date: '2026-01-02T14:00:30+00:00',
          day: '02',
          month: 'jan',
          productCount: 0, // Will be overridden
          price: '100,00 €',
        });

        // Replace product count text
        const productCountEl = card.querySelector('.auc-orders__order-products');
        if (productCountEl) {
          productCountEl.textContent = text;
        }

        document.body.innerHTML = '';
        document.body.appendChild(card);

        const result = extractOrderHistory();
        expect(result[0].itemCount).toBe(expected);
      });
    });
  });

  describe('isOnOrderHistoryPage', () => {
    it('should return true when on order history page', () => {
      // Already on order history page from beforeEach
      expect(isOnOrderHistoryPage()).toBe(true);
    });

    it('should return false when on other pages', () => {
      // Create a new JSDOM with different URL
      const newDom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://www.auchan.pt/pt/carrinho-compras',
      });
      global.window = newDom.window as unknown as Window & typeof globalThis;

      expect(isOnOrderHistoryPage()).toBe(false);

      // Restore original window
      global.window = window;
      newDom.window.close();
    });
  });

  describe('getOrderCount', () => {
    it('should return the correct count of order cards', () => {
      const orders = [
        {
          orderId: '001',
          date: '2026-01-02T14:00:30+00:00',
          day: '02',
          month: 'jan',
          productCount: 10,
          price: '100,00 €',
        },
        {
          orderId: '002',
          date: '2026-01-01T14:00:30+00:00',
          day: '01',
          month: 'jan',
          productCount: 20,
          price: '200,00 €',
        },
      ];

      orders.forEach(order => {
        document.body.appendChild(createOrderCard(order));
      });

      expect(getOrderCount()).toBe(2);
    });

    it('should return 0 when no orders found', () => {
      expect(getOrderCount()).toBe(0);
    });
  });
});
