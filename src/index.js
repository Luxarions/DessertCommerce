/**
 * Commerce Core - Modular Headless E-Commerce Logic Library
 * 
 * Engines included:
 * 1. Catalog & Variant Engine
 * 2. Inventory & Stock Allocation Engine
 * 3. Pricing & Tax Engine
 * 4. Discount & Promotion Engine (Coupons, BXGY, Tiers)
 * 5. Cart Engine
 * 6. Shipping & Fulfillment Engine
 * 7. Payment & Transaction Engine
 * 8. Order Lifecycle State Machine (FSM)
 * 9. Customer & Loyalty Points Engine
 */

export { CatalogEngine } from './engines/catalog.js';
export { InventoryEngine } from './engines/inventory.js';
export { PricingEngine } from './engines/pricing.js';
export { PromotionEngine, PromotionType } from './engines/promotion.js';
export { CartEngine } from './engines/cart.js';
export { ShippingEngine } from './engines/shipping.js';
export { PaymentEngine, TransactionStatus } from './engines/payment.js';
export { OrderEngine, OrderStatus } from './engines/order.js';
export { CustomerEngine, CustomerTier } from './engines/customer.js';

// Unified Commerce Hub Orchestrator
import { CatalogEngine } from './engines/catalog.js';
import { InventoryEngine } from './engines/inventory.js';
import { PricingEngine } from './engines/pricing.js';
import { PromotionEngine } from './engines/promotion.js';
import { CartEngine } from './engines/cart.js';
import { ShippingEngine } from './engines/shipping.js';
import { PaymentEngine } from './engines/payment.js';
import { OrderEngine } from './engines/order.js';
import { CustomerEngine } from './engines/customer.js';

export class CommerceCore {
  constructor(config = {}) {
    this.config = {
      defaultCurrency: 'IDR',
      currencyPrecision: 0, // e.g. 0 for IDR/JPY, 2 for USD/EUR
      defaultTaxRate: 0.11, // 11% PPN
      ...config
    };

    this.catalog = new CatalogEngine();
    this.inventory = new InventoryEngine();
    this.pricing = new PricingEngine({
      defaultCurrency: this.config.defaultCurrency,
      precision: this.config.currencyPrecision,
      defaultTaxRate: this.config.defaultTaxRate
    });
    this.promotions = new PromotionEngine();
    this.shipping = new ShippingEngine();
    this.payments = new PaymentEngine();
    this.orders = new OrderEngine();
    this.customers = new CustomerEngine();
  }

  /**
   * Create a new synchronized Cart instance wired to these core engines
   */
  createCart(options = {}) {
    return new CartEngine({
      currency: options.currency || this.config.defaultCurrency,
      pricingEngine: this.pricing,
      inventoryEngine: this.inventory,
      promotionEngine: this.promotions,
      shippingEngine: this.shipping
    });
  }
}

export default CommerceCore;
