# Technical Context

## Technology Stack

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite
- **Language**: TypeScript
- **Routing**: React Router v7
- **Styling**: Tailwind CSS (Corporate light theme design system with standardized tokens replacing hardcoded utilities)
- **Icons**: Material Symbols Outlined, Lucide React
- **Stats/Charts**: Recharts
- **HTTP Client**: Axios (custom wrapper with Interceptors)
- **State Management**: React Context / Hooks
- **Data Tables**: Custom implementations with Bulk Select support.

### Backend (Verified Stack)
- **Runtime**: Node.js
- **Framework**: NestJS
- **Database**: Supabase (PostgreSQL Managed)
- **ORM**: Prisma v7
- **Auth**: Passport.js (JWT) + bcrypt
- **API**: REST (Fully implemented for Orders, Customers, Products, Fulfillment, Suppliers, Purchases, Tickets, Notifications, Risk Scoring, Ads Campaigns, Analytics)
- **Scheduling**: `@nestjs/schedule` (Cron-based jobs for Loqate retry, SLA breach checks, undelivered order sync, Twilio call scheduling)
- **Validation**: class-validator / class-transformer (DTOs)

### External Services
- **Shipment Tracking**: 17Track v2.2 API (Webhook Listener Active + Polling Backup)
- **Notifications**: Twilio (WhatsApp Business API, Voice API with Auth/AMD, SMS — Active)
- **Data Sync**: Google Sheets API (via `google-spreadsheet` library)
- **Address Verification**: Loqate API (with in-memory caching & retry cron)
- **E-commerce**: Shopify (Inbound Order Webhooks)

## Configuration & Environment Variables
To enable these features, the following credentials are required in the `.env` file:

### 1. Twilio (WhatsApp / SMS / Voice)
- `TWILIO_ACCOUNT_SID`: Account Service ID
- `TWILIO_AUTH_TOKEN`: Authentication Token
- `TWILIO_WHATSAPP_NUMBER`: Sending number (e.g., `whatsapp:+14155238886`)
- `TWILIO_PHONE_NUMBER`: SMS/Voice number (E.164 format)

### 2. 17Track (Tracking)
- `TRACK17_API_KEY`: API Key for Shipment tracking

### 3. Loqate (Address Verification)
- `LOQATE_API_KEY`: API Key for address verification (optional — falls back to regex validation without it)

### 4. Backend Specifics
- `APP_URL`: Base URL for the production API.
- `SUPABASE_URL`: Supabase project URL for client-side integration.

### 5. Database (Supabase)
- `DATABASE_URL`: Prisma connection string
- `JWT_SECRET`: Secret key for signing tokens

### DevOps & Tools
- **Package Manager**: npm
- **Hosting/PaaS**: Railway (Production)
- **Containerization**: Docker (Frontend & Backend)
- **Optimization**: `.railwayignore` and `.gitignore` exclude `backend/.wwebjs_auth` (WhatsApp cache) to speed up builds and prevent session conflicts.

## Development Environment
- **Local Dev Server**: Vite (Frontend), NestJS (Backend)
- **Linting/Formatting**: ESLint, Prettier (Standard configuration recommended)

## Key Dependencies
- `react`, `react-dom`
- `react-router-dom`
- `recharts`
- `lucide-react`
- `@nestjs/core`, `@nestjs/common`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/schedule`
- `@prisma/client`, `passport-jwt`, `bcrypt`
- `google-spreadsheet`, `google-auth-library`
- `twilio`
- `class-validator`, `class-transformer`

## Backend Module Directory (`backend/src/`)
| Module | Description |
|---|---|
| `address-verify/` | Loqate API integration for postal code + house number validation |
| `ads-campaigns/` | Ads performance data CRUD |
| `analytics/` | Analytics and reporting endpoints |
| `auth/` | JWT authentication, Passport strategies |
| `customers/` | Customer CRUD and profile management |
| `exchange-rates/` | Currency conversion service for multi-currency transactions |
| `financial-records/` | Bulk Excel import parsing, transaction logging, P&L module, and payment source tracking |
| `fulfillment-centers/` | Fulfillment center management, tied deeply to SKUs |
| `google-sheets/` | Two-way Google Sheets sync for orders + call center queue |
| `inventory/` | Inventory tracking and stock levels via an 8-state machine, purchase PO float syncing |
| `notifications/` | SMS/WhatsApp delivery service, WhatsApp Personal (wwebjs), Twilio callbacks |
| `orders/` | Order CRUD, status management, CSV import, UTM and tracking auto-detection workflows |
| `prisma/` | Prisma client service |
| `products/` | Product catalog management, handling Parent-Child SKU hierarchy resolution |
| `profits/` | Financial calculations and profit tracking |
| `purchases/` | Purchase order management |
| `risk-scoring/` | Two-layer risk assessment + Loqate retry cron + tiered call script resolutions |
| `scripts/` | Utility and migration scripts |
| `store-settings/` | Multi-store configuration, webhooks, and credentials |
| `suppliers/` | Supplier management |
| `tickets/` | Incident tickets, auto-create from 17Track, SLA, workflows, sheets sync |
| `tracking/` | 17Track webhook handler, carrier regex classification, tracking history CRUD |
| `twilio-voice/` | Voice call service, call scheduler cron, pre-call SMS, AMD handling |
| `users/` | User management |
| `webhooks/shopify/` | Shopify inbound order payload processing (extrapolating IP + UTM parameters) |
