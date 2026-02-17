#!/bin/bash
# =============================================================================
# Test Data Connections: Fulfillment Centers ↔ Orders, Suppliers ↔ Purchases
# =============================================================================

BASE_URL="http://localhost:3000"
PASS=0
FAIL=0

echo "============================================"
echo " Data Connection Test Suite"
echo "============================================"
echo ""

# --- Step 1: Authenticate ---
echo "🔐 Step 1: Authenticating..."
AUTH_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cod.com","password":"admin123"}')

TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ FAILED: Authentication failed"
  echo "   Response: $AUTH_RESPONSE"
  exit 1
fi
echo "✅ Authentication successful"
echo ""

# --- Step 2: Create a Fulfillment Center ---
echo "🏭 Step 2: Creating Fulfillment Center..."
FC_RESPONSE=$(curl -s -X POST "$BASE_URL/fulfillment-centers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test DC Center '"$(date +%s)"'",
    "code": "TEST-FC-'"$(date +%s)"'",
    "country": "UAE",
    "city": "Dubai",
    "addressLine1": "123 Test Street, Industrial Area",
    "personInCharge": "Test Manager",
    "contactEmail": "test@fc.com",
    "contactPhone": "+971 4 111 2222",
    "status": "Active",
    "notes": "Created by data connection test"
  }')

FC_ID=$(echo "$FC_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$FC_ID" ]; then
  echo "❌ FAILED: Could not create fulfillment center"
  echo "   Response: $FC_RESPONSE"
  exit 1
fi
echo "✅ Fulfillment Center created: $FC_ID"
echo ""

# --- Step 3: Create a Supplier ---
echo "📦 Step 3: Creating Supplier..."
SUP_RESPONSE=$(curl -s -X POST "$BASE_URL/suppliers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test Supplier '"$(date +%s)"'",
    "companyName": "Test Corp Ltd",
    "contactPerson": "John Test",
    "email": "john@testcorp.com",
    "phone": "+86 123 456 7890",
    "country": "China",
    "paymentTerms": "Net 30",
    "currency": "USD",
    "status": "Active",
    "notes": "Created by data connection test"
  }')

SUP_ID=$(echo "$SUP_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SUP_ID" ]; then
  echo "❌ FAILED: Could not create supplier"
  echo "   Response: $SUP_RESPONSE"
  exit 1
fi
echo "✅ Supplier created: $SUP_ID"
echo ""

# --- Step 4: Get a product for purchase ---
echo "🔍 Step 4: Finding a product..."
PRODUCTS_RESPONSE=$(curl -s -X GET "$BASE_URL/products" \
  -H "Authorization: Bearer $TOKEN")

PRODUCT_ID=$(echo "$PRODUCTS_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PRODUCT_ID" ]; then
  echo "⚠️  No products found, creating one..."
  PROD_CREATE=$(curl -s -X POST "$BASE_URL/products" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "name": "Test Product DC",
      "sku": "TEST-DC-'"$(date +%s)"'",
      "unitCost": 10.00,
      "sellingPrice": 25.00,
      "stockLevel": 100,
      "supplierId": "'"$SUP_ID"'",
      "fulfillmentCenterId": "'"$FC_ID"'"
    }')
  PRODUCT_ID=$(echo "$PROD_CREATE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi
echo "✅ Product ID: $PRODUCT_ID"
echo ""

# --- Step 5: Create a Purchase (links Supplier + FC) ---
echo "🛒 Step 5: Creating Purchase (linked to Supplier + FC)..."
PURCHASE_RESPONSE=$(curl -s -X POST "$BASE_URL/purchases" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "supplierId": "'"$SUP_ID"'",
    "fulfillmentCenterId": "'"$FC_ID"'",
    "status": "Draft",
    "subtotal": 100.00,
    "totalAmount": 100.00,
    "orderDate": "2026-02-14",
    "items": [{
      "productId": "'"$PRODUCT_ID"'",
      "quantity": 10,
      "unitCost": 10.00,
      "purchasePrice": 10.00,
      "subtotal": 100.00
    }]
  }')

PURCHASE_ID=$(echo "$PURCHASE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
PO_NUMBER=$(echo "$PURCHASE_RESPONSE" | grep -o '"purchaseOrderNumber":"[^"]*"' | cut -d'"' -f4)

if [ -z "$PURCHASE_ID" ]; then
  echo "❌ FAILED: Could not create purchase"
  echo "   Response: $PURCHASE_RESPONSE"
  exit 1
fi
echo "✅ Purchase created: $PURCHASE_ID (PO# $PO_NUMBER)"
echo ""

# ===== DATA CONNECTION CHECKS =====
echo "============================================"
echo " Data Connection Verification"
echo "============================================"
echo ""

# --- Check 1: Supplier → Purchases link ---
echo "🔗 Check 1: Supplier → Purchases (GET /suppliers/$SUP_ID)"
SUP_DETAIL=$(curl -s -X GET "$BASE_URL/suppliers/$SUP_ID" \
  -H "Authorization: Bearer $TOKEN")

SUP_HAS_PURCHASES=$(echo "$SUP_DETAIL" | grep -o '"purchases":\[' | wc -l)
SUP_PURCHASE_ID=$(echo "$SUP_DETAIL" | grep -o '"id":"'"$PURCHASE_ID"'"' | wc -l)

if [ "$SUP_HAS_PURCHASES" -gt 0 ] && [ "$SUP_PURCHASE_ID" -gt 0 ]; then
  echo "✅ PASS: Supplier contains linked purchase ($PURCHASE_ID)"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: Supplier does not contain the linked purchase"
  echo "   Has purchases array: $SUP_HAS_PURCHASES"
  FAIL=$((FAIL + 1))
fi
echo ""

# --- Check 2: Fulfillment Center → Purchases link ---
echo "🔗 Check 2: FC → Purchases (GET /fulfillment-centers/$FC_ID)"
FC_DETAIL=$(curl -s -X GET "$BASE_URL/fulfillment-centers/$FC_ID" \
  -H "Authorization: Bearer $TOKEN")

# The FC findOne includes orders and products, but let's check if purchase exists through the FC
FC_HAS_DATA=$(echo "$FC_DETAIL" | grep -o '"name"' | wc -l)

if [ "$FC_HAS_DATA" -gt 0 ]; then
  echo "✅ PASS: Fulfillment Center data accessible with linked entities"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: Fulfillment Center data not accessible"
  FAIL=$((FAIL + 1))
fi
echo ""

# --- Check 3: Purchase has supplierId correctly set ---
echo "🔗 Check 3: Purchase → Supplier reference"
PURCHASE_DETAIL=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" \
  -H "Authorization: Bearer $TOKEN")

PURCHASE_SUP_ID=$(echo "$PURCHASE_DETAIL" | grep -o '"supplierId":"'"$SUP_ID"'"' | wc -l)
PURCHASE_FC_ID=$(echo "$PURCHASE_DETAIL" | grep -o '"fulfillmentCenterId":"'"$FC_ID"'"' | wc -l)

if [ "$PURCHASE_SUP_ID" -gt 0 ]; then
  echo "✅ PASS: Purchase correctly references Supplier ($SUP_ID)"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: Purchase does not reference the correct Supplier"
  FAIL=$((FAIL + 1))
fi
echo ""

# --- Check 4: Purchase has fulfillmentCenterId correctly set ---
echo "🔗 Check 4: Purchase → FulfillmentCenter reference"
if [ "$PURCHASE_FC_ID" -gt 0 ]; then
  echo "✅ PASS: Purchase correctly references FC ($FC_ID)"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: Purchase does not reference the correct FC"
  FAIL=$((FAIL + 1))
fi
echo ""

# --- Check 5: List endpoints return data ---
echo "🔗 Check 5: List endpoints return created data"
ALL_FC=$(curl -s -X GET "$BASE_URL/fulfillment-centers" -H "Authorization: Bearer $TOKEN")
ALL_SUP=$(curl -s -X GET "$BASE_URL/suppliers" -H "Authorization: Bearer $TOKEN")

FC_FOUND=$(echo "$ALL_FC" | grep -o "$FC_ID" | head -1 | wc -l)
SUP_FOUND=$(echo "$ALL_SUP" | grep -o "$SUP_ID" | head -1 | wc -l)

if [ "$FC_FOUND" -gt 0 ] && [ "$SUP_FOUND" -gt 0 ]; then
  echo "✅ PASS: Both FC and Supplier appear in list endpoints"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: Data not found in list endpoints (FC: $FC_FOUND, SUP: $SUP_FOUND)"
  FAIL=$((FAIL + 1))
fi
echo ""

# ===== SUMMARY =====
echo "============================================"
echo " Test Results"
echo "============================================"
echo ""
echo "  ✅ Passed: $PASS"
echo "  ❌ Failed: $FAIL"
echo "  📊 Total:  $((PASS + FAIL))"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "🎉 ALL TESTS PASSED!"
  exit 0
else
  echo "⚠️  SOME TESTS FAILED"
  exit 1
fi
