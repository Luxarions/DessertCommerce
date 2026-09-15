/**
 * Discount & Promotion Engine
 * Handles coupons, automated rules, Buy-X-Get-Y (BXGY), tiered cart discounts,
 * usage limits, date expirations, and promotion stacking policies.
 */

export const PromotionType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
  BUY_X_GET_Y: 'BUY_X_GET_Y',
  FREE_SHIPPING: 'FREE_SHIPPING'
};

export class PromotionEngine {
  constructor() {
    this.promotions = new Map(); // code/id -> promo definition
    this.usageCounter = new Map(); // id -> count
  }

  /**
   * Register a promotional rule or coupon
   */
  addPromotion(promo) {
    if (!promo.id) throw new Error('PromotionEngine: Promotion id is required');
    this.promotions.set(promo.id.toUpperCase(), {
      type: PromotionType.PERCENTAGE,
      value: 0,
      minSpend: 0,
      maxDiscount: null,
      targetSkus: null, // null means entire cart
      targetCategories: null,
      maxUsage: null,
      startDate: null,
      endDate: null,
      isStackable: false,
      bxgy: null, // { buySku, buyQty, getSku, getQty, discountPct: 100 }
      ...promo,
      id: promo.id.toUpperCase()
    });
  }

  /**
   * Evaluate applicability and calculate total discount for a cart
   * @param {Object} cartContext
   * @param {Array<Object>} cartContext.items Array of { sku, categoryId, unitPrice, quantity, lineTotal }
   * @param {number} cartContext.subtotal
   * @param {Array<string>} [cartContext.promoCodes]
   */
  evaluate({ items, subtotal, promoCodes = [] }) {
    const appliedPromotions = [];
    let totalDiscount = 0;
    let freeShippingGranted = false;
    const now = Date.now();

    // Check if there is any non-stackable promo requested
    const promoObjects = promoCodes
      .map((code) => this.promotions.get(code.toUpperCase()))
      .filter(Boolean);

    // If there's an exclusive (non-stackable) promo, only the first valid one takes effect
    let exclusiveApplied = false;

    for (const promo of promoObjects) {
      if (exclusiveApplied) break;

      // 1. Date validity check
      if (promo.startDate && now < new Date(promo.startDate).getTime()) continue;
      if (promo.endDate && now > new Date(promo.endDate).getTime()) continue;

      // 2. Usage limit check
      const currentUsage = this.usageCounter.get(promo.id) || 0;
      if (promo.maxUsage !== null && currentUsage >= promo.maxUsage) continue;

      // 3. Min spend check
      if (promo.minSpend && subtotal < promo.minSpend) continue;

      // 4. Calculate discount based on type
      let discountAmount = 0;

      if (promo.type === PromotionType.PERCENTAGE) {
        // Calculate eligible base
        let eligibleAmount = subtotal;
        if (promo.targetSkus || promo.targetCategories) {
          eligibleAmount = items.reduce((acc, item) => {
            const matchSku = !promo.targetSkus || promo.targetSkus.includes(item.sku);
            const matchCat = !promo.targetCategories || promo.targetCategories.includes(item.categoryId);
            return matchSku && matchCat ? acc + item.lineTotal : acc;
          }, 0);
        }

        discountAmount = eligibleAmount * (promo.value / 100);
        if (promo.maxDiscount && discountAmount > promo.maxDiscount) {
          discountAmount = promo.maxDiscount;
        }
      } else if (promo.type === PromotionType.FIXED_AMOUNT) {
        discountAmount = Math.min(promo.value, subtotal);
      } else if (promo.type === PromotionType.BUY_X_GET_Y && promo.bxgy) {
        const { buySku, buyQty, getSku, getQty, discountPct = 100 } = promo.bxgy;
        const buyItem = items.find((it) => it.sku === buySku);
        const getItem = items.find((it) => it.sku === getSku);

        if (buyItem && getItem && buyItem.quantity >= buyQty) {
          const setsQualified = Math.floor(buyItem.quantity / buyQty);
          const maxFreeCount = setsQualified * getQty;
          const actualDiscountCount = Math.min(getItem.quantity, maxFreeCount);
          discountAmount = actualDiscountCount * getItem.unitPrice * (discountPct / 100);
        }
      } else if (promo.type === PromotionType.FREE_SHIPPING) {
        freeShippingGranted = true;
      }

      if (discountAmount > 0 || freeShippingGranted) {
        appliedPromotions.push({
          id: promo.id,
          name: promo.name || promo.id,
          type: promo.type,
          discountAmount: Math.round(discountAmount),
          freeShipping: promo.type === PromotionType.FREE_SHIPPING
        });

        totalDiscount += Math.round(discountAmount);

        if (!promo.isStackable) {
          exclusiveApplied = true;
        }
      }
    }

    return {
      appliedPromotions,
      totalDiscount: Math.min(totalDiscount, subtotal),
      freeShippingGranted
    };
  }

  recordUsage(promoId) {
    const id = promoId.toUpperCase();
    const current = this.usageCounter.get(id) || 0;
    this.usageCounter.set(id, current + 1);
  }
}
