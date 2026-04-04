# System Patterns

## Architecture Overview
The application follows a client-server architecture:
- **Client**: Single Page Application (SPA) built with React and Vite. Handles UI, user interaction, and state presentation.
- **Server**: API Server built with NestJS. Handles business logic, data persistence, and external integrations (Database, AI, Twilio, 17Track, Loqate, Google Sheets, Shopify).

## Directory Structure Strategy
### Frontend (Root)
Current structure places source files directly in the root or specifically:
- `/components`: Reusable UI components (Buttons, Cards, Charts).
- `/pages`: Route-specific components/views (OrdersPage, IncidentsPage, PerformancePage, AdsPage, etc.).
- `/src/services`: API abstraction layer (e.g., `orders.service.ts`, `fulfillment.service.ts`).
- `/src/components`: Shared frontend components (e.g., canned response picker).
- `/backend`: Contains the NestJS backend application.

*Note: Frontend source files are currently in the root level, which differs from the standard `src/` convention.*

## Design Patterns
- **Component-Based Architecture**: UI is broken down into small, reusable components.
- **Hooks Pattern**: Logic reuse via Custom Hooks (e.g., for data fetching or form handling).
- **Service-Repository Pattern (Backend)**: NestJS separation of logic (Services) from data access (Prisma Service).
- **Global Auth Guard Pattern**: Global `JwtAuthGuard` protecting all routes by default, with `@Public()` toggle.
- **Layered Scoring Pattern**: Risk scoring uses a two-layer approach — deterministic base scoring (Layer 1) with optional API-based refinement (Layer 2: Loqate), gracefully degrading on failure.

## Integration Patterns

### 1. Data Linking (Foreign Keys)
- **Pattern**: Relational Integrity with Nested Responses
- **Implementation**:
  - **Backend**: Prisma `include` clauses (e.g., `include: { fulfillmentCenter: true }`) return related entity data in the same response.
  - **Frontend**: API Services define nested Typescript interfaces (e.g., `Order` has `fulfillmentCenter` object) to consume this data directly without extra round-trips.
  - **Validation**: Frontend selects send IDs (`supplierId`), Backend validates existence via Foreign Key constraints.
  - **Inventory**: Orders link to a robust 8-state Stock Machine (e.g., Warehouse → Pending → Shipped → Delivered → Return Transfer) to accurately reflect product availability.
  - **Parent-Child SKU Architecture**: Master product definitions decouple from warehouse-specific variants, allowing synchronized but distinct SKU mappings inside fulfillment flows.

### 2. Shipment Tracking Sync (17Track v2.2)
- **Pattern**: Hybrid Push-Pull Architecture (Webhook & PollingBackup)
- **Primary Flow (Push)**:
  1.  **Register**: Backend registers package with 17Track v2.2 API upon creation/shipping.
  2.  **Webhook**: 17Track pushes JSON payload to `/tracking/webhook` (Must be Publicly Accessible).
  3.  **Process**: `TrackingService` identifies event (e.g., `InTransit_Arrival`).
  4.  **Trigger**: Updates Order Status, Sends WhatsApp Notification, and creates Incident Ticket if delivery failure.
- **Backup Flow (Pull/Poll)**:
  -   Cron job (every 3h) to sync stale orders and pull the latest status.

### 3. Order Confirmation Workflow (Twilio WhatsApp & Voice)
- **Pattern**: Deterministic State Machine with Escalation
- **Data Requirement**: `Customer.phone` must be in E.164 format.
- **Trigger**: Order remains `Pending` and needs confirmation.
- **Logic**:
  1.  **Phase 1 (SMS/WA)**: Send Pre-Call SMS ("We will call you in 8 seconds to confirm").
  2.  **Phase 2 (Voice)**: Twilio dials number (`MAX_ATTEMPTS=1`). Synchronous AMD (Answering Machine Detection) instantly hangs up if a voicemail/machine is detected.
  3.  **Result Handling**:
      -   **Confirmed/Declined**: Update `confirmationStatus` and trigger financial/inventory logic.
      -   **No Answer**: Set `confirmationStatus` to "No Answer" immediately after 1 attempt.
      -   **Unclear/Hung Up**: Forward to "Call Center" for manual human review.
- **Scheduler**: `TwilioCallSchedulerService` cron batches eligible orders for processing.

### 4. Risk Scoring Workflow
- **Pattern**: Two-Layer Scoring with Graceful Degradation
- **Flow**:
  1.  **New Order** arrives → `assessOrder()` triggered.
  2.  **Layer 1 (Base)**: Deterministic scoring — blocked status (+10), item count (+1/+2), order value (+2), frequency (+2), delivery history (−1), postal code regex (+3), missing house number (+1).
  3.  **Layer 2 (Loqate)**: API-based address verification — replaces address scores from Layer 1 with API results. Falls back to Layer 1 scores on any error.
  4.  **Risk Decision**:
      -   Score ≥ 10 or Blocked → `BLOCKED` → `auto_reject` (order auto-cancelled).
      -   Score ≥ 4 → `HIGH` → `call_center` (forwarded to Google Sheets queue).
      -   Score ≥ 2 → `MEDIUM` → `twilio_long` (extended confirmation call).
      -   Score < 2 → `LOW` → `twilio_short` (brief confirmation call).
  5.  **Loqate Retry**: `LoqateRetryService` cron (every 6h) retries orders stuck at `local_fallback`. Daily cache purge.

### 5. Incident Management (Tickets)
- **Pattern**: Event-Driven Ticket Lifecycle with SLA
- **Auto-Creation**:
  1.  17Track webhook fires a delivery failure event (DeliveryFailure, Exception, Undelivered).
  2.  `IncidentAutoService` classifies it into a case type using substatus mapping + keyword rules.
  3.  Ticket created with `source: '17track_auto'`, duplicate detection, and SLA deadline calculation.
- **Fallback Cron**: Hourly sync picks up undelivered orders without tickets.
- **SLA Enforcement**: 72 business-hours (skipping GMT+1 weekends). Cron every 15 min marks breached tickets as urgent.
- **Resolution Outcomes**: `return_to_warehouse`, `reshipment`, `resolved`, `cancelled`.
- **Communication**: Canned response templates per channel (SMS, WhatsApp, Email, Voice) with token replacement (`{{name}}`, `{{order}}`, `{{phone}}`).
- **Google Sheets Sync**: `IncidentSheetsService` pushes open/resolved tickets to an external sheet.
- **Timeline**: All events (status changes, messages, escalations) logged in `TicketTimeline`.

### 6. Shopify Webhook Integration
- **Pattern**: Inbound Webhook Consumer
- **Flow**: Shopify sends order events → `ShopifyController` processes payload → maps to internal Order entity → upserts in database.
- **Store Mapping**: Shopify domain auto-mapped to `storeId`.
- **Enriched Metrics**: The parser digs into `note_attributes` and deeper layers of the payload to derive parameters like `Traffic Channel` (mapped via UTM tracking) and raw `browser_ip`, making these metrics available to the Ads & Financial dashboards.

### 7. Notification Service (SMS/WhatsApp)
- **Pattern**: Template-Based Messaging with Status Tracking
- **Implementation**:
  - `SmsWhatsappDeliveryService` sends messages using `NotificationTemplate` records from the database.
  - Variable replacement (`{{1}}`, `{{2}}`, etc.) for dynamic content.
  - GSM-7 encoding (diacritic stripping) to maximize SMS character limit (160 chars vs 70 for UCS2).
  - Twilio status callbacks update `CustomerResponse` records (sent → delivered → read).

### 8. Deployment Architecture
- **Platform**: Railway (PaaS)
- **Frontend**: Vite SPA (Static) on Nginx.
- **Backend**: NestJS API container.
- **Data**: Supabase (PostgreSQL).
- **External**: Twilio (WhatsApp, SMS, Voice), 17Track (Webhooks), Google Sheets API, Loqate (Address Verification), Shopify (Webhooks).

### 9. Google Sheets Integration (OD Data Sync)
- **Pattern**: External Data Synchronization
- **Credentials**: Stored in `StoreSettings` table (Encrypted).
- **Flow**:
  1.  **Configure**: User inputs Spreadsheet ID & Credentials JSON in Settings.
  2.  **Sync**: Backend service uses `google-spreadsheet` library/API to fetch rows.
  3.  **Map**: Maps Sheet columns to `Order` entity fields.
  4.  **Upsert**: Creates new orders or updates existing ones based on Order ID.

### 10. Robust CSV Parsing & Bulk Mapping
- **Pattern**: Defensive Data Transformation
- **Implementation**:
  - **Decimal Normalization**: Converts European "comma" decimals (e.g., `37,49`) to standard floats.
  - **Sanitization**: Trims all fields to remove `\r` (CRLF) characters and hidden whitespace.
  - **Phone & Country Detection**: Prepends `+` to phone numbers and automatically assigns ISO country codes (e.g., Italy 32x-38x, Spain 6xx/7xx) for unmatched bulk customer blocking.
  - **Intelligent Store Resolution**: Validates storeId, falls back to name lookup, then first available store.

### 11. Ads Performance Data Mapping
- **Pattern**: Metric Aggregation Layer with Hierarchical Display
- **Implementation**:
  - **Spend/Revenue**: Direct query from `AdsCampaigns` and `Orders`.
  - **Hierarchical Structuring**: Data is grouped and expandable via Set state independently across Campaign → Ad Set → Ad levels.
  - **Leads**: Defined as `confirmationStatus = 'Confirmed'`.
  - **Orders**: Defined as `status = 'Delivered'`.
  - **Derived KPIs**: ROAS, CVR, CPL, CPO calculated in the frontend service layer.

### 12. Data Schema Design (Core Entities)
- **Users**: Admin accounts (email, password_hash, role, fullName).
- **Orders**: Full lifecycle (Pending to Returned), tracking numbers, costs, profits, risk scores.
- **Products**: Inventory levels, unit costs, selling prices, and return rates.
- **FulfillmentCenters**: Logistics hubs, capacity, linked orders.
- **Suppliers**: Sourcing partners, linked purchase orders.
- **Purchases**: Stock replenishment, linked to Suppliers & Fulfillment Centers.
- **StoreSettings**: Configuration for multi-store management and Google Sheets credentials.
- **Financials**: COD collections, profit calculations, and payout tracking.
- **Tickets**: Incident lifecycle (open → in_progress → resolved → closed), SLA deadlines, case types, PIC assignment.
- **TicketTimeline**: Chronological event log per ticket (status changes, messages, escalations).
- **TicketMessages**: Communication records per ticket (SMS, WhatsApp, Email, Voice replies).
- **RiskAssessment**: Persistent record of risk scoring factors, levels, and actions per order.
- **NotificationTemplate**: Pre-built message templates by channel/category with variable placeholders.
- **IncidentWorkflow**: Configurable multi-step auto-sequence definitions per case type.

### 13. Financial Suite & P&L Calculation
- **Pattern**: External Integrations coupled with Event-Driven Snapshots
- **Data Extrapolation**: Financial modules merge external Bulk Excel tracking records (mapped dynamically) alongside system revenue to craft an entire snapshot of cash flow. Cross-pollination includes currency adjustments mapping variables constantly across conversion ratios like VND → EUR.
- **Trigger**: Order Status Changes (`Confirmed`, `Delivered`)
- **Action**: Calculate and persist financial metrics via `ProfitsService`.
- **Logic**:
  - `Confirmed` -> Calculate **Revenue** (Order Total) & **COGS** (Sum of `unit_cost` + `shipping_cost` + `tax_amount`).
  - `Delivered` -> Calculate **COD Collected** (Realized Cash).
  - **Profit Definition**: `Gross Profit = Revenue - COGS - [Outbound Shipping Cost]`.
  - Update `ProfitCalculation` table.

### 14. Unified Order Timeline (Frontend)
- **Pattern**: Multi-source Chronological Merge
- **Implementation**:
  - Combines `trackingHistory`, `customerResponses`, and `callLogs` into a single descending list.
  - **Deduplication Logic**: Filters out tracking updates with the same status/substatus/description within a 5-minute window.
  - **Status Logic**: Color-coded icons (Red/Green/Yellow) to indicate call success or failure states.

## Naming Conventions
- **Files**: PascalCase for React components (`MyComponent.tsx`), camelCase for utilities (`myUtility.ts`).
- **CSS**: Utility classes via Tailwind CSS.
- **Backend Modules**: kebab-case directories (`risk-scoring/`, `twilio-voice/`), PascalCase classes.
- **Tickets**: Sequential numbering (`INC-0001`, `INC-0002`, ...).
