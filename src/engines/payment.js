/**
 * Payment & Transaction Engine
 * Manages payment methods, transaction ledger, multi-tender split payments,
 * gateway fee calculation, authorizations, captures, voids, and refunds.
 */

export const TransactionStatus = {
  INITIATED: 'INITIATED',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  VOIDED: 'VOIDED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED'
};

export class PaymentEngine {
  constructor() {
    this.methods = new Map(); // methodId -> methodConfig
    this.transactions = new Map(); // transactionId -> Transaction
  }

  /**
   * Register supported payment method
   * @param {Object} method
   * @param {string} method.id e.g. 'QRIS', 'CREDIT_CARD', 'VIRTUAL_ACCOUNT'
   * @param {string} method.name
   * @param {number} [method.fixedFee=0]
   * @param {number} [method.percentFee=0]
   */
  registerMethod(method) {
    this.methods.set(method.id, {
      fixedFee: 0,
      percentFee: 0,
      minAmount: 0,
      maxAmount: Infinity,
      ...method
    });
  }

  /**
   * Calculate transaction fee for a given method and amount
   */
  calculateFee(methodId, amount) {
    const method = this.methods.get(methodId);
    if (!method) return 0;
    const fee = method.fixedFee + (amount * (method.percentFee / 100));
    return Math.round(fee);
  }

  /**
   * Initialize a new transaction
   */
  createTransaction({ orderId, amount, methodId, currency = 'IDR', metadata = {} }) {
    const method = this.methods.get(methodId);
    if (!method) {
      throw new Error(`PaymentEngine: Payment method "${methodId}" is not registered`);
    }

    if (amount < method.minAmount || amount > method.maxAmount) {
      throw new Error(`PaymentEngine: Amount ${amount} is out of bounds for method "${methodId}"`);
    }

    const fee = this.calculateFee(methodId, amount);
    const transactionId = 'txn_' + Math.random().toString(36).substr(2, 10);

    const transaction = {
      id: transactionId,
      orderId,
      amount,
      fee,
      netAmount: amount - fee,
      currency,
      methodId,
      status: TransactionStatus.INITIATED,
      metadata,
      history: [
        { status: TransactionStatus.INITIATED, timestamp: new Date().toISOString() }
      ],
      createdAt: new Date().toISOString()
    };

    this.transactions.set(transactionId, transaction);
    return transaction;
  }

  /**
   * Authorize a transaction
   */
  authorize(transactionId) {
    const txn = this.getTransaction(transactionId);
    if (txn.status !== TransactionStatus.INITIATED) {
      throw new Error(`PaymentEngine: Cannot authorize transaction in state ${txn.status}`);
    }

    txn.status = TransactionStatus.AUTHORIZED;
    txn.history.push({ status: TransactionStatus.AUTHORIZED, timestamp: new Date().toISOString() });
    return txn;
  }

  /**
   * Capture authorized or initiated transaction
   */
  capture(transactionId) {
    const txn = this.getTransaction(transactionId);
    if (txn.status !== TransactionStatus.INITIATED && txn.status !== TransactionStatus.AUTHORIZED) {
      throw new Error(`PaymentEngine: Cannot capture transaction in state ${txn.status}`);
    }

    txn.status = TransactionStatus.CAPTURED;
    txn.capturedAt = new Date().toISOString();
    txn.history.push({ status: TransactionStatus.CAPTURED, timestamp: txn.capturedAt });
    return txn;
  }

  /**
   * Process refund (full or partial)
   */
  refund(transactionId, { refundAmount = null, reason = '' } = {}) {
    const txn = this.getTransaction(transactionId);
    if (txn.status !== TransactionStatus.CAPTURED && txn.status !== TransactionStatus.PARTIALLY_REFUNDED) {
      throw new Error(`PaymentEngine: Cannot refund transaction in state ${txn.status}`);
    }

    const amountToRefund = refundAmount === null ? txn.amount : refundAmount;
    const totalRefundedSoFar = txn.refundedAmount || 0;

    if (totalRefundedSoFar + amountToRefund > txn.amount) {
      throw new Error(`PaymentEngine: Refund amount exceeds transaction captured amount`);
    }

    txn.refundedAmount = totalRefundedSoFar + amountToRefund;
    txn.status = txn.refundedAmount === txn.amount
      ? TransactionStatus.REFUNDED
      : TransactionStatus.PARTIALLY_REFUNDED;

    txn.history.push({
      status: txn.status,
      refunded: amountToRefund,
      reason,
      timestamp: new Date().toISOString()
    });

    return txn;
  }

  getTransaction(transactionId) {
    const txn = this.transactions.get(transactionId);
    if (!txn) throw new Error(`PaymentEngine: Transaction "${transactionId}" not found`);
    return txn;
  }
}
