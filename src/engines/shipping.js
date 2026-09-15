/**
 * Shipping & Fulfillment Engine
 * Handles volumetric weight calculations, zone-based rate matrices,
 * multi-carrier routing, split shipments across multiple fulfillment centers.
 */

export class ShippingEngine {
  constructor({ volumetricDivisor = 5000 } = {}) {
    this.volumetricDivisor = volumetricDivisor;
    // Map<carrierId, CarrierConfig>
    this.carriers = new Map();
    // Map<zoneId, Set<destinationCodes>>
    this.zones = new Map();
  }

  /**
   * Register a shipping service/carrier
   * @param {Object} carrier
   * @param {string} carrier.id e.g. 'JNE_REG', 'SICEPAT_BEST'
   * @param {string} carrier.name
   * @param {number} carrier.baseRate
   * @param {number} carrier.ratePerKg
   * @param {number} [carrier.minDays]
   * @param {number} [carrier.maxDays]
   * @param {number} [carrier.freeShippingMinSpend]
   */
  registerCarrier(carrier) {
    if (!carrier.id || !carrier.name) {
      throw new Error('ShippingEngine: Carrier id and name are required');
    }
    this.carriers.set(carrier.id, {
      baseRate: 0,
      ratePerKg: 0,
      minDays: 1,
      maxDays: 3,
      freeShippingMinSpend: null,
      ...carrier
    });
  }

  /**
   * Calculate chargeable weight (max of actual weight vs volumetric weight)
   * @param {Array<Object>} items Array of { weightGrams, dimensions: { l, w, h } (cm), quantity }
   */
  calculateWeight(items) {
    let totalActualGrams = 0;
    let totalVolumetricGrams = 0;

    for (const item of items) {
      const qty = item.quantity || 1;
      const actualItemWeight = (item.weightGrams || 500) * qty;
      totalActualGrams += actualItemWeight;

      if (item.dimensions) {
        const { l = 10, w = 10, h = 10 } = item.dimensions;
        // Volumetric weight in kg = (l * w * h) / divisor
        const volKg = ((l * w * h) / this.volumetricDivisor) * qty;
        totalVolumetricGrams += volKg * 1000;
      } else {
        totalVolumetricGrams += actualItemWeight;
      }
    }

    const chargeableGrams = Math.max(totalActualGrams, totalVolumetricGrams);
    const billableKg = Math.ceil(chargeableGrams / 1000) || 1;

    return {
      actualWeightKg: totalActualGrams / 1000,
      volumetricWeightKg: totalVolumetricGrams / 1000,
      billableKg
    };
  }

  /**
   * Get available shipping options & quotes for a cart
   */
  getQuotes({ items, subtotal, destination, isFreeShippingPromo = false }) {
    const { billableKg } = this.calculateWeight(items);
    const options = [];

    for (const carrier of this.carriers.values()) {
      let cost = carrier.baseRate + carrier.ratePerKg * Math.max(0, billableKg - 1);

      // Check free shipping rules
      const qualifiesFree = isFreeShippingPromo ||
        (carrier.freeShippingMinSpend !== null && subtotal >= carrier.freeShippingMinSpend);

      if (qualifiesFree) {
        cost = 0;
      }

      options.push({
        carrierId: carrier.id,
        name: carrier.name,
        estimatedDays: `${carrier.minDays}-${carrier.maxDays} hari`,
        billableKg,
        cost: Math.round(cost),
        isFree: cost === 0
      });
    }

    return options.sort((a, b) => a.cost - b.cost);
  }

  /**
   * Plan split shipments when items need to fulfill from multiple warehouses
   */
  planSplitShipments(itemsWithWarehouse) {
    const groups = new Map();

    for (const item of itemsWithWarehouse) {
      const wh = item.warehouseId || 'WH-MAIN';
      if (!groups.has(wh)) groups.set(wh, []);
      groups.get(wh).push(item);
    }

    const packages = [];
    for (const [warehouseId, pkgItems] of groups.entries()) {
      const weightInfo = this.calculateWeight(pkgItems);
      packages.push({
        packageId: `PKG-${warehouseId}-${Date.now().toString(36)}`,
        warehouseId,
        items: pkgItems,
        weightInfo
      });
    }

    return packages;
  }
}
