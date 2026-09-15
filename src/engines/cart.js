/**
 * Cart Engine
 * The central coordination pipeline for item lines, real-time recalculation,
 * promotions, tax breakdown, shipping charges, and checkout initiation.
 */

export class CartEngine {
  constructor({
    currency = 'IDR',
    pricingEngine,
    inventoryEngine,
    promotionEngine,
    shippingEngine
  } = {}) {
    this.currency = currency;
    this.pricingEngine = pricingEngine;
    this.inventoryEngine = inventoryEngine;
    this.promotionEngine = promotionEngine;
    this.shippingEngine = shippingEngine;

    // Cart state
    this.items = new Map(); // sku -> CartItem
    this.promoCodes = new Set();
    this.selectedShipping = null; // { carrierId, cost, name }
    this.customerGroup = null;
    this.loyaltyDiscount = 0;
  }

  /**
   * Add or increase item quantity in cart
   */
  addItem({
    sku,
    title,
    unitPrice,
    quantity = 1,
    categoryId = null,
    weightGrams = 500,
    dimensions = null,
    attributes = {}
  }) {
    if (quantity <= 0) return;

    // Optional inventory check
    if (this.inventoryEngine) {
      const stock = this.inventoryEngine.getStock(sku);
      const existingQty = this.items.has(sku) ? this.items.get(sku).quantity : 0;
      if (!stock.allowBackorder && stock.available < existingQty + quantity) {
        throw new Error(`CartEngine: Insufficient stock for ${sku}. Available: ${stock.available}`);
      }
    }

    if (this.items.has(sku)) {
      const item = this.items.get(sku);
      item.quantity += quantity;
      item.lineTotal = this.calculateItemTotal(item);
    } else {
      const item = {
        sku,
        title: title || sku,
        basePrice: unitPrice,
        unitPrice,
        quantity,
        categoryId,
        weightGrams,
        dimensions,
        attributes,
        lineTotal: 0
      };
      item.unitPrice = this.resolveItemPrice(item);
      item.lineTotal = this.calculateItemTotal(item);
      this.items.set(sku, item);
    }

    this.recalculateItemPrices();
    return this.getTotals();
  }

  /**
   * Update quantity directly
   */
  updateQuantity(sku, quantity) {
    if (!this.items.has(sku)) return null;

    if (quantity <= 0) {
      return this.removeItem(sku);
    }

    if (this.inventoryEngine) {
      const stock = this.inventoryEngine.getStock(sku);
      if (!stock.allowBackorder && stock.available < quantity) {
        throw new Error(`CartEngine: Requested quantity ${quantity} exceeds available stock (${stock.available})`);
      }
    }

    const item = this.items.get(sku);
    item.quantity = quantity;
    this.recalculateItemPrices();
    return this.getTotals();
  }

  /**
   * Remove item from cart
   */
  removeItem(sku) {
    this.items.delete(sku);
    this.recalculateItemPrices();
    return this.getTotals();
  }

  applyPromoCode(code) {
    if (code) {
      this.promoCodes.add(code.toUpperCase());
    }
    return this.getTotals();
  }

  removePromoCode(code) {
    if (code) {
      this.promoCodes.delete(code.toUpperCase());
    }
    return this.getTotals();
  }

  setShippingMethod(carrierQuote) {
    this.selectedShipping = carrierQuote ? { ...carrierQuote } : null;
    return this.getTotals();
  }

  setCustomerGroup(group) {
    this.customerGroup = group;
    this.recalculateItemPrices();
    return this.getTotals();
  }

  setLoyaltyDiscount(amount) {
    this.loyaltyDiscount = Math.max(0, amount);
    return this.getTotals();
  }

  resolveItemPrice(item) {
    if (!this.pricingEngine) return item.basePrice;
    return this.pricingEngine.resolveUnitPrice({
      sku: item.sku,
      basePrice: item.basePrice,
      quantity: item.quantity,
      customerGroup: this.customerGroup
    });
  }

  calculateItemTotal(item) {
    return item.unitPrice * item.quantity;
  }

  recalculateItemPrices() {
    for (const item of this.items.values()) {
      item.unitPrice = this.resolveItemPrice(item);
      item.lineTotal = this.calculateItemTotal(item);
    }
  }

  /**
   * Calculate complete, transparent financial breakdown
   */
  getTotals() {
    const itemList = Array.from(this.items.values());
    const subtotal = itemList.reduce((sum, item) => sum + item.lineTotal, 0);

    // 1. Evaluate Promotions & Discounts
    let promoResult = { appliedPromotions: [], totalDiscount: 0, freeShippingGranted: false };
    if (this.promotionEngine) {
      promoResult = this.promotionEngine.evaluate({
        items: itemList,
        subtotal,
        promoCodes: Array.from(this.promoCodes)
      });
    }

    const discountTotal = promoResult.totalDiscount + this.loyaltyDiscount;
    const discountedSubtotal = Math.max(0, subtotal - discountTotal);

    // 2. Taxes
    let taxTotal = 0;
    if (this.pricingEngine) {
      // Calculate tax on discounted subtotal
      const taxResult = this.pricingEngine.calculateTax({
        lineTotal: discountedSubtotal,
        isTaxInclusive: false
      });
      taxTotal = taxResult.taxAmount;
    }

    // 3. Shipping
    let shippingCost = 0;
    if (this.selectedShipping) {
      shippingCost = promoResult.freeShippingGranted ? 0 : this.selectedShipping.cost;
    }

    // 4. Grand Total
    const grandTotal = Math.max(0, discountedSubtotal + taxTotal + shippingCost);

    return {
      currency: this.currency,
      items: itemList,
      itemCount: itemList.reduce((count, it) => count + it.quantity, 0),
      subtotal,
      discountTotal,
      loyaltyDiscount: this.loyaltyDiscount,
      appliedPromotions: promoResult.appliedPromotions,
      taxTotal,
      shippingCost,
      selectedShipping: this.selectedShipping,
      grandTotal
    };
  }

  clear() {
    this.items.clear();
    this.promoCodes.clear();
    this.selectedShipping = null;
    this.loyaltyDiscount = 0;
  }
}
