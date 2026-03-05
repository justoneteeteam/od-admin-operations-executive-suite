# System Patterns

## Architecture Overview
The application follows a client-server architecture:
- **Client**: Single Page Application (SPA) built with React and Vite. Handles UI, user interaction, and state presentation.
- **Server**: API Server built with NestJS. Handles business logic, data persistence, and external integrations (Database, AI).

## Directory Structure Strategy
### Frontend (Root)
Current structure places source files directly in the root or specifically:
- `/components`: Reusable UI components (Buttons, Cards, Charts).
- `/pages`: Route-specific components/views.
- `/src/services`: API abstraction layer (e.g., `orders.service.ts`, `fulfillment.service.ts`).
- `/backend`: Contains the NestJS backend application.

*Note: Frontend source files are currently in the root level, which differs from the standard `src/` convention.*

## Design Patterns
- **Component-Based Architecture**: UI is broken down into small, reusable components.
- **Hooks Pattern**: Logic reuse via Custom Hooks (e.g., for data fetching or form handling).
- **Service-Repository Pattern (Backend)**: NestJS separation of logic (Services) from data access (Prisma Service).
- **Global Auth Guard Pattern**: Global `JwtAuthGuard` protecting all routes by default, with `@Public()` toggle.

## Integration Patterns

### 1. Data Linking (Foreign Keys)
- **Pattern**: Relational Integrity with Nested Responses
- **Implementation**:
  - **Backend**: Prisma `include` clauses (e.g., `include: { fulfillmentCenter: true }`) return related entity data in the same response.
  - **Frontend**: API Services define nested Typescript interfaces (e.g., `Order` has `fulfillmentCenter` object) to consume this data directly without extra round-trips.
  - **Validation**: Frontend selects send IDs (`supplierId`), Backend validates existence via Foreign Key constraints.

### 2. Shipment Tracking Sync (17Track)
- **Pattern**: Webhook (Push) & Polling (Backup)
- **Primary Flow (Push)**:
  1.  **Register**: Backend registers package with 17Track API upon creation/shipping.
  2.  **Webhook**: 17Track pushes JSON payload to `/tracking/webhook` (Must be Publicly Accessible).
  3.  **Process**: `TrackingService` identifies event (e.g., `InTransit_Arrival`).
  4.  **Trigger**: Updates Order Status & Sends WhatsApp Notification.
- **Backup Flow (Poll)**:
  -   Cron job (every 3h) to sync stale orders.

### 3. Order Confirmation Workflow (Twilio WhatsApp & Voice)
- **Pattern**: Deterministic State Machine with Escalation
- **Data Requirement**: `Customer.phone` must be in E.164 format.
- **Trigger**: Order remains `Pending` and needs confirmation.
- **Logic**:
  1.  **Phase 1 (SMS/WA)**: Send Pre-Call SMS ("We will call you in 8 seconds to confirm").
  2.  **Phase 2 (Voice)**: Twilio dials number (`MAX_ATTEMPTS=1`).
  3.  **Result Handling**:
      -   **Confirmed/Declined**: Update `confirmationStatus` and trigger financial/inventory logic.
      -   **No Answer**: Set `confirmationStatus` to "No Answer" immediately after 1 attempt.
      -   **Unclear/Hung Up**: Forward to "Call Center" for manual human review.

### 4. Risk Orchestration Workflow (Version 2)
- **Pattern**: Orchestrator / SAGA
- **Flow**:
  1.  **New Order** arrives.
  2.  **Validation**: Check Phone format & Address existnece (3rd party API).
  3.  **Risk Calculation**:
      -   **Low Risk**: Wait 2h -> Send WhatsApp Confirmation -> If no reply, trigger IVR.
      -   **Medium Risk**: Add to "Manual Review" Sheet (Google Sheets).
      -   **High Risk**: Add to "Priority Call" Sheet.
  4.  **Feedback Sync**: Call Center updates status in Sheet (e.g., "Confirm", "Fake") -> Syncs back to App.

### 5. Deployment Architecture
- **Platform**: Railway (PaaS)
- **Frontend**: Vite SPA (Static) on Nginx.
- **Backend**: NestJS API container.
- **Data**: Supabase (PostgreSQL).
- **External**: Twilio (WhatsApp), 17Track (Webhooks), Google Sheets API.

### 6. Google Sheets Integration (OD Data Sync)
- **Pattern**: External Data Synchronization
- **Credentials**: Stored in `StoreSettings` table (Encrypted).
- **Flow**:
  1.  **Configure**: User inputs Spreadsheet ID & Credentials JSON in Settings.
  2.  **Sync**: Backend service uses `google-spreadsheet` library/API to fetch rows.
  3.  **Map**: Maps Sheet columns to `Order` entity fields.
  4.  **Upsert**: Creates new orders or updates existing ones based on Order ID.

### 7. Data Schema Design (Core Entities)
- **Users**: Admin accounts (email, password_hash, role)
- **Orders**: Full lifecycle (Pending to Returned), tracking numbers, costs, and profits.
- **Products**: Inventory levels, unit costs, selling prices, and return rates.
- **FulfillmentCenters**: Logistics hubs, capacity, linked orders.
- **Suppliers**: Sourcing partners, linked purchase orders.
- **Purchases**: Stock replenishment, linked to Suppliers & Fulfillment Centers.
- **Purchases**: Stock replenishment, linked to Suppliers & Fulfillment Centers.
- **StoreSettings**: Configuration for multi-store management and Google Sheets credentials.
- **Financials**: COD collections, profit calculations, and payout tracking.

### 6. Profit & Revenue Calculation (Event-Driven)
- **Pattern**: Observer / Event Subscriber
- **Trigger**: Order Status Changes (`Confirmed`, `Delivered`)
- **Action**: Calculate and persist financial metrics via `ProfitsService`.
- **Logic**:
  - `Confirmed` -> Calculate **Revenue** (Order Total) & **COGS** (Sum of `unit_cost` + `shipping_cost` + `tax_amount`).
  - `Delivered` -> Calculate **COD Collected** (Realized Cash).
  - **Profit Definition**: `Gross Profit = Revenue - COGS - [Outbound Shipping Cost]`.
  - Update `ProfitCalculation` table.

### 7. Unified Order Timeline (Frontend)
- **Pattern**: Multi-source Chronological Merge
- **Implementation**:
  - Combines `trackingHistory`, `customerResponses`, and `callLogs` into a single descending list.
  - **Deduplication Logic**: Filters out tracking updates with the same status/substatus/description occurring within a 5-minute window (prevents UI noise from redundant 17Track pushes).
  - **Status Logic**: Uses color-coded icons (Red/Green/Yellow) to indicate call success or failure states.

## Naming Conventions
- **Files**: PascalCase for React components (`MyComponent.tsx`), camelCase for utilities (`myUtility.ts`).
- **CSS**: Utility classes via Tailwind CSS.
