# Deployment Reference: Cloud PaaS (Option 1)

Follow these steps to deploy your application to **Railway.app** or **Render.com**.

## 1. Environment Variables Checklist

Set these in the dashboard of your PaaS provider:

### Backend (NestJS)
| Variable | Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://...` | Your Supabase connection string |
| `JWT_SECRET` | `[generate-a-strong-secret]` | Secret for signing auth tokens |
| `ALLOWED_ORIGINS` | `https://your-frontend-url.com` | URL of your deployed frontend |
| `PORT` | `3000` | (PaaS usually sets this automatically) |
| `TWILIO_...` | From your `.env` | Twilio credentials for WhatsApp |
| `TRACK17_...` | From your `.env` | 17Track API key |

### Frontend (Vite)
| Variable | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://your-backend-url.com` | URL of your deployed backend |

---

## 2. Platform-Specific Settings

### Railway.app
- **Build Command**: `npm run build` (or uses the Dockerfile automatically)
- **Start Command**: `npm run start:prod`
- **Port**: Automatic (listens on `$PORT`)

### Render.com
- **Service Type**: Web Service
- **Environment**: Docker (select the path to `backend/Dockerfile`)
- **Build Command**: `npm run build`
- **Start Command**: `npm run start:prod`

---

## 3. Deployment Steps

1.  **Push Code to GitHub**: Ensure the latest changes are in your repository.
2.  **Create New Service**: In Railway/Render, create a service and connect your GitHub repo.
3.  **Root Directory**: 
    - For Backend: Set the root directory to `backend`.
    - For Frontend: Deploy as a "Static Site" from the root directory.
4.  **Connect Database**: Use the `DATABASE_URL` from your Supabase dashboard.
5.  **Build & Launch**: The platform will automatically build and deploy your app.
