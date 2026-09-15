/**
 * Pricing & Tax Engine
 * Handles precise financial rounding, currency conversions, volume tier pricing,
 * customer group price lists, and inclusive/exclusive tax calculations.
 */

export class PricingEngine {
  constructor({ defaultCurrency = 'IDR', precision = 0, defaultTaxRate = 0.11 } = {}) {
    this.defaultCurrency = defaultCurrency;
    this.precision = precision;
    this.defaultTaxRate = defaultTaxRate;

    // Currency exchange rates relative to base currency
    this.rates = new Map([[defaultCurrency, 1.0]]);

    // Tier pricing: sku -> Array<{ minQty, price }>
    this.volumeTiers = new Map();

    // Customer group pricing: customerGroup -> Map<sku, price>
    this.groupPricing = new Map();

    // Tax rules: categoryId -> taxRate
    this.taxRules = new Map();
  }

  setExchangeRate(currency, rate) {
    this.rates.set(currency.toUpperCase(), Number(rate));
  }

  setVolumeTiers(sku, tiers) {
    // sort ascending by minQty
    const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
    this.volumeTiers.set(sku, sorted);
  }

  setCustomerGroupPrice(group, sku, price) {
    if (!this.groupPricing.has(group)) {
      this.groupPricing.set(group, new Map());
    }
    this.groupPricing.get(group).set(sku, price);
  }

  setTaxRule(categoryId, rate) {
    this.taxRules.set(categoryId, rate);
  }

  /**
   * Round to designated currency decimal places to avoid floating point drift
   */
  round(amount, precision = this.precision) {
    const factor = Math.pow(10, precision);
    return Math.round((amount + Number.EPSILON) * factor) / factor;
  }

  /**
   * Resolve unit price for an item considering quantity and customer tier
   */
  resolveUnitPrice({ sku, basePrice, quantity = 1, customerGroup = null }) {
    let finalPrice = basePrice;

    // 1. Check customer group specific pricing
    if (customerGroup && this.groupPricing.has(customerGroup)) {
      const groupMap = this.groupPricing.get(customerGroup);
      if (groupMap.has(sku)) {
        finalPrice = groupMap.get(sku);
      }
    }

    // 2. Check volume tier pricing
    if (this.volumeTiers.has(sku)) {
      const tiers = this.volumeTiers.get(sku);
      for (const tier of tiers) {
        if (quantity >= tier.minQty) {
          finalPrice = tier.price;
        }
      }
    }

    return this.round(finalPrice);
  }

  /**
   * Calculate line item tax
   * @param {Object} params
   * @param {number} params.lineTotal
   * @param {string} [params.categoryId]
   * @param {boolean} [params.isTaxInclusive=false]
   */
  calculateTax({ lineTotal, categoryId = null, isTaxInclusive = false }) {
    const rate = categoryId && this.taxRules.has(categoryId)
      ? this.taxRules.get(categoryId)
      : this.defaultTaxRate;

    if (rate <= 0) {
      return { netAmount: lineTotal, taxAmount: 0, grossAmount: lineTotal, rate: 0 };
    }

    if (isTaxInclusive) {
      // sticker price includes tax: Net = Total / (1 + rate)
      const netAmount = this.round(lineTotal / (1 + rate));
      const taxAmount = this.round(lineTotal - netAmount);
      return {
        netAmount,
        taxAmount,
        grossAmount: lineTotal,
        rate,
        isTaxInclusive: true
      };
    } else {
      // tax added on top: Gross = Total + (Total * rate)
      const taxAmount = this.round(lineTotal * rate);
      const grossAmount = this.round(lineTotal + taxAmount);
      return {
        netAmount: lineTotal,
        taxAmount,
        grossAmount,
        rate,
        isTaxInclusive: false
      };
    }
  }

  /**
   * Convert amount from one currency to another
   */
  convertCurrency(amount, fromCurrency, toCurrency) {
    const fromRate = this.rates.get(fromCurrency.toUpperCase());
    const toRate = this.rates.get(toCurrency.toUpperCase());

    if (!fromRate || !toRate) {
      throw new Error(`PricingEngine: Exchange rate not found for ${fromCurrency} -> ${toCurrency}`);
    }

    const baseAmount = amount / fromRate;
    const targetAmount = baseAmount * toRate;
    return this.round(targetAmount);
  }
}
