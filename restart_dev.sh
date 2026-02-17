#!/bin/bash

# Kill any process running on port 3000 (Backend)
echo "Stopping backend on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Kill any process running on port 5173 (Frontend)
echo "Stopping frontend on port 5173..."
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Wait a moment
sleep 2

# Start Backend
echo "Starting Backend..."
cd backend
nohup npm run start:dev > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID $BACKEND_PID"

# Go back to root
cd ..

# Start Frontend
echo "Starting Frontend..."
nohup npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started with PID $FRONTEND_PID"

echo "------------------------------------------------"
echo "Backend logging to: backend.log"
echo "Frontend logging to: frontend.log"
echo "Access Backend at: http://localhost:3000"
echo "Access Frontend at: http://localhost:5173"
echo "------------------------------------------------"
