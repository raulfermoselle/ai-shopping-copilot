/**
 * Cart Scanner Extractor Tests
 *
 * Tests for cart extraction functionality using JSDOM.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  extractCartItems,
  isOnCartPage,
  hasCartItems,
} from '../cart-scanner';

describe('Cart Scanner Extractor', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window & typeof globalThis;

  beforeEach(() => {
    // Create a fresh JSDOM instance for each test
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://www.auchan.pt/pt/carrinho-compras',
    });
    document = dom.window.document;
    window = dom.window as unknown as Window & typeof globalThis;

    // Set up global document and window for the extractor
    global.document = document;
    global.window = window;
  });

  describe('isOnCartPage', () => {
    it('should return true for cart page URL', () => {
      expect(isOnCartPage()).toBe(true);
    });

    it('should return false for non-cart URLs', () => {
      // Create a new JSDOM with different URL
      const newDom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://www.auchan.pt/pt/',
      });
      global.window = newDom.window as unknown as Window & typeof globalThis;

      expect(isOnCartPage()).toBe(false);

      // Restore original window
      global.window = window;
    });
  });

  describe('hasCartItems', () => {
    it('should return false for empty cart', () => {
      document.body.innerHTML = `
        <div class="auc-cart--empty">
          <h4 class="auc-cart--empty__title">Carrinho vazio de momento</h4>
        </div>
      `;
      expect(hasCartItems()).toBe(false);
    });

    it('should return true for cart with items', () => {
      document.body.innerHTML = `
        <div class="auc-cart__product-list">
          <div class="auc-cart__product-cards">
            <div data-pid="123">Product 1</div>
          </div>
        </div>
      `;
      expect(hasCartItems()).toBe(true);
    });

    it('should return false when no product cards exist', () => {
      document.body.innerHTML = `<div class="auc-cart__container"></div>`;
      expect(hasCartItems()).toBe(false);
    });
  });

  describe('extractCartItems', () => {
    describe('empty cart', () => {
      it('should extract empty cart correctly', () => {
        document.body.innerHTML = `
          <div class="auc-cart--empty">
            <h4 class="auc-cart--empty__title">Carrinho vazio de momento</h4>
          </div>
        `;

        const result = extractCartItems();

        expect(result.isEmpty).toBe(true);
        expect(result.items).toHaveLength(0);
        expect(result.summary.itemCount).toBe(0);
        expect(result.summary.total).toBe(0);
      });
    });

    describe('cart with available items', () => {
      it('should extract single item correctly', () => {
        document.body.innerHTML = `
          <div class="auc-cart__product-list">
            <div class="auc-cart__product-cards">
              <div>
                <button class="auc-cart__remove-product" data-pid="12345" data-uuid="uuid-1"></button>
                <a class="auc-cart__product-title" href="https://www.auchan.pt/pt/alimentacao/lacticinios/p/12345">
                  <div class="auc-cart__product-title">Mimosa Leite Magro 1L</div>
                </a>
                <input name="dwfrm_cart_quantity" value="2" />
                <div class="auc-cart--price">2,78 €</div>
                <div class="auc-measures--price-per-unit">1,39 €/L</div>
                <img class="auc-cart__product-image" src="/images/product.jpg" />
              </div>
            </div>
          </div>
          <div class="auc-header-cart-total">2,78 €</div>
        `;

        const result = extractCartItems();

        expect(result.isEmpty).toBe(false);
        expect(result.items).toHaveLength(1);

        const item = result.items[0];
        expect(item).toBeDefined();
        expect(item!.id).toBe('uuid-1');
        expect(item!.productId).toBe('12345');
        expect(item!.name).toBe('Mimosa Leite Magro 1L');
        expect(item!.quantity).toBe(2);
        expect(item!.price).toBe(1.39); // 2.78 / 2 = 1.39
        expect(item!.availability).toBe('available');
        expect(item!.pricePerUnit).toBe(1.39);
        expect(item!.unit).toBe('L');
        expect(item!.category).toBe('lacticinios');
        expect(item!.brand).toBe('Mimosa');
        expect(item!.imageUrl).toContain('product.jpg');

        expect(result.summary.itemCount).toBe(2); // 2 items of same product
        expect(result.summary.uniqueProducts).toBe(1);
        expect(result.summary.total).toBe(2.78);
        expect(result.summary.unavailableCount).toBe(0);
      });

      it('should extract multiple items correctly', () => {
        document.body.innerHTML = `
          <div class="auc-cart__product-list">
            <div class="auc-cart__product-cards">
              <div>
                <button class="auc-cart__remove-product" data-pid="12345" data-uuid="uuid-1"></button>
                <div class="auc-cart__product-title">Mimosa Leite Magro 1L</div>
                <a class="auc-cart__product-title" href="https://www.auchan.pt/pt/alimentacao/lacticinios/p/12345"></a>
                <input name="dwfrm_cart_quantity" value="1" />
                <div class="auc-cart--price">1,39 €</div>
              </div>
              <div>
                <button class="auc-cart__remove-product" data-pid="67890" data-uuid="uuid-2"></button>
                <div class="auc-cart__product-title">Pão de Forma</div>
                <a class="auc-cart__product-title" href="https://www.auchan.pt/pt/alimentacao/padaria/p/67890"></a>
                <input name="dwfrm_cart_quantity" value="3" />
                <div class="auc-cart--price">4,50 €</div>
              </div>
            </div>
          </div>
          <div class="auc-header-cart-total">5,89 €</div>
        `;

        const result = extractCartItems();

        expect(result.items).toHaveLength(2);
        expect(result.summary.itemCount).toBe(4); // 1 + 3
        expect(result.summary.uniqueProducts).toBe(2);
        expect(result.summary.total).toBe(5.89);
      });
    });

    describe('cart with unavailable items', () => {
      it('should detect out-of-stock items', () => {
        document.body.innerHTML = `
          <div class="auc-cart__product-list">
            <div class="auc-cart__product-cards">
              <div>
                <button class="auc-cart__remove-product" data-pid="12345" data-uuid="uuid-1"></button>
                <div class="auc-cart__product-title auc-unavailable-name">Unavailable Product</div>
                <a class="auc-cart__product-title" href="https://www.auchan.pt/pt/alimentacao/outros/p/12345"></a>
                <input name="dwfrm_cart_quantity" value="1" />
                <div class="auc-cart--price">5,99 €</div>
                <div class="auc-unavailable-text">Produto indisponível</div>
              </div>
              <div>
                <button class="auc-cart__remove-product" data-pid="67890" data-uuid="uuid-2"></button>
                <div class="auc-cart__product-title">Available Product</div>
                <a class="auc-cart__product-title" href="https://www.auchan.pt/pt/alimentacao/outros/p/67890"></a>
                <input name="dwfrm_cart_quantity" value="2" />
                <div class="auc-cart--price">3,50 €</div>
              </div>
            </div>
          </div>
          <div class="auc-header-cart-total">3,50 €</div>
        `;

        const result = extractCartItems();

        expect(result.items).toHaveLength(2);
        expect(result.items[0]!.availability).toBe('out-of-stock');
        expect(result.items[1]!.availability).toBe('available');
        expect(result.summary.unavailableCount).toBe(1);
        expect(result.summary.subtotal).toBe(3.50); // Only available items
      });

      it('should filter out-of-stock items when includeOutOfStock is false', () => {
        document.body.innerHTML = `
          <div class="auc-cart__product-list">
            <div class="auc-cart__product-cards">
              <div>
                <button class="auc-cart__remove-product" data-pid="12345" data-uuid="uuid-1"></button>
                <div class="auc-cart__product-title auc-unavailable-name">Unavailable Product</div>
                <a class="auc-cart__product-title" href="https://www.auchan.pt/pt/alimentacao/outros/p/12345"></a>
                <input name="dwfrm_cart_quantity" value="1" />
                <div class="auc-cart--price">5,99 €</div>
              </div>
            </div>
          </div>
        `;

        const result = extractCartItems({ includeOutOfStock: false });

        expect(result.items).toHaveLength(0);
      });
    });

    describe('price parsing', () => {
      it('should parse currency with commas correctly', () => {
        document.body.innerHTML = `
          <div class="auc-cart__product-list">
            <div class="auc-cart__product-cards">
              <div>
                <button class="auc-cart__remove-product" data-pid="12345"></button>
                <div class="auc-cart__product-title">Product</div>
                <input name="dwfrm_cart_quantity" value="1" />
                <div class="auc-cart--price">162,51 €</div>
              </div>
            </div>
          </div>
        `;

        const result = extractCartItems();
        expect(result.items[0]!.price).toBe(162.51);
      });

      it('should handle prices with spaces', () => {
        document.body.innerHTML = `
          <div class="auc-cart__product-list">
            <div class="auc-cart__product-cards">
              <div>
                <button class="auc-cart__remove-product" data-pid="12345"></button>
                <div class="auc-cart__product-title">Product</div>
                <input name="dwfrm_cart_quantity" value="1" />
                <div class="auc-cart--price">  1,39  €  </div>
              </div>
            </div>
          </div>
        `;

        const result = extractCartItems();
        expect(result.items[0]!.price).toBe(1.39);
      });
    });

    describe('unit extraction', () => {
      it('should extract unit from price per unit', () => {
        document.body.innerHTML = `
          <div class="auc-cart__product-list">
            <div class="auc-cart__product-cards">
              <div>
                <button class="auc-cart__remove-product" data-pid="12345"></button>
                <div class="auc-cart__product-title">Product</div>
                <input name="dwfrm_cart_quantity" value="1" />
                <div class="auc-cart--price">5,89 €</div>
                <div class="auc-measures--price-per-unit">5,89 €/Kg</div>
              </div>
            </div>
          </div>
        `;

        const result = extractCartItems();
        expect(result.items[0]!.unit).toBe('Kg');
        expect(result.items[0]!.pricePerUnit).toBe(5.89);
      });

      it('should handle different units', () => {
        document.body.innerHTML = `
          <div class="auc-cart__product-list">
            <div class="auc-cart__product-cards">
              <div>
                <button class="auc-cart__remove-product" data-pid="1"></button>
                <div class="auc-cart__product-title">Product 1</div>
                <input name="dwfrm_cart_quantity" value="1" />
                <div class="auc-cart--price">1,00 €</div>
                <div class="auc-measures--price-per-unit">2,99 €/L</div>
              </div>
              <div>
                <button class="auc-cart__remove-product" data-pid="2"></button>
                <div class="auc-cart__product-title">Product 2</div>
                <input name="dwfrm_cart_quantity" value="1" />
                <div class="auc-cart--price">1,00 €</div>
                <div class="auc-measures--price-per-unit">0,50 €/un</div>
              </div>
            </div>
          </div>
        `;

        const result = extractCartItems();
        expect(result.items[0]!.unit).toBe('L');
        expect(result.items[1]!.unit).toBe('un');
      });
    });

    describe('category extraction', () => {
      it('should extract category from product URL', () => {
        document.body.innerHTML = `
          <div class="auc-cart__product-list">
            <div class="auc-cart__product-cards">
              <div>
                <button class="auc-cart__remove-product" data-pid="12345"></button>
                <a class="auc-cart__product-title" href="https://www.auchan.pt/pt/alimentacao/lacticinios-e-ovos/p/12345">
                  <div class="auc-cart__product-title">Product</div>
                </a>
                <input name="dwfrm_cart_quantity" value="1" />
                <div class="auc-cart--price">1,00 €</div>
              </div>
            </div>
          </div>
        `;

        const result = extractCartItems();
        expect(result.items[0]!.category).toBe('lacticinios-e-ovos');
      });
    });

    describe('verbose logging', () => {
      it('should log to console when verbose is true', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        document.body.innerHTML = `
          <div class="auc-cart--empty"></div>
        `;

        extractCartItems({ verbose: true });

        expect(consoleSpy).toHaveBeenCalled();
        expect(consoleSpy.mock.calls[0][0]).toContain('[CartScanner]');

        consoleSpy.mockRestore();
      });

      it('should not log when verbose is false', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        document.body.innerHTML = `
          <div class="auc-cart--empty"></div>
        `;

        extractCartItems({ verbose: false });

        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });
    });
  });
});
