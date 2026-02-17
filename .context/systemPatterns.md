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
  2.  **Webhook**: 17Track pushes JSON payload to `/tracking/webhook`.
  3.  **Process**: `TrackingService` identifies event (e.g., `InTransit_Arrival`).
  4.  **Trigger**: Updates Order Status & Sends WhatsApp Notification.
- **Backup Flow (Poll)**:
  -   Cron job (every 3h) to sync stale orders.

### 3. WhatsApp Notification Workflow (Twilio)
- **Pattern**: Event-Driven / State Machine
- **Trigger**: Order Status changes to `In Transit`.
- **Action**: Send WhatsApp message via Twilio.
- **Feedback Loop**:
  -   Wait 24h for customer response ("YES" to confirm availability).
  -   **Yes**: No further action.
  -   **No Response**: Flag for manual follow-up (Phone Call).

### 4. Google Sheets Integration (OD Data Sync)
- **Pattern**: External Data Synchronization
- **Credentials**: Stored in `StoreSettings` table (Encrypted).
- **Flow**:
  1.  **Configure**: User inputs Spreadsheet ID & Credentials JSON in Settings.
  2.  **Sync**: Backend service uses `google-spreadsheet` library/API to fetch rows.
  3.  **Map**: Maps Sheet columns to `Order` entity fields.
  4.  **Upsert**: Creates new orders or updates existing ones based on Order ID.

### 5. Data Schema Design (Core Entities)
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

## Naming Conventions
- **Files**: PascalCase for React components (`MyComponent.tsx`), camelCase for utilities (`myUtility.ts`).
- **CSS**: Utility classes via Tailwind CSS.
