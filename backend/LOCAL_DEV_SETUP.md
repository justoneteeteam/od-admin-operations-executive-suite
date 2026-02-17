# Local Development Setup Guide

## Backend Configuration ✅

The NestJS backend is configured for direct Supabase connectivity:

- **Port**: 3000
- **CORS**: Enabled for `http://localhost:5173` (Vite frontend)
- **Auth**: JWT with admin login (`admin@cod.com` / `admin123`)
- **Database**: Direct Supabase PostgreSQL (via `postgresql://` string)

## Running the Backend

### Prerequisites
1. **Database Password**:
   - Ensure your `.env` file contains your actual Supabase database password in the `DATABASE_URL`.
   - The template is: `DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.guovwqrxqqdrtfjwbyzn.supabase.co:5432/postgres"`

2. **Rename Project Folder**:
   - Please rename the folder to `cod-admin-operations-executive-suite` (remove the `&`) to prevent start scripts from crashing.

3. **Install Dependencies** (if not done):
   ```bash
   cd backend
   npm install
   ```

### Start Development Server
```bash
cd backend
npm run start:dev
```

The backend will be available at `http://localhost:3000`.

### Test the Login Endpoint
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cod.com","password":"admin123"}'
```

Expected response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## Environment Variables

The `.env` file contains:
- `DATABASE_URL`: Supabase PostgreSQL connection string
- `JWT_SECRET`: Secret for signing JWT tokens
- External service credentials (Twilio, 17Track)

## Next Steps
- Generate API resources (Orders, Products, Customers)
- Connect frontend to backend API
- Test end-to-end authentication flow
