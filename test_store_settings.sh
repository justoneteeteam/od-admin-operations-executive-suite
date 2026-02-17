#!/bin/bash
# =============================================================================
# Test Store Settings CRUD API
# =============================================================================

BASE_URL="http://localhost:3000"
PASS=0
FAIL=0

echo "============================================"
echo " Store Settings Test Suite"
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

# --- Step 2: Create Store Settings ---
echo "🏪 Step 2: Creating Store Settings..."
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/store-settings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "storeName": "Test Store '"$(date +%s)"'",
    "storeUrl": "https://teststore.ae",
    "supportEmail": "support@teststore.ae",
    "currency": "AED",
    "gsProjectId": "test-project-123",
    "gsClientEmail": "test@test-project-123.iam.gserviceaccount.com",
    "gsPrivateKey": "-----BEGIN PRIVATE KEY-----\nTEST_KEY\n-----END PRIVATE KEY-----",
    "gsSpreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjGMUWqTGk_test",
    "gsSheetName": "Orders"
  }')

STORE_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$STORE_ID" ]; then
  echo "❌ FAILED: Could not create store settings"
  echo "   Response: $CREATE_RESPONSE"
  exit 1
fi
echo "✅ Store created: $STORE_ID"
PASS=$((PASS + 1))
echo ""

# --- Step 3: Get Store Settings by ID ---
echo "📋 Step 3: Fetching Store by ID..."
GET_RESPONSE=$(curl -s -X GET "$BASE_URL/store-settings/$STORE_ID" \
  -H "Authorization: Bearer $TOKEN")

GET_NAME=$(echo "$GET_RESPONSE" | grep -o '"storeName":"[^"]*"' | cut -d'"' -f4)
GET_SHEET=$(echo "$GET_RESPONSE" | grep -o '"gsSpreadsheetId":"[^"]*"' | cut -d'"' -f4)

if [ -n "$GET_NAME" ] && [ -n "$GET_SHEET" ]; then
  echo "✅ PASS: Store fetched — Name: $GET_NAME, Spreadsheet: $GET_SHEET"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: Could not fetch store data"
  FAIL=$((FAIL + 1))
fi
echo ""

# --- Step 4: List All Stores ---
echo "📋 Step 4: Listing all stores..."
LIST_RESPONSE=$(curl -s -X GET "$BASE_URL/store-settings" \
  -H "Authorization: Bearer $TOKEN")

LIST_FOUND=$(echo "$LIST_RESPONSE" | grep -o "$STORE_ID" | head -1 | wc -l)

if [ "$LIST_FOUND" -gt 0 ]; then
  echo "✅ PASS: Store appears in list"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: Store not in list"
  FAIL=$((FAIL + 1))
fi
echo ""

# --- Step 5: Get Store Names (for dropdown) ---
echo "🔽 Step 5: Fetching store names for dropdown..."
NAMES_RESPONSE=$(curl -s -X GET "$BASE_URL/store-settings/store-names" \
  -H "Authorization: Bearer $TOKEN")

NAMES_FOUND=$(echo "$NAMES_RESPONSE" | grep -o '"storeName"' | wc -l)

if [ "$NAMES_FOUND" -gt 0 ]; then
  echo "✅ PASS: Store names returned ($NAMES_FOUND entries)"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: No store names returned"
  FAIL=$((FAIL + 1))
fi
echo ""

# --- Step 6: Update Store Settings ---
echo "✏️  Step 6: Updating store settings..."
UPDATE_RESPONSE=$(curl -s -X PUT "$BASE_URL/store-settings/$STORE_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "storeName": "Updated Store Name",
    "gsSheetName": "Orders 2026"
  }')

UPDATED_NAME=$(echo "$UPDATE_RESPONSE" | grep -o '"storeName":"[^"]*"' | cut -d'"' -f4)

if [ "$UPDATED_NAME" = "Updated Store Name" ]; then
  echo "✅ PASS: Store updated — New name: $UPDATED_NAME"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: Store name not updated (got: $UPDATED_NAME)"
  FAIL=$((FAIL + 1))
fi
echo ""

# --- Step 7: Delete Store ---
echo "🗑️  Step 7: Deleting store..."
DELETE_RESPONSE=$(curl -s -X DELETE "$BASE_URL/store-settings/$STORE_ID" \
  -H "Authorization: Bearer $TOKEN")

VERIFY_DELETE=$(curl -s -X GET "$BASE_URL/store-settings/$STORE_ID" \
  -H "Authorization: Bearer $TOKEN")

if echo "$VERIFY_DELETE" | grep -q "null\|Not Found\|error\|{}" ; then
  echo "✅ PASS: Store deleted successfully"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: Store may not be deleted"
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
