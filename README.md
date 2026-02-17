# COD Admin Operations & Executive Suite

A modern, responsive dashboard for managing Cash on Delivery (COD) e-commerce operations. This application provides a comprehensive suite for tracking orders, inventory, fulfillment, and financial performance.

## 🚀 Project Overview

This project is a **Full-Stack Application** built with React (Vite) and NestJS (Supabase), featuring:

*   **Real-time Dashboard**: Visualizing key performance indicators (Revenue, Net Profit, Orders).
*   **Order Management**: Full CRUD operations for tracking orders from placement to delivery.
*   **Inventory & Products**: Comprehensive management of products, stock levels, and costs.
*   **Customer CRM**: Management of customer profiles and purchase history.
*   **Purchasing & Suppliers**: Workflows for managing suppliers and purchase orders.
*   **Fulfillment Centers**: Monitoring warehouse assignments and shipping capacity.

## 🛠️ Tech Stack

### Frontend
*   **Framework**: [React 19](https://react.dev/)
*   **Build Tool**: [Vite](https://vitejs.dev/)
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS
*   **Charts**: [Recharts](https://recharts.org/)

### Backend
*   **Framework**: [NestJS](https://nestjs.com/)
*   **Database**: Supabase (PostgreSQL)
*   **ORM**: [Prisma](https://www.prisma.io/)
*   **Auth**: JWT (Passport.js)

## 📦 Installation & Setup

### Prerequisites

*   [Node.js](https://nodejs.org/) (Latest LTS recommended)
*   PostgreSQL/Supabase Database

### Running Locally

1.  **Clone the repository**:
    ```bash
    git clone [your-repo-url]
    cd od-admin-operations-executive-suite
    ```

2.  **Setup Backend**:
    ```bash
    cd backend
    npm install
    # Configure your .env with DATABASE_URL and JWT_SECRET
    npm run start:dev
    ```

3.  **Setup Frontend**:
    ```bash
    # From the root directory
    npm install
    npm run dev
    ```

4.  **Open in Browser**:
    Visit `http://localhost:3000`.

## 🚧 Current Status & Roadmap

*   [x] Frontend UI/UX (Completed)
*   [x] Database Schema Deployed (Completed)
*   [x] Backend CRUD APIs (Completed)
*   [x] PaaS Deployment Ready (Completed)
*   [/] **Frontend-Backend Integration** (In Progress)
    *   [x] API Client Infrastructure
    *   [ ] Entity Services
    *   [ ] Replace Mock Data
