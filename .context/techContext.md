# Technical Context

## Technology Stack

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite
- **Language**: TypeScript
- **Routing**: React Router v7
- **Styling**: Tailwind CSS (Utility-first CSS framework)
- **Icons**: Material Symbols Outlined
- **Stats/Charts**: Recharts
- **HTTP Client**: Axios (custom wrapper with Interceptors)
- **State Management**: React Context / Hooks

### External Services
- **Shipment Tracking**: 17Track API (Webhook Listener Active)
- **Notifications**: Twilio (WhatsApp Business API - Template Messaging Active)
- **Data Sync**: Google Sheets API (via generic HTTP or client library)
- **Scheduling**: Node-cron (for periodic sync jobs)

## Configuration & Environment Variables
To enable these features, the following credentials are required in the `.env` file:

### 1. Twilio (WhatsApp)
- `TWILIO_ACCOUNT_SID`: Account Service ID
- `TWILIO_AUTH_TOKEN`: Authentication Token
- `TWILIO_WHATSAPP_NUMBER`: Sending number (e.g., `whatsapp:+14155238886`)

### 2. 17Track (Tracking)
- `TRACK17_API_KEY`: API Key for Shipment tracking

### 3. Database (Supabase)
- `DATABASE_URL`: Prisma connection string
- `JWT_SECRET`: Secret key for signing tokens

### Backend (Verified Stack)
- **Runtime**: Node.js
- **Framework**: NestJS
- **Database**: Supabase (PostgreSQL Managed)
- **ORM**: Prisma v7
- **Auth**: Passport.js (JWT) + bcrypt
- **API**: REST (Fully implemented for Orders, Customers, Products, Fulfillment, Suppliers, Purchases)

### DevOps & Tools
- **Package Manager**: npm

## Development Environment
- **Local Dev Server**: Vite (Frontend), NestJS (Backend)
- **Linting/Formatting**: ESLint, Prettier (Standard configuration recommended)

## Key Dependencies
- `react`, `react-dom`
- `react-router-dom`
- `recharts`
- `lucide-react`
- `@nestjs/core`, `@nestjs/common`, `@nestjs/jwt`, `@nestjs/passport`
- `@prisma/client`, `passport-jwt`, `bcrypt`
- `google-spreadsheet`, `google-auth-library`
