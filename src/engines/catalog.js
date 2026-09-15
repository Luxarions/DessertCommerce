/**
 * Catalog & Variant Engine
 * Handles products, categories, SKU resolution, variant option matrix, and attribute filtering.
 */

export class CatalogEngine {
  constructor() {
    this.products = new Map(); // id -> product
    this.categories = new Map(); // id -> category
    this.skuIndex = new Map(); // sku -> { productId, variantId }
  }

  /**
   * Register a new product
   * @param {Object} product
   * @param {string} product.id
   * @param {string} product.title
   * @param {string} [product.categoryId]
   * @param {number} product.basePrice
   * @param {Array<Object>} [product.variants]
   * @param {Array<Object>} [product.options] e.g. [{ name: 'Size', values: ['S', 'M', 'L'] }]
   * @param {Object} [product.attributes]
   */
  addProduct(product) {
    if (!product.id || !product.title) {
      throw new Error('CatalogEngine: Product id and title are required');
    }

    const normalizedProduct = {
      ...product,
      variants: product.variants || [
        {
          id: `${product.id}-default`,
          sku: product.sku || product.id,
          price: product.basePrice,
          attributes: {}
        }
      ],
      createdAt: product.createdAt || new Date().toISOString()
    };

    this.products.set(normalizedProduct.id, normalizedProduct);

    // Index SKUs
    for (const variant of normalizedProduct.variants) {
      if (variant.sku) {
        this.skuIndex.set(variant.sku, {
          productId: normalizedProduct.id,
          variantId: variant.id
        });
      }
    }

    return normalizedProduct;
  }

  /**
   * Get product by ID
   */
  getProduct(productId) {
    return this.products.get(productId) || null;
  }

  /**
   * Find product and variant by SKU
   */
  findBySku(sku) {
    const entry = this.skuIndex.get(sku);
    if (!entry) return null;

    const product = this.products.get(entry.productId);
    if (!product) return null;

    const variant = product.variants.find((v) => v.id === entry.variantId) || null;
    return { product, variant };
  }

  /**
   * Resolve specific variant based on selected options (e.g. { Color: 'Red', Size: 'XL' })
   */
  resolveVariant(productId, selectedOptions) {
    const product = this.products.get(productId);
    if (!product) return null;

    return product.variants.find((variant) => {
      return Object.entries(selectedOptions).every(
        ([key, val]) => variant.attributes && variant.attributes[key] === val
      );
    }) || null;
  }

  /**
   * Search / filter products
   */
  query({ categoryId, minPrice, maxPrice, search, inStockSkus } = {}) {
    let list = Array.from(this.products.values());

    if (categoryId) {
      list = list.filter((p) => p.categoryId === categoryId);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)));
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      list = list.filter((p) => {
        const prices = p.variants.map((v) => v.price ?? p.basePrice);
        const lowest = Math.min(...prices);
        if (minPrice !== undefined && lowest < minPrice) return false;
        if (maxPrice !== undefined && lowest > maxPrice) return false;
        return true;
      });
    }

    if (Array.isArray(inStockSkus)) {
      const stockSet = new Set(inStockSkus);
      list = list.filter((p) => p.variants.some((v) => stockSet.has(v.sku)));
    }

    return list;
  }
}
