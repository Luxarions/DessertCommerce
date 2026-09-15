/**
 * Order Lifecycle State Machine (FSM) Engine
 * Manages order creation, snapshot immutability, valid transition guards,
 * fulfillment status, cancellations, and order audit trail.
 */

export const OrderStatus = {
  DRAFT: 'DRAFT',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED'
};

// Allowed transitions definition
const ALLOWED_TRANSITIONS = {
  [OrderStatus.DRAFT]: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.REFUNDED, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.COMPLETED, OrderStatus.REFUNDED],
  [OrderStatus.COMPLETED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: []
};

export class OrderEngine {
  constructor() {
    this.orders = new Map(); // orderId -> Order
  }

  /**
   * Create a new immutable order from a checkout payload
   */
  createOrder({
    customerId,
    items,
    pricingSummary,
    shippingInfo,
    paymentMethodId,
    metadata = {}
  }) {
    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

    const order = {
      id: orderId,
      customerId,
      status: OrderStatus.PENDING_PAYMENT,
      items: items.map((it) => ({ ...it })), // deep clone snapshot
      pricing: { ...pricingSummary },
      shipping: { ...shippingInfo, trackingNumber: null },
      paymentMethodId,
      metadata,
      auditLog: [
        {
          from: null,
          to: OrderStatus.PENDING_PAYMENT,
          timestamp: new Date().toISOString(),
          actor: 'SYSTEM',
          note: 'Order placed'
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.orders.set(orderId, order);
    return order;
  }

  /**
   * Transition order to a new state with safety guard validation
   */
  transition(orderId, nextStatus, { actor = 'SYSTEM', note = '', extraData = {} } = {}) {
    const order = this.getOrder(orderId);
    const current = order.status;

    const allowed = ALLOWED_TRANSITIONS[current] || [];
    if (!allowed.includes(nextStatus)) {
      throw new Error(`OrderEngine: Invalid state transition from "${current}" to "${nextStatus}" for Order ${orderId}`);
    }

    order.status = nextStatus;
    order.updatedAt = new Date().toISOString();

    if (extraData.trackingNumber && nextStatus === OrderStatus.SHIPPED) {
      order.shipping.trackingNumber = extraData.trackingNumber;
    }

    order.auditLog.push({
      from: current,
      to: nextStatus,
      timestamp: order.updatedAt,
      actor,
      note,
      ...extraData
    });

    return order;
  }

  getOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`OrderEngine: Order "${orderId}" not found`);
    return order;
  }

  listByCustomer(customerId) {
    return Array.from(this.orders.values()).filter((ord) => ord.customerId === customerId);
  }
}
