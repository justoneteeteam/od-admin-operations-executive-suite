#!/bin/bash

# Debug Script: Inspect DB State & Dashboard API

BASE_URL="http://localhost:3000"

echo "========================================="
echo "Debug: Inventory & Dashboard"
echo "========================================="
echo ""

# 1. Authenticate
LOGIN_RES=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@cod.com","password":"admin123"}' \
  "$BASE_URL/auth/login")

TOKEN=$(echo $LOGIN_RES | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$TOKEN" ]]; then
    echo "❌ Authentication Failed"
    exit 1
fi

# 2. Check Product Count via API
echo "Checking Products API..."
PRODUCTS_RES=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/products")
echo "$PRODUCTS_RES" | python3 -c "import sys,json; data=json.load(sys.stdin); print(f'Products Found: {len(data)}' if isinstance(data, list) else 'Response not a list')"

# 3. Check Inventory Levels via API (Stock)
echo "Checking Inventory Stock API..."
STOCK_RES=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/inventory/stock")
echo "$STOCK_RES" | python3 -c "import sys,json; data=json.load(sys.stdin); print(f'Stock Items Found: {len(data)}' if isinstance(data, list) else 'Response not a list')"

# 4. Check Dashboard Metrics API
echo "Checking Dashboard Metrics API..."
DASH_RES=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/inventory/dashboard")
echo "Dashboard Response:"
echo "$DASH_RES" | python3 -m json.tool

# 5. Check Warehouses
echo "Checking Warehouses..."
WH_RES=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/inventory/warehouses")
echo "$WH_RES" | python3 -m json.tool
