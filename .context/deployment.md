# Deployment Strategy & Guide

## Status: Deployed on Railway (Production) 🚀
**Date:** 2026-02-18 (Initial), Last Updated: 2026-03-11
**Production URL:** `https://steadfast-truth-production.up.railway.app` (Frontend)
**Backend URL:** `https://od-admin-operations-executive-suite-production.up.railway.app`
**Database:** Supabase PostgreSQL (✅ Connected)

## Configuration Updates
- **Frontend**: Deployed with `VITE_API_URL` pointing to Railway Backend.
- **Backend**: Configured with `ALLOWED_ORIGINS` to accept requests from Frontend.
- **Webhooks**:
  - 17Track Webhook is Public/Open at `/tracking/webhook`.
  - Shopify Webhooks at `/webhooks/shopify/orders`.
  - Twilio Status Callbacks at `/api/notifications/callbacks/twilio`.

## Objective
Deploy the COD Admin Dashboard to a production-like cloud environment for internal testing.

## Deployment History
### 1. Railway (PaaS) - **Executed**
- **Status**: ✅ Deployed & Active.
- **Service 1 (Backend)**: NestJS, Node 18, Dockerfile.
- **Service 2 (Frontend)**: Vite, Nginx/Serve, Dockerfile.

### 2. Repo Optimization (Cleanup) - **Executed**
- **Status**: ✅ Configured.
- **Action**: Added `.railwayignore` and `.gitignore` to exclude `backend/.wwebjs_auth`.
- **Impact**: Deployment time reduced; prevents session conflicts for WhatsApp Personal.

## Critical Checklist (Verified)
1.  **Environment Variables**:
    -   `VITE_API_URL`: Set on Frontend service.
    -   `ALLOWED_ORIGINS`: Set on Backend service.
    -   `JWT_SECRET`: Should be set in prod (not defaulting).
    -   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`: Required for SMS/Voice.
    -   `TRACK17_API_KEY`: Required for tracking registration.
    -   `LOQATE_API_KEY`: Optional (falls back to regex without it).
2.  **Database**: ✅ Supabase connected.
3.  **Security**:
    -   ✅ CORS configured for Frontend URL.
    -   ✅ Webhook endpoints public (intentional for 17Track, Shopify, Twilio callbacks).
4.  **Cron Jobs Active**:
    -   Loqate retry (every 6h), Loqate cache purge (daily).
    -   SLA breach checker (every 15 min).
    -   Undelivered order ticket sync (hourly).
    -   Twilio call scheduler (cron-based).
    -   17Track polling (every 3h backup).

## Completed Milestones
1. ✅ **Generate Priority 1 & 2 API Resources**
2. ✅ **Frontend API Client Infrastructure**
3. ✅ **Frontend Service Integration**
4. ✅ **Integration**: Replace mock data for Customers Page & Settings Page
5. ✅ **Advanced Features**: 17Track API (Webhook) and Twilio (Template)
6. ✅ **Perform Deployment**: Deployed to Railway
7. ✅ **Risk Scoring Engine**: Two-layer scoring with Loqate
8. ✅ **Incident Management**: Auto-tickets, SLA, resolution workflows
9. ✅ **Shopify Webhooks**: Inbound order processing
10. ✅ **CRM Refactoring**: Migrated to corporate light theme and hierarchical sidebar
11. ✅ **Advanced Analytics**: Geo Distribution Reports and Performance Page
