/**
 * Customer & Loyalty Engine
 * Manages customer tiers, loyalty points accrual & redemption, and store credit wallet balances.
 */

export const CustomerTier = {
  BRONZE: 'BRONZE',
  SILVER: 'SILVER',
  GOLD: 'GOLD',
  PLATINUM: 'PLATINUM'
};

export class CustomerEngine {
  constructor() {
    this.customers = new Map(); // id -> Customer
    this.pointsConversionRate = 100; // 1 point = 100 currency units (e.g. Rp 100)
    this.pointsEarnRate = 0.01; // earn 1% of total spend in points
  }

  registerCustomer({ id, name, email, tier = CustomerTier.BRONZE, initialWalletBalance = 0, initialPoints = 0 }) {
    const customer = {
      id,
      name,
      email,
      tier,
      walletBalance: Math.max(0, initialWalletBalance),
      pointsBalance: Math.max(0, initialPoints),
      totalSpent: 0,
      createdAt: new Date().toISOString()
    };
    this.customers.set(id, customer);
    return customer;
  }

  getCustomer(id) {
    return this.customers.get(id) || null;
  }

  /**
   * Add earned loyalty points based on completed order amount
   */
  earnPoints(customerId, orderAmount) {
    const customer = this.getCustomer(customerId);
    if (!customer) return 0;

    const multiplier = customer.tier === CustomerTier.PLATINUM ? 2 : customer.tier === CustomerTier.GOLD ? 1.5 : 1;
    const earned = Math.floor((orderAmount * this.pointsEarnRate * multiplier) / this.pointsConversionRate);

    customer.pointsBalance += earned;
    customer.totalSpent += orderAmount;
    this.evaluateTier(customer);

    return earned;
  }

  /**
   * Redeem loyalty points for a discount
   */
  redeemPoints(customerId, pointsToRedeem, maxAllowableDiscount) {
    const customer = this.getCustomer(customerId);
    if (!customer) throw new Error('Customer not found');

    const availablePoints = customer.pointsBalance;
    const requestedPoints = Math.min(pointsToRedeem, availablePoints);
    const monetaryValue = requestedPoints * this.pointsConversionRate;

    const actualDiscount = Math.min(monetaryValue, maxAllowableDiscount);
    const actualPointsUsed = Math.ceil(actualDiscount / this.pointsConversionRate);

    customer.pointsBalance -= actualPointsUsed;
    return {
      pointsUsed: actualPointsUsed,
      discountAmount: actualDiscount,
      remainingPoints: customer.pointsBalance
    };
  }

  /**
   * Deduct store credit from wallet
   */
  deductWallet(customerId, amount) {
    const customer = this.getCustomer(customerId);
    if (!customer) throw new Error('Customer not found');
    if (customer.walletBalance < amount) {
      throw new Error(`Insufficient wallet balance. Available: ${customer.walletBalance}, Requested: ${amount}`);
    }

    customer.walletBalance -= amount;
    return customer.walletBalance;
  }

  /**
   * Top-up or refund to store credit wallet
   */
  creditWallet(customerId, amount) {
    const customer = this.getCustomer(customerId);
    if (!customer) throw new Error('Customer not found');
    customer.walletBalance += amount;
    return customer.walletBalance;
  }

  evaluateTier(customer) {
    if (customer.totalSpent >= 50000000) customer.tier = CustomerTier.PLATINUM;
    else if (customer.totalSpent >= 20000000) customer.tier = CustomerTier.GOLD;
    else if (customer.totalSpent >= 5000000) customer.tier = CustomerTier.SILVER;
    else customer.tier = CustomerTier.BRONZE;
  }
}
