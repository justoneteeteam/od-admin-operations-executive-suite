# Progress Status

## Overview
- **Frontend**: 100% Completed (UI/UX, API Client, Ads Dashboard, Purchase Orders, Incidents Page, Performance Page)
- **Backend**: 100% Completed (All CRUD APIs, Auth, Risk Scoring, Loqate, Twilio, Tickets, Notifications, Shopify Webhooks)
- **Database**: 100% Completed (Full Schema Deployed & Verified incl. Tickets, RiskAssessment, NotificationTemplate, IncidentWorkflow)

## Roadmap
### Phase 1: Frontend Prototype (Completed)
- [x] Dashboard UI
- [x] Order Management View
- [x] Create Order Page (Form with Customer, Product, Status, Audit History)
- [x] Inventory View
- [x] Interactive Charts

### Phase 2: Backend Infrastructure (Completed)
- [x] Initialize NestJS Project (`/backend`)
- [x] Deploy Comprehensive Database Schema (Supabase)
- [x] Implement Authentication (JWT/Session)
- [x] Prepare for Cloud Deployment (PaaS/Docker)
- [x] Add Health Checks & Production CORS/Port config

## Project Roadmap & Status

### Version 1: Core Order Management & Sync (Completed)
**Focus**: Stable Order Operations, Google Sheets Sync, and Ads Metrics.
- [x] **Order Tab**: Full CRUD, Status Management, Pagination (20/page).
- [x] **Store Sync**: Shopify Webhook maps store domains automatically.
- [x] **Responsive UI**: App scaling added for tablet & mobile devices.
- [x] **UI Theme & Navigation**: Collapsible sidebar and corporate light theme applied system-wide.
- [x] **Delete Order**: Implemented with foreign key constraint cascading and error handling.
- [x] **Google Sheets Sync**: Two-way sync for Orders.
- [ ] **Fulfillment Center Sync**: Add FC data to Google Sheets.
- [ ] **Suppliers Sync**: Add Supplier data to Google Sheets.
- [ ] **Bulk Actions**: Select multiple orders for batch operations.
- [ ] **Filter Tree**: Advanced filtering by status/date/country via backend.
- [x] **Tracking Sync**: 17Track Webhook & Internal Tracking History Model UI.
- [x] **Twilio Call Logic**: Unified confirmation flow with `MAX_ATTEMPTS=1`.
- [x] **Timeline Integration**: Merged tracking, call logs, and messages in one view.
- [x] **Tracking Deduplication**: Logic to collapse redundant 17Track updates.
- [x] **CSV Import**: Robust parsing (European decimals, CRLF, phone normalization, zipcode).

### Version 2: Risk Orchestration & Incident Management (In Progress)
**Focus**: Automated risk scoring, address verification, and incident lifecycle.
- [x] **Risk Scoring Engine**: Two-layer scoring (Base + Loqate) with automated action triggers.
- [x] **Address Verification**: Loqate API integration with caching & retry cron.
- [x] **Incident Tickets**: Full CRUD with auto-creation from 17Track, SLA tracking, PIC assignment (UI decommissioned).
- [x] **Incident Auto-Create**: `IncidentAutoService` classifies 17Track events into case types (address_issue, delivery_refused, etc.).
- [x] **SLA Breach Checker**: Cron (every 15 min) auto-escalates breached tickets to urgent.
- [x] **Incident Sheets Sync**: Open/resolved tickets synced to Google Sheets.
- [x] **Canned Responses**: Template-based reply compose for SMS/WhatsApp/Email/Voice with token replacement.
- [x] **Twilio Call Scheduler**: Cron-based batch processing of eligible orders for confirmation calls.
- [x] **SMS/WhatsApp Delivery Notifications**: Template messages via Twilio with GSM-7 encoding.
- [x] **Shopify Webhooks**: Automatic order ingestion from Shopify stores.
- [x] **Performance Page**: Operator/team performance analytics UI.
- [x] **Bulk Customer Blocking**: Automated bulk blocking with intelligent country detection and phone normalization.
- [x] **Twilio AMD Optimization**: Synchronous AMD filtering to prevent voicemails from receiving Voice templates.
- [x] **Twilio Call Scripting**: Conditional, tiered call scripts verifying identity via sequential HIGH/MEDIUM risk workflows.
- [x] **17Track Automation**: Courier format auto-detection identifying carriers automatically upon dispatch.
- [x] **Orders UI Hardening**: Increased table density and default timestamp sorting (`createdAt` descending).
- [x] **WhatsApp/Communication**: Fixes to QR connection instability.
- [ ] **Workflow Engine**: Configurable multi-step auto-sequences per case type.
- [ ] **Status Sync**: Sync Call Center updates (Unconfirmed, Call Later) back to App.
- [ ] **WhatsApp RemoteAuth**: Migrate to DB-backed sessions for multi-instance.

### Version 3: Advanced Incident Management
**Focus**: Handling operational issues (Damaged goods, Lost packages, Complaints).
- [-] **Incident Tab**: Dedicated UI (`IncidentsPage.tsx`) decommissioned during CRM redesign.
- [x] **Resolution Workflow**: Resolution types (Return to Warehouse, Reshipment, Resolved, Cancelled).
- [ ] **Advanced Resolution**: Assignment rules, auto-escalation to supervisors.

### Version 3.5: Advanced Fulfillment
- [x] **Inventory Module**: 8-state stock machine, PO tables, stock float updates.
- [x] **Tracking Sync**: 17Track v2.2 hybrid push-pull architecture.
- [x] **Parent-Child SKU Management**: Deeply integrated SKU hierarchy handling child codes, display names, and inventory operations.
- [x] **Return Tracking**: Return tracking and stock state persistence linked with order DTO updates.
- [x] **Warehouse Logistics**: Internal warehouse creation validations inside fulfillment modules.
- [ ] **FC Connection**: Direct integration with Fulfillment Centers.

### Version 4: Advanced Analytics
- [x] **POC Product Dashboard**: Report dashboard for non-SKU product performance (KPIs, conversion funnel, metrics).
- [x] **Financial Suite**: Financial Records module with bulk Excel import, VND/EUR conversions, and flexible payment source tracking.
- [x] **P&L Reporting**: Core implementations extracting profit logic across revenue, fulfillment, and product costs.
- [x] **Traffic Attribution**: Store analytics mapped to Traffic Channels (UTM source) and Browser IP extracted from Shopify payloads.
- [x] **Geo Distribution Reports**: Interactive country/city mapping with island detection and KPI aggregation.
- [ ] **Analytics Tab**: Profitability, RTO Rates, Operator Performance.
- [ ] WhatsApp real number connection → test for in transit mode.
- [ ] 17Track sync sample data → test for real tracking number.
