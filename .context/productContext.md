# Product Context

## Project Name
COD Admin Operations & Executive Suite

## Mission
To provide a comprehensive, modern dashboard for managing Cash on Delivery (COD) e-commerce operations, streamlining order tracking, inventory management, fulfillment, and financial performance analysis.

## Core Problem
Managing COD e-commerce operations involves complex logistics, financial reconciliation, and inventory tracking. Existing solutions (like Google Sheets) are manual, error-prone, and lack real-time visibility.

## Target Audience
- **E-commerce Business Owners**: Need high-level financial metrics (Profit, Revenue, Ad Spend).
- **Operations Managers**: Need granular control over orders, inventory, and fulfillment.
- **Marketing staff**: Tracks Orders without fulfillment center, suppliers
- **Support Staff**: Need tools to track order status and manage customer inquiries.

## Key Features
- **Real-time Dashboard**: Visual KPIs for revenue, profit, and orders.
- **Order Management System (OMS)**: End-to-end tracking of orders (Placement -> Delivery -> Returns).
- **Inventory & Purchasing**: Supplier management, purchase orders, and stock tracking.
- **Fulfillment Center**: Warehouse performance monitoring and shipping status.
- **Financial Module**: Detailed profit/loss analysis and COD reconciliation.
- **Multi-Store Management**: Connect multiple stores via Google Sheets (Credentials stored securely).
- **Shipment Tracking**: Automated 17Track sync to monitor package status (InfoReceived -> Delivered).
- **Automated Notifications**: WhatsApp/Voice workflows via Twilio to reduce RTO with adaptive risk-based logic.
- **Ads Performance Dashboard**: High-level tracking of Spend, Leads (Confirmed), Orders (Delivered), Revenue, CPL, CPO, CVR, and ROAS.

## Order Lifecycle & Workflows
### 1. Standard Order Flow
`Pending` (Sync from Sheets) -> `Confirmed` (Manual) -> `Order Shipped` (Tracking Added) -> `Processing` (Carrier Scan) -> `In Transit` -> `Out for Delivery` -> `Delivered` -> `COD Collected` / `Return Requested`

### 2. RTO Reduction & Confirmation Workflow
- **Trigger**: New Order or Status becomes `In Transit`.
- **Action**: Automated Voice/WhatsApp confirmation to verify intent.
- **Logic**:
  - **Phase 1**: Trigger Pre-Call SMS notification.
  - **Phase 2**: Twilio AI Voice Call (`MAX_ATTEMPTS=1`).
  - **Risk Mapping**: 
    - `auto_reject` -> Short dismissal call.
    - `call_center` -> Full confirmation inquiry.
  - **Outcome**:
    - "Sí/Yes": Order Confirmed.
    - No Answer: Marked as "No Answer" status.
    - Fake/Cancel: Marked as "Declined".

## Product Feature Refinement (Recent)
- **Data Linking**:
  - **Orders ↔ Fulfillment**: Every order can be assigned to a specific Fulfillment Center for logistics tracking.
  - **Purchases ↔ Suppliers**: Purchase orders are directly linked to Suppliers, auto-populating contact info and payment terms.
  - **Prisma Relations**: Changes ripple through the system (e.g., viewing a Supplier shows all their historical Purchase Orders).
- **Store Selection**: Orders are now linked to specific stores via a dynamic dropdown, enabling multi-brand management.
- **Edit Functionality**: Full CRUD support implemented in both backend and frontend for all core modules.
- **Image Management**: Seamless support for local file uploads and remote image URLs with live preview.
- **Orders Management**: Enhanced Edit Drawer with detailed logistics tracking (Courier, Tracking #, Fulfillment Center) and country selection.
- **WhatsApp & Voice Confirmation**: Integrated Twilio for automated call/SMS workflows with risk-based intent mapping and "No Answer" handling.
- **Ads Dashboard Rearrangement**: Metrics optimized for executive view (Spend -> Revenue -> Efficiency KPIs).
- **Quality of Life Fixes**: Robust CSV processing for diverse data formats and comprehensive Purchase Order data visibility.
- **17Track Webhook**: Real-time order status updates via 17Track push events.

## Financial Logic & Formulas
### 1. Revenue (Booked)
- **Trigger**: `Order.confirmationStatus` = `Confirmed`
- **Formula**: `Sum(Item Price * Quantity)`

### 2. COD Collected (Realized)
- **Trigger**: `Order.status` = `Delivered`
- **Formula**: `Sum(Item Price * Quantity)` (Assumes full payment)

### 3. Profit
- **Formula**: `Revenue - Total COGS - Shipping Cost`
- **COGS**: `Sum(Product Unit Cost * Quantity)`

### 4. Return Rate (%)
- **Formula**: `(Total Items Returned / Total Items Sold) * 100`
- **Granularity**: Can be calculated per Product, per Customer, or Globally.
