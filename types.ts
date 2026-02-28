
export type OrderStatus = 'Confirmed' | 'Pending' | 'Cancelled' | 'Returned' | 'In Transit' | 'Delivered' | 'Out for Delivery';

export interface Order {
  id: string;
  storeId: string;
  storeName?: string;
  customerName: string;
  addressHouse?: string;
  city?: string;
  province?: string;
  zipcode?: string;
  country: string;
  productTitle: string;
  sku: string;
  qty: number;
  revenue: number;
  orderStatus: OrderStatus; // Renamed from status
  shippingStatus: string;
  deliveredDate?: string;
  marketer: string;
  csPic: string;
  center: string;
  courier: string;
  paidCod: number;
  payoutDate: string;
  fulfillmentCost?: number;
  shippingFee?: number; // Renamed from shippingCost
  taxCollected?: number;
  discountGiven?: number;
  notes?: string;
  returnReason?: string;
  returnDate?: string;
  trackingNumber?: string;
  trackingHistory?: any[];
}

export interface Product {
  id: string;
  storeId?: string;
  name: string;
  sku: string;
  description?: string;
  category?: string;
  unitCost?: number;
  sellingPrice?: number;
  stockLevel?: number; // Mapped from backend inventory
  reorderPoint?: number;
  fulfillmentCenterId?: string;
  fulfillmentCenter?: { name: string }; // Relation
  primaryImageUrl?: string;
  imagesUrls?: string;
  returnRate?: number; // Calculated
  globalRate?: number; // Calculated
  status: 'Active' | 'Inactive' | 'Archived';
}

export interface Customer {
  // ... (unchanged)
}

export type PurchaseStatus = 'Received' | 'Pending' | 'Ordered' | 'Draft' | 'Partially Received';

export interface PurchaseItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  qty: number;
  purchasePrice: number;
  discount: number;
  taxPercent: number;
  taxAmount: number;
  unitCost: number;
  totalCost: number;
  // Mapped from backend
  purchase_price?: number;
  purchaseTaxAmount?: number; // Renamed
  purchaseDiscountAmount?: number; // Renamed
}

export interface Purchase {
  id: string;
  supplierName: string;
  supplierId?: string; // Add source fields for editing
  fulfillmentCenterId?: string;
  warehouseId?: string;
  orderDate: string; // Map from backend 'orderDate'
  purchaseOrderNumber: string; // Map from backend
  purchaseTaxAmount?: number; // Renamed
  purchaseDiscountAmount?: number;
  purchaseShippingCost?: number; // Renamed
  notes?: string;
  reference: string;
  date: string;
  purchaseStatus: PurchaseStatus; // Renamed from status
  total: number;
  paid: number;
  due: number;
  items?: PurchaseItem[];
}

export type FulfillmentStatus = 'Processing' | 'Packed' | 'Shipped' | 'Delivered' | 'Returned';

export interface FulfillmentRecord {
  id: string;
  orderId: string;
  customerName: string;
  warehouse: string;
  skuCount: number;
  shippingMethod: string;
  status: FulfillmentStatus;
  trackingNumber: string;
  fulfillmentCost: number;
  createdDate: string;
}

export interface FulfillmentCenter {
  id: string;
  name: string;
  country: string;
  pic: string;
  note: string;
  status: 'Active' | 'Inactive';
}

export interface Supplier {
  id: string;
  name: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  country: string;
  paymentTerms: string;
  totalOrders: number;
  outstandingAmount: number;
  status: 'Active' | 'Inactive';
  taxId?: string;
  address?: string;
  bankDetails?: string;
  notes?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  fulfillmentCenterId: string;
  location?: string;
}

export interface InventoryLevel {
  id: string;
  productId: string;
  warehouseId: string;
  currentQuantity: number;
  reservedQuantity: number;
  product?: Product;
}

export interface InventoryTransaction {
  id: string;
  type: 'purchase_in' | 'order_out' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'return_restock';
  quantity: number;
  productId: string;
  warehouseId: string;
  referenceId?: string;
  createdAt: string;
}

export interface DashboardMetrics {
  totalInventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalProducts: number;
}
