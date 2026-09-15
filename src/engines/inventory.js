/**
 * Inventory & Stock Allocation Engine
 * Manages multi-location stock levels, reservations (with TTLs), deductions, releases, and backorder rules.
 */

export class InventoryEngine {
  constructor() {
    // sku -> Map<locationId, { onHand, reserved, safetyStock, allowBackorder }>
    this.stock = new Map();
    // reservationId -> { id, sku, locationId, quantity, expiresAt }
    this.reservations = new Map();
  }

  /**
   * Set or update inventory for a specific SKU and location
   */
  setStock(sku, { onHand = 0, locationId = 'default', safetyStock = 0, allowBackorder = false } = {}) {
    if (!this.stock.has(sku)) {
      this.stock.set(sku, new Map());
    }

    const locationMap = this.stock.get(sku);
    const existing = locationMap.get(locationId) || { onHand: 0, reserved: 0, safetyStock: 0, allowBackorder: false };

    locationMap.set(locationId, {
      ...existing,
      onHand: Math.max(0, onHand),
      safetyStock,
      allowBackorder
    });

    return this.getStock(sku, locationId);
  }

  /**
   * Get stock summary for a SKU (optionally by location or aggregated across all locations)
   */
  getStock(sku, locationId = null) {
    const locMap = this.stock.get(sku);
    if (!locMap) {
      return { onHand: 0, reserved: 0, available: 0, allowBackorder: false };
    }

    if (locationId) {
      const entry = locMap.get(locationId) || { onHand: 0, reserved: 0, safetyStock: 0, allowBackorder: false };
      const available = Math.max(0, entry.onHand - entry.reserved - entry.safetyStock);
      return {
        sku,
        locationId,
        onHand: entry.onHand,
        reserved: entry.reserved,
        available: entry.allowBackorder ? Infinity : available,
        allowBackorder: entry.allowBackorder
      };
    }

    // Aggregated across all locations
    let totalOnHand = 0;
    let totalReserved = 0;
    let totalSafety = 0;
    let anyBackorder = false;

    for (const entry of locMap.values()) {
      totalOnHand += entry.onHand;
      totalReserved += entry.reserved;
      totalSafety += entry.safetyStock;
      if (entry.allowBackorder) anyBackorder = true;
    }

    const available = Math.max(0, totalOnHand - totalReserved - totalSafety);
    return {
      sku,
      onHand: totalOnHand,
      reserved: totalReserved,
      available: anyBackorder ? Infinity : available,
      allowBackorder: anyBackorder
    };
  }

  /**
   * Reserve stock during checkout to prevent race conditions / overselling
   * @param {string} sku
   * @param {number} quantity
   * @param {Object} [options]
   * @param {string} [options.locationId]
   * @param {number} [options.ttlSeconds=900] 15 minutes default
   */
  reserve(sku, quantity, { locationId = null, ttlSeconds = 900 } = {}) {
    this.cleanExpiredReservations();

    const locMap = this.stock.get(sku);
    if (!locMap) {
      throw new Error(`InventoryEngine: No stock records found for SKU "${sku}"`);
    }

    // Determine target location
    let targetLocationId = locationId;
    if (!targetLocationId || !locMap.has(targetLocationId)) {
      // Auto-locate warehouse that has sufficient stock
      for (const [locId, entry] of locMap.entries()) {
        const available = Math.max(0, entry.onHand - entry.reserved - entry.safetyStock);
        if (entry.allowBackorder || available >= quantity) {
          targetLocationId = locId;
          break;
        }
      }
      if (!targetLocationId) {
        // Fallback to first location for error reporting
        targetLocationId = Array.from(locMap.keys())[0] || 'default';
      }
    }

    const current = this.getStock(sku, targetLocationId);
    if (!current.allowBackorder && current.available < quantity) {
      throw new Error(`InventoryEngine: Insufficient stock for SKU "${sku}". Available: ${current.available}, Requested: ${quantity}`);
    }

    const entry = locMap.get(targetLocationId);
    entry.reserved += quantity;

    const reservationId = 'res_' + Math.random().toString(36).substr(2, 9);
    const reservation = {
      id: reservationId,
      sku,
      locationId: targetLocationId,
      quantity,
      expiresAt: Date.now() + ttlSeconds * 1000
    };

    this.reservations.set(reservationId, reservation);
    return reservation;
  }

  /**
   * Release a temporary reservation (e.g. cart cleared or payment failed)
   */
  releaseReservation(reservationId) {
    const res = this.reservations.get(reservationId);
    if (!res) return false;

    const locMap = this.stock.get(res.sku);
    if (locMap && locMap.has(res.locationId)) {
      const entry = locMap.get(res.locationId);
      entry.reserved = Math.max(0, entry.reserved - res.quantity);
    }

    this.reservations.delete(reservationId);
    return true;
  }

  /**
   * Confirm deduction when payment is completed
   */
  confirmDeduction(reservationId) {
    const res = this.reservations.get(reservationId);
    if (!res) {
      throw new Error(`InventoryEngine: Reservation "${reservationId}" not found or expired`);
    }

    const locMap = this.stock.get(res.sku);
    if (locMap && locMap.has(res.locationId)) {
      const entry = locMap.get(res.locationId);
      entry.onHand = Math.max(0, entry.onHand - res.quantity);
      entry.reserved = Math.max(0, entry.reserved - res.quantity);
    }

    this.reservations.delete(reservationId);
    return { sku: res.sku, deducted: res.quantity };
  }

  /**
   * Automatically garbage-collect expired reservations
   */
  cleanExpiredReservations() {
    const now = Date.now();
    for (const [id, res] of this.reservations.entries()) {
      if (res.expiresAt <= now) {
        this.releaseReservation(id);
      }
    }
  }
}
