#!/bin/bash

BASE_URL="http://localhost:3000"

echo "========================================="
echo "Debug: Auth Check"
echo "========================================="

# Try without token
echo "Checking Dashboard Metrics API (No Token)..."
DASH_RES=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/inventory/dashboard")
echo "$DASH_RES"
