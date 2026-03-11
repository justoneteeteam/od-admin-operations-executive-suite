# Product Context

## Project Name
COD Admin Operations & Executive Suite

## Mission
To provide a comprehensive, modern dashboard for managing Cash on Delivery (COD) e-commerce operations, streamlining order tracking, inventory management, fulfillment, financial performance analysis, and incident resolution.

## Core Problem
Managing COD e-commerce operations involves complex logistics, financial reconciliation, and inventory tracking. Existing solutions (like Google Sheets) are manual, error-prone, and lack real-time visibility. Delivery failures, address issues, and customer unavailability require structured incident management with SLA-driven workflows.

## Target Audience
- **E-commerce Business Owners**: Need high-level financial metrics (Profit, Revenue, Ad Spend).
- **Operations Managers**: Need granular control over orders, inventory, fulfillment, and incident resolution.
- **Marketing Staff**: Tracks Orders without fulfillment center, suppliers.
- **Support Staff**: Need tools to track order status, manage incidents, and communicate with customers via SMS/WhatsApp/Voice.

## Key Features
- **Real-time Dashboard**: Visual KPIs for revenue, profit, and orders.
- **Order Management System (OMS)**: End-to-end tracking of orders (Placement -> Delivery -> Returns).
- **Inventory & Purchasing**: Supplier management, purchase orders, and stock tracking.
- **Fulfillment Center**: Warehouse performance monitoring and shipping status.
- **Financial Module**: Detailed profit/loss analysis and COD reconciliation.
- **Multi-Store Management**: Connect multiple stores via Google Sheets (Credentials stored securely).
- **Shipment Tracking**: Automated 17Track sync to monitor package status (InfoReceived -> Delivered).
- **Risk Scoring Engine**: Two-layer scoring (Base heuristics + Loqate address verification) with automated actions per risk level (auto_reject, call_center, twilio_long, twilio_short).
- **Automated Notifications**: WhatsApp/Voice/SMS workflows via Twilio to reduce RTO with adaptive risk-based logic.
- **Incident Management**: Auto-created tickets from 17Track delivery failures, SLA tracking (72 business-hours), resolution workflows, canned response templates.
- **Ads Performance Dashboard**: High-level tracking of Spend, Leads (Confirmed), Orders (Delivered), Revenue, CPL, CPO, CVR, and ROAS.
- **Performance Analytics**: Operator and team performance tracking.
- **Shopify Integration**: Automatic order ingestion via Shopify webhooks.

## Order Lifecycle & Workflows
### 1. Standard Order Flow
`Pending` (Sync from Sheets/Shopify) -> `Confirmed` (Manual/Voice) -> `Order Shipped` (Tracking Added) -> `Processing` (Carrier Scan) -> `In Transit` -> `Out for Delivery` -> `Delivered` -> `COD Collected` / `Return Requested`

### 2. RTO Reduction & Confirmation Workflow
- **Trigger**: New Order or Status becomes `In Transit`.
- **Action**: Automated Voice/WhatsApp confirmation to verify intent.
- **Logic**:
  - **Phase 1**: Trigger Pre-Call SMS notification.
  - **Phase 2**: Twilio AI Voice Call (`MAX_ATTEMPTS=1`).
  - **Risk Mapping**: 
    - `auto_reject` -> Short dismissal call (BLOCKED orders auto-cancelled).
    - `call_center` -> Full confirmation inquiry (HIGH risk → Google Sheets queue).
    - `twilio_long` -> Extended Twilio call (MEDIUM risk).
    - `twilio_short` -> Brief Twilio call (LOW risk).
  - **Outcome**:
    - "Sí/Yes": Order Confirmed.
    - No Answer: Marked as "No Answer" status.
    - Fake/Cancel: Marked as "Declined".

### 3. Incident Management Workflow
- **Trigger**: 17Track delivery failure events (DeliveryFailure, Exception, Undelivered).
- **Classification**: Auto-classifies into case types (address_issue, customer_unavailable, delivery_refused, customs_issue, parcel_damaged_lost, delivery_delay, access_issue, pickup_warehouse_issue).
- **SLA**: 72 business-hours deadline (skipping weekends in GMT+1). Auto-escalated to "urgent" on breach.
- **Resolution**: Return to Warehouse, Reshipment, Resolved, or Cancelled.
- **Communication**: Canned response templates with token replacement ({{name}}, {{order}}, {{phone}}) sent via SMS, WhatsApp, Email, or Voice.
- **Fallback Sync**: Hourly cron picks up undelivered orders without tickets.

## Product Feature Refinement (Recent)
- **Risk Scoring**: Two-layer assessment with Base scoring (7 factors) + Loqate refinement. Retry cron for failed API calls.
- **Incident System**: Full lifecycle management — auto-create, SLA deadlines, breach escalation, resolution outcomes, PIC assignment, timeline logging.
- **Canned Responses**: Pre-built templates for common scenarios per channel (SMS, WhatsApp, Email, Voice) with dynamic token support.
- **Shopify Webhooks**: Automatic order creation from Shopify store events.
- **SMS Delivery Service**: Template-based SMS via Twilio with GSM-7 encoding to maximize character limits, status callback tracking.
- **Twilio Call Scheduler**: Cron-based batch processing of confirmation calls for eligible orders.
- **Data Linking**:
  - **Orders ↔ Fulfillment**: Every order can be assigned to a specific Fulfillment Center.
  - **Purchases ↔ Suppliers**: Purchase orders linked to Suppliers with auto-populated contact info.
  - **Orders ↔ Tickets**: Incident tickets auto-linked to originating orders.
  - **Prisma Relations**: Changes ripple through the system.
- **Quality of Life Fixes**: Robust CSV processing, Purchase Order data visibility, European decimal handling.

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
