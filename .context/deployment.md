# Deployment Strategy & Guide

## Status: Deployed on Railway (Production) 🚀
**Date:** 2026-02-18
**Production URL:** `https://steadfast-truth-production.up.railway.app` (Frontend)
**Backend URL:** `https://od-admin-operations-executive-suite-production.up.railway.app`
**Database:** Supabase PostgreSQL (✅ Connected)

## Configuration Updates
- **Frontend**: Deployed with `VITE_API_URL` pointing to Railway Backend.
- **Backend**: Configured with `ALLOWED_ORIGINS` to accept requests from Frontend.
- **Webhooks**: 17Track Webhook is Public/Open at `/tracking/webhook`.

## Objective
Deploy the COD Admin Dashboard to a production-like cloud environment for internal testing.

## Deployment History
### 1. Railway (PaaS) - **Executed**
- **Status**: ✅ Deployed & Active.
- **Service 1 (Backend)**: NestJS, Node 18, Dockerfile.
- **Service 2 (Frontend)**: Vite, Nginx/Serve, Dockerfile.

## Critical Checklist (Verified)
1.  **Environment Variables**:
    -   `VITE_API_URL`: Set on Frontend service.
    -   `ALLOWED_ORIGINS`: Set on Backend service.
    -   `JWT_SECRET`: Defaulting (should be set in prod).
2.  **Database**: ✅ Supabase connected.
3.  **Security**:
    -   ✅ CORS configured for Frontend URL.
    -   ✅ Webhook endpoint public (intentional).

## Next Steps
1. ✅ **Generate Priority 1 & 2 API Resources** - **COMPLETED**
2. ✅ **Frontend API Client Infrastructure** - **COMPLETED**
3. ✅ **Frontend Service Integration** - **COMPLETED**
4. ✅ **Integration**: Replace mock data for Customers Page & Settings Page
5. ✅ **Advanced Features**: 17Track API (Webhook) and Twilio (Template)
6. ✅ **Perform Deployment**: Deployed to Railway.
