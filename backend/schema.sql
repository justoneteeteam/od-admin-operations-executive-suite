-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Wipe existing tables to ensure clean slate for the new complex schema
DROP TABLE IF EXISTS notification_templates CASCADE;
DROP TABLE IF EXISTS performance_metrics CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS google_sheets_config CASCADE;
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS blocked_users CASCADE;
DROP TABLE IF EXISTS blocked_customers CASCADE;
DROP TABLE IF EXISTS blocked_addresses CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS purchase_items CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS return_items CASCADE;
DROP TABLE IF EXISTS returns CASCADE;
DROP TABLE IF EXISTS profit_calculations CASCADE;
DROP TABLE IF EXISTS cod_collections CASCADE;
DROP TABLE IF EXISTS customer_responses CASCADE;
DROP TABLE IF EXISTS tracking_history CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS fulfillment_centers CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tracking_logs CASCADE; -- From previous schema
DROP TABLE IF EXISTS notifications CASCADE; -- From previous schema

-- ============================================
-- CORE ENTITIES
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL, -- admin, manager, cs, marketer, warehouse
  phone VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active', -- active, inactive, suspended
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(50) NOT NULL,
  whatsapp_number VARCHAR(50),
  
  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city VARCHAR(100),
  province VARCHAR(100),
  country VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20),
  
  -- Status & Flags
  status VARCHAR(50) DEFAULT 'Standard', -- VIP, Standard, New, Blocked
  is_blocked BOOLEAN DEFAULT false,
  blocked_reason TEXT,
  blocked_date TIMESTAMP WITH TIME ZONE,
  
  -- Aggregates
  orders_count INT DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  successful_deliveries INT DEFAULT 0,
  returns_count INT DEFAULT 0,
  last_order_date TIMESTAMP WITH TIME ZONE,
  
  -- Communication preferences
  prefers_whatsapp BOOLEAN DEFAULT true,
  prefers_calls BOOLEAN DEFAULT true,
  language VARCHAR(10) DEFAULT 'en',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE fulfillment_centers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL, -- FC-US-01
  
  -- Location
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  postal_code VARCHAR(20),
  
  -- Contact
  person_in_charge VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  
  -- Capacity
  capacity INT,
  current_load INT DEFAULT 0,
  utilization_percent DECIMAL(5,2),
  
  -- Status
  status VARCHAR(20) DEFAULT 'Active',
  
  -- Performance
  avg_fulfillment_time_hours DECIMAL(6,2),
  on_time_delivery_rate DECIMAL(5,2),
  
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  supplier_code VARCHAR(50) UNIQUE,
  
  -- Contact
  contact_person VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  
  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city VARCHAR(100),
  country VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20),
  
  -- Financial
  payment_terms VARCHAR(50), -- NET 30, COD
  currency VARCHAR(10) DEFAULT 'USD',
  tax_id VARCHAR(50),
  bank_name VARCHAR(255),
  bank_account VARCHAR(100),
  
  -- Performance
  rating DECIMAL(3,2),
  total_orders INT DEFAULT 0,
  on_time_delivery_rate DECIMAL(5,2),
  quality_rating DECIMAL(3,2),
  
  -- Status
  status VARCHAR(20) DEFAULT 'Active',
  
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  
  -- Pricing
  unit_cost DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  margin_percent DECIMAL(5,2),
  
  -- Inventory
  stock_level INT DEFAULT 0,
  stock_status VARCHAR(20) DEFAULT 'Healthy', -- Healthy, Low Stock, Critical, Out of Stock
  reorder_point INT DEFAULT 10,
  reorder_quantity INT DEFAULT 50,
  
  -- Logistics
  weight DECIMAL(8,2), -- kg
  dimensions VARCHAR(50), -- LxWxH
  
  -- Assignments
  fulfillment_center_id UUID REFERENCES fulfillment_centers(id),
  supplier_id UUID REFERENCES suppliers(id),
  
  -- Performance metrics
  return_rate DECIMAL(5,2) DEFAULT 0,
  global_return_rate DECIMAL(5,2),
  total_sold INT DEFAULT 0,
  total_returned INT DEFAULT 0,
  
  -- Categorization
  category VARCHAR(100),
  subcategory VARCHAR(100),
  tags TEXT, -- JSON string or array
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  
  -- Images
  primary_image_url TEXT,
  images_urls TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  
  -- Store info
  store_id VARCHAR(50) NOT NULL,
  store_name VARCHAR(255),
  
  -- Shipping address
  shipping_address_line1 TEXT NOT NULL,
  shipping_address_line2 TEXT,
  shipping_city VARCHAR(100) NOT NULL,
  shipping_province VARCHAR(100),
  shipping_country VARCHAR(100) NOT NULL,
  shipping_postal_code VARCHAR(20),
  
  -- Order Status
  status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  
  -- Sub-statuses
  confirmation_status VARCHAR(50) DEFAULT 'Pending',
  payment_status VARCHAR(50) DEFAULT 'COD Pending',
  
  -- Confirmation tracking
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmation_notes TEXT,
  
  -- Tracking info
  tracking_number VARCHAR(100),
  courier VARCHAR(100),
  shipping_method VARCHAR(50),
  last_tracking_update TIMESTAMP WITH TIME ZONE,
  shipping_status VARCHAR(50), -- Raw 17track
  
  -- Financial
  subtotal DECIMAL(12,2) NOT NULL,
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  
  -- COD tracking
  cod_collect_amount DECIMAL(12,2) DEFAULT 0,
  cod_collected_at TIMESTAMP WITH TIME ZONE,
  payout_date TIMESTAMP WITH TIME ZONE,
  
  -- Costs
  product_cost DECIMAL(10,2),
  fulfillment_cost DECIMAL(10,2),
  total_costs DECIMAL(10,2),
  
  -- Profit
  gross_profit DECIMAL(10,2),
  net_profit DECIMAL(10,2),
  profit_margin DECIMAL(5,2),
  
  -- Assignments
  fulfillment_center_id UUID REFERENCES fulfillment_centers(id),
  marketer_name VARCHAR(255),
  cs_pic_name VARCHAR(255),
  assigned_to UUID REFERENCES users(id),
  
  -- Key dates
  order_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  shipped_date TIMESTAMP WITH TIME ZONE,
  delivered_date TIMESTAMP WITH TIME ZONE,
  closed_date TIMESTAMP WITH TIME ZONE,
  
  -- Return info
  return_initiated_date TIMESTAMP WITH TIME ZONE,
  return_reason TEXT,
  
  -- Google Sheets sync
  google_sheet_row INT,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  sync_status VARCHAR(20) DEFAULT 'synced',
  
  -- Notes
  notes TEXT,
  internal_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  
  product_name VARCHAR(255) NOT NULL,
  sku VARCHAR(50) NOT NULL,
  
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  unit_cost DECIMAL(10,2),
  subtotal DECIMAL(12,2) NOT NULL,
  
  -- Return tracking
  return_status VARCHAR(50),
  return_quantity INT DEFAULT 0,
  return_reason TEXT,
  refund_amount DECIMAL(10,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TRACKING & COMMUNICATION
-- ============================================

CREATE TABLE tracking_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) NOT NULL,
  tracking_number VARCHAR(100) NOT NULL,
  
  carrier_code VARCHAR(50),
  carrier_name VARCHAR(100),
  status VARCHAR(50) NOT NULL,
  substatus VARCHAR(50),
  
  location VARCHAR(255),
  description TEXT,
  status_date TIMESTAMP WITH TIME ZONE,
  
  internal_status VARCHAR(50),
  
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  raw_data JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE customer_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) NOT NULL,
  customer_id UUID REFERENCES customers(id),
  
  notification_type VARCHAR(50) NOT NULL, -- whatsapp, phone_call
  
  message_content TEXT,
  message_template VARCHAR(100),
  
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  
  response_received BOOLEAN DEFAULT false,
  response_text TEXT,
  response_at TIMESTAMP WITH TIME ZONE,
  response_confirmed BOOLEAN,
  
  fallback_triggered BOOLEAN DEFAULT false,
  fallback_at TIMESTAMP WITH TIME ZONE,
  fallback_type VARCHAR(50),
  
  status VARCHAR(50) DEFAULT 'sent',
  
  external_message_id VARCHAR(100),
  external_status VARCHAR(50),
  
  attempt_number INT DEFAULT 1,
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- COD COLLECTION & PROFIT TRACKING
-- ============================================

CREATE TABLE cod_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) UNIQUE NOT NULL,
  
  expected_amount DECIMAL(10,2) NOT NULL,
  collected_amount DECIMAL(10,2),
  collection_method VARCHAR(50),
  
  adjusted_amount DECIMAL(10,2),
  adjustment_reason TEXT,
  adjustment_type VARCHAR(50),
  adjusted_by UUID REFERENCES users(id),
  adjusted_at TIMESTAMP WITH TIME ZONE,
  
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  
  delivery_date TIMESTAMP WITH TIME ZONE,
  collection_date TIMESTAMP WITH TIME ZONE,
  recorded_date TIMESTAMP WITH TIME ZONE,
  
  product_cost DECIMAL(10,2) NOT NULL,
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  fulfillment_cost DECIMAL(10,2) DEFAULT 0,
  marketing_cost DECIMAL(10,2) DEFAULT 0,
  other_costs DECIMAL(10,2) DEFAULT 0,
  total_costs DECIMAL(10,2),
  
  gross_profit DECIMAL(10,2),
  net_profit DECIMAL(10,2),
  profit_margin DECIMAL(5,2),
  
  collected_by VARCHAR(255),
  collector_phone VARCHAR(50),
  
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE profit_calculations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) NOT NULL,
  cod_collection_id UUID REFERENCES cod_collections(id),
  
  revenue DECIMAL(10,2) NOT NULL,
  shipping_revenue DECIMAL(10,2) DEFAULT 0,
  
  product_cost DECIMAL(10,2) NOT NULL,
  shipping_cost DECIMAL(10,2) NOT NULL,
  fulfillment_cost DECIMAL(10,2) NOT NULL,
  marketing_cost DECIMAL(10,2) DEFAULT 0,
  payment_processing_cost DECIMAL(10,2) DEFAULT 0,
  other_costs DECIMAL(10,2) DEFAULT 0,
  total_costs DECIMAL(10,2) NOT NULL,
  
  adjustments DECIMAL(10,2) DEFAULT 0,
  adjustment_notes TEXT,
  
  gross_profit DECIMAL(10,2) NOT NULL,
  net_profit DECIMAL(10,2) NOT NULL,
  profit_margin DECIMAL(5,2) NOT NULL,
  
  roi_percent DECIMAL(5,2),
  
  calculated_by UUID REFERENCES users(id),
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  calculation_version INT DEFAULT 1,
  notes TEXT
);

-- ============================================
-- RETURNS MANAGEMENT
-- ============================================

CREATE TABLE returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number VARCHAR(50) UNIQUE NOT NULL,
  order_id UUID REFERENCES orders(id) NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  
  reason VARCHAR(50) NOT NULL,
  description TEXT,
  images_urls TEXT,
  
  requested_amount DECIMAL(10,2) NOT NULL,
  refund_amount DECIMAL(10,2),
  restocking_fee DECIMAL(10,2) DEFAULT 0,
  
  status VARCHAR(50) NOT NULL DEFAULT 'Requested',
  refund_status VARCHAR(50) DEFAULT 'Pending',
  
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  approval_notes TEXT,
  rejected_reason TEXT,
  
  return_tracking_number VARCHAR(100),
  return_carrier VARCHAR(50),
  return_label_url TEXT,
  
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  shipped_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE,
  inspected_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  
  received_by UUID REFERENCES users(id),
  inspection_notes TEXT,
  condition VARCHAR(50),
  inspection_passed BOOLEAN,
  
  refund_method VARCHAR(50),
  refund_reference VARCHAR(100),
  refunded_by UUID REFERENCES users(id),
  
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID REFERENCES returns(id) NOT NULL,
  order_item_id UUID REFERENCES order_items(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  
  quantity INT NOT NULL,
  return_quantity INT NOT NULL,
  
  condition VARCHAR(50),
  action VARCHAR(50),
  
  unit_refund_amount DECIMAL(10,2),
  total_refund_amount DECIMAL(10,2),
  
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PURCHASING & INVENTORY
-- ============================================

CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_number VARCHAR(50) UNIQUE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) NOT NULL,
  fulfillment_center_id UUID REFERENCES fulfillment_centers(id) NOT NULL,
  
  status VARCHAR(50) NOT NULL DEFAULT 'Draft',
  
  subtotal DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  
  payment_status VARCHAR(50) DEFAULT 'Pending',
  paid_amount DECIMAL(12,2) DEFAULT 0,
  due_amount DECIMAL(12,2),
  payment_terms VARCHAR(255),
  
  order_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expected_delivery_date TIMESTAMP WITH TIME ZONE,
  received_date TIMESTAMP WITH TIME ZONE,
  
  tracking_number VARCHAR(100),
  
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  received_by UUID REFERENCES users(id),
  
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID REFERENCES purchases(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  
  quantity INT NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  tax_percent DECIMAL(5,2) DEFAULT 0,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  
  subtotal DECIMAL(12,2) NOT NULL,
  
  received_quantity INT DEFAULT 0,
  damaged_quantity INT DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  order_id UUID REFERENCES orders(id),
  purchase_id UUID REFERENCES purchases(id),
  
  payment_type VARCHAR(50) NOT NULL,
  
  payment_method VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  
  status VARCHAR(50) DEFAULT 'Pending',
  
  reference_number VARCHAR(100),
  transaction_id VARCHAR(100),
  
  collected_by VARCHAR(255),
  paid_to VARCHAR(255),
  collection_date TIMESTAMP WITH TIME ZONE,
  
  bank_name VARCHAR(100),
  account_number VARCHAR(100),
  
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- FRAUD PREVENTION
-- ============================================

CREATE TABLE blocked_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  address_line1 TEXT,
  city VARCHAR(100),
  province VARCHAR(100),
  country VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20),
  
  address_hash VARCHAR(255) UNIQUE,
  
  reason TEXT NOT NULL,
  block_type VARCHAR(50),
  severity VARCHAR(20) DEFAULT 'medium',
  
  is_global BOOLEAN DEFAULT false,
  store_id VARCHAR(50),
  
  blocked_by UUID REFERENCES users(id),
  blocked_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  incidents_count INT DEFAULT 1,
  last_incident_date TIMESTAMP WITH TIME ZONE,
  
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE blocked_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  
  reason TEXT NOT NULL,
  block_type VARCHAR(50),
  severity VARCHAR(20) DEFAULT 'medium',
  
  blocked_by UUID REFERENCES users(id),
  blocked_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  related_orders TEXT,
  incidents_count INT DEFAULT 1,
  
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  unblocked_at TIMESTAMP WITH TIME ZONE,
  unblocked_by UUID REFERENCES users(id),
  unblock_reason TEXT,
  
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SYNC & INTEGRATION
-- ============================================

CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  sync_type VARCHAR(50) NOT NULL,
  
  rows_processed INT,
  rows_created INT,
  rows_updated INT,
  rows_failed INT,
  rows_skipped INT,
  
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INT,
  
  status VARCHAR(20) NOT NULL,
  error_details JSONB,
  
  triggered_by VARCHAR(50),
  triggered_by_user UUID REFERENCES users(id),
  
  sync_config JSONB,
  summary JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE google_sheets_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  sheet_id VARCHAR(255) NOT NULL,
  sheet_name VARCHAR(255) NOT NULL,
  sheet_range VARCHAR(50) DEFAULT 'A:Z',
  
  column_mappings JSONB NOT NULL,
  
  sync_enabled BOOLEAN DEFAULT true,
  sync_interval_minutes INT DEFAULT 15,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_row INT,
  
  is_active BOOLEAN DEFAULT true,
  
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- AUDIT & LOGGING
-- ============================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  action VARCHAR(50) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  
  old_value JSONB,
  new_value JSONB,
  changed_fields TEXT,
  
  user_id UUID REFERENCES users(id),
  user_email VARCHAR(255),
  user_role VARCHAR(50),
  
  ip_address VARCHAR(50),
  user_agent TEXT,
  request_id VARCHAR(100),
  
  reason TEXT,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ANALYTICS & REPORTING
-- ============================================

CREATE TABLE performance_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL,
  
  country VARCHAR(100),
  fulfillment_center_id UUID REFERENCES fulfillment_centers(id),
  store_id VARCHAR(50),
  
  total_orders INT DEFAULT 0,
  confirmed_orders INT DEFAULT 0,
  cancelled_orders INT DEFAULT 0,
  delivered_orders INT DEFAULT 0,
  
  total_revenue DECIMAL(12,2) DEFAULT 0,
  total_costs DECIMAL(12,2) DEFAULT 0,
  gross_profit DECIMAL(12,2) DEFAULT 0,
  net_profit DECIMAL(12,2) DEFAULT 0,
  
  cod_collected_amount DECIMAL(12,2) DEFAULT 0,
  cod_pending_amount DECIMAL(12,2) DEFAULT 0,
  cod_collection_rate DECIMAL(5,2),
  
  total_returns INT DEFAULT 0,
  return_rate DECIMAL(5,2),
  refund_amount DECIMAL(12,2) DEFAULT 0,
  
  new_customers INT DEFAULT 0,
  repeat_customers INT DEFAULT 0,
  
  avg_fulfillment_time_hours DECIMAL(6,2),
  avg_delivery_time_days DECIMAL(6,2),
  on_time_delivery_rate DECIMAL(5,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  template_name VARCHAR(100) UNIQUE NOT NULL,
  template_type VARCHAR(50) NOT NULL,
  
  subject VARCHAR(255),
  body_template TEXT NOT NULL,
  variables JSONB,
  
  language VARCHAR(10) DEFAULT 'en',
  is_active BOOLEAN DEFAULT true,
  
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
