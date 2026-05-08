# Active Context

## Current Focus
**Version 2: Risk Orchestration & Incident Management**
- **Inventory Management**: 8-state stock machine, PO management, and D+7 inventory planning projections.
- **Risk Scoring**: Fully operational two-layer scoring (Base + Loqate address verification) with automated action triggers.
- **Incident Management**: Auto-created tickets from 17Track (v2.2 hybrid push-pull) delivery failures, SLA tracking (72 business-hour deadline), canned response templates for multi-channel replies.
- **Notifications**: SMS/WhatsApp Out-of-Delivery messages, Twilio call scheduler with synchronous AMD to skip voicemails.
- **Maintenance**: Monitoring Production Deployment on Railway, Analytics improvements (Ads Hierarchy, POC Product Dashboard).

## Recent Accomplishments
- **UI Architecture & Theme**: Completed migration to a collapsible, hierarchical sidebar navigation and a modern, corporate light-themed design system. Standardized Tailwind design tokens replaced legacy dark-mode classes across key operational pages.
- **Reporting & Analytics**: Implemented Geo Distribution Reports with country/city data aggregation, island-detection logic, and key metrics visualized via a new interactive tabbed interface.
- **Order Deletion & Backend Hardening**: Improved backend error handling for order deletion by gracefully resolving foreign key constraint violations through cascading removal of dependent records.
- **Module Maintenance**: Fixed persistent rendering issues in product history tabs and decommissioned the Incidents module from the sidebar/UI to streamline the operational suite.
- **Inventory Module**: Implemented an 8-state stock machine tracking inventory across the supply chain, updated database schema with inventory float columns and purchase order tables, and built a frontend dashboard for product details and D+7 projections.
- **Tracking 17Track v2.2**: Upgraded to 17Track v2.2 with a hybrid push-pull architecture for real-time tracking.
- **Twilio Call Optimization**: Switched to synchronous AMD (Answering Machine Detection) to prevent scripts from playing on voicemails and hanging up immediately.
- **Analytics & Dashboards**: Created a POC Product Dashboard for non-SKU product performance (KPIs, conversion funnel) and fixed Ads Dashboard hierarchy to allow independent row expansions (Campaign → Ad Set → Ad).
- **Bulk Customer Blocking**: Automated bulk blocking for customers with unmatched phone numbers, using intelligent country detection (Italy/Spain prefixes) and phone normalization.
- **Purchase Order Costing**: Fixed purchase order product costing to automatically recalculate weighted average `unitCost` upon PO creation and receiving.
- **Risk Scoring System**: Implemented two-layer scoring — base scoring (blocked status, item count, order value, frequency, history, address regex) + Loqate address verification refinement. Risk levels (LOW/MEDIUM/HIGH/BLOCKED) trigger automated actions (twilio_short, twilio_long, call_center, auto_reject).
- **Loqate Address Verification**: Integrated Loqate API for postal code + house number validation with in-memory caching. Added `LoqateRetryService` cron (every 6h) to retry `local_fallback` orders and daily cache purge.
- **Incident/Ticket System (Backend)**: Full CRUD tickets module with auto-creation from 17Track delivery failures (`IncidentAutoService`), SLA deadline calculation (72 business-hours, skipping weekends), SLA breach checker (every 15 min), resolution workflows (return_to_warehouse, reshipment, resolved, cancelled), PIC assignment, and timeline events. (Note: UI currently decommissioned).
- **Incident Google Sheets Sync**: `IncidentSheetsService` syncs open/resolved tickets to Google Sheets for external visibility.
- **Canned Response Templates**: Added pre-written SMS/WhatsApp/Email/Voice templates with token replacement (`{{name}}`, `{{order}}`, `{{phone}}`).
- **Twilio Call Scheduler**: Cron-based service to batch-process eligible orders for confirmation calls.
- **Shopify Webhooks**: `ShopifyController` processes incoming Shopify order webhooks for automatic store sync.
- **SMS/WhatsApp Delivery Notifications**: `SmsWhatsappDeliveryService` sends template-based messages via Twilio with GSM-7 encoding, status callbacks, and `CustomerResponse` logging.
- **Performance Page**: New `PerformancePage.tsx` for operator/team performance analytics.
- **CSV Import Hardening**: European decimal parsing, CRLF handling, phone normalization, zipcode support.
- **WhatsApp/Communication**: Fixed WhatsApp QR scanning sequence and `WhatsappPersonalService` session management for connection stability.
- **Parent-Child SKU Management**: Implemented comprehensive SKU hierarchy with warehouse-specific child codes, display names, and deep integrations across inventory, purchases, and the frontend product dashboard.
- **Financial Suite & P&L**: Completed Financial Records module with full P&L calculation (revenue vs fulfillment vs product costs), bulk Excel import, VND to EUR currency conversion, and flexible payment source tracking.
- **Tracking Automation**: Automated 17Track courier selection by matching tracking number formats to carrier codes, and fixed return tracking data persistence (`UpdateOrderDto`).
- **Twilio Call Scripting**: Enforced conditional, tiered Twilio call scripts to verify customer identity through sequential HIGH/MEDIUM risk (short vs long script) workflows.
- **Shopify & Traffic Tracking**: Added Shopify webhook processing to capture traffic channels (UTM source) and browser IP via `note_attributes`, with UI badges and a traffic filter tree.
- **UI Hardening**: Optimized Orders Console sorting by prioritizing system `createdAt` descending and increased table information density.
## Immediate Goals
1.  **V1 Wrap-up**:
    -   Implement **Bulk Select** for Orders.
    -   Build **Filter Tree** (Status/Date/Country).
    -   Add **Suppliers** & **Fulfillment Centers** to Google Sheets Sync.
2.  **V2 Hardening**: Migrate WhatsApp `LocalAuth` to `RemoteAuth` (DB-backed sessions) for multi-instance support.
3.  **Incident Automation**: Enable auto-sequence workflows per case type (multi-step SMS → WhatsApp → Voice escalation).

## Prerequisites & Blocking Issues
- **User Data**: Customers must have valid international phone numbers (E.164 format) for WhatsApp/SMS/Voice to work.
- **17Track Config**: User needs to update their 17Track Webhook URL to the production link.
- **Loqate API Key**: `LOQATE_API_KEY` environment variable required for address verification (falls back to regex without it).

## Active Tasks
- Monitoring Railway logs for any runtime anomalies.
- Awaiting next task/objective from the user.
