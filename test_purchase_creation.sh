#!/bin/bash

# Test Purchase Creation - User Simulation
# This script tests the purchase creation endpoint as a logged-in user

BASE_URL="http://localhost:3000"

echo "========================================="
echo "Purchase Creation Test - User Simulation"
echo "========================================="
echo ""

# Step 1: Authenticate
echo "Step 1: Authenticating as admin..."
LOGIN_RES=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@cod.com","password":"admin123"}' \
  "$BASE_URL/auth/login")

TOKEN=$(echo $LOGIN_RES | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$TOKEN" ]]; then
    echo "❌ Authentication Failed"
    echo "Response: $LOGIN_RES"
    exit 1
fi

echo "✅ Authenticated successfully"
echo ""

# Step 2: Fetch available suppliers
echo "Step 2: Fetching suppliers..."
SUPPLIERS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/suppliers")
SUPPLIER_ID=$(echo $SUPPLIERS | python3 -c "import sys,json; data=json.load(sys.stdin); print(data['data'][0]['id'] if isinstance(data,dict) and 'data' in data else data[0]['id'] if isinstance(data,list) and len(data)>0 else '')" 2>/dev/null)

if [[ -z "$SUPPLIER_ID" ]]; then
    echo "❌ No suppliers found"
    exit 1
fi

echo "✅ Found supplier: $SUPPLIER_ID"
echo ""

# Step 3: Fetch available fulfillment centers
echo "Step 3: Fetching fulfillment centers..."
CENTERS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/fulfillment-centers")
FC_ID=$(echo $CENTERS | python3 -c "import sys,json; data=json.load(sys.stdin); print(data['data'][0]['id'] if isinstance(data,dict) and 'data' in data else data[0]['id'] if isinstance(data,list) and len(data)>0 else '')" 2>/dev/null)

if [[ -z "$FC_ID" ]]; then
    echo "❌ No fulfillment centers found"
    exit 1
fi

echo "✅ Found fulfillment center: $FC_ID"
echo ""

# Step 4: Fetch available products
echo "Step 4: Fetching products..."
PRODUCTS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/products")
PRODUCT_ID=$(echo $PRODUCTS | python3 -c "import sys,json; data=json.load(sys.stdin); print(data[0]['id'] if isinstance(data,list) and len(data)>0 else '')" 2>/dev/null)

if [[ -z "$PRODUCT_ID" ]]; then
    echo "❌ No products found"
    exit 1
fi

echo "✅ Found product: $PRODUCT_ID"
echo ""

# Step 5: Create purchase order
echo "Step 5: Creating purchase order..."
echo ""

PURCHASE_PAYLOAD=$(cat <<EOF
{
  "supplierId": "$SUPPLIER_ID",
  "fulfillmentCenterId": "$FC_ID",
  "orderDate": "$(date +%Y-%m-%d)",
  "status": "Draft",
  "subtotal": 450,
  "totalAmount": 500,
  "taxAmount": 50,
  "shippingCost": 0,
  "paymentTerms": "Net 30",
  "notes": "Test purchase order created via automated test",
  "items": [
    {
      "productId": "$PRODUCT_ID",
      "quantity": 10,
      "unitCost": 45,
      "purchasePrice": 50,
      "taxPercent": 10,
      "taxAmount": 50,
      "discountPercent": 0,
      "discountAmount": 0
    }
  ]
}
EOF
)

echo "Payload:"
echo "$PURCHASE_PAYLOAD" | python3 -m json.tool
echo ""

CREATE_RES=$(curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$PURCHASE_PAYLOAD" \
  "$BASE_URL/purchases")

echo "Response:"
echo "$CREATE_RES" | python3 -m json.tool
echo ""

# Check if purchase was created
PURCHASE_ID=$(echo $CREATE_RES | python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('id', ''))" 2>/dev/null)

if [[ -z "$PURCHASE_ID" ]]; then
    echo "❌ Purchase creation failed"
    exit 1
fi

echo "✅ Purchase created successfully!"
echo "   Purchase ID: $PURCHASE_ID"
echo ""

# Step 6: Verify the created purchase
echo "Step 6: Verifying created purchase..."
VERIFY_RES=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/purchases/$PURCHASE_ID")

echo "Purchase details:"
echo "$VERIFY_RES" | python3 -m json.tool
echo ""

# Check if verification succeeded
VERIFIED_ID=$(echo $VERIFY_RES | python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('id', ''))" 2>/dev/null)

if [[ "$VERIFIED_ID" == "$PURCHASE_ID" ]]; then
    echo "✅ Purchase verified successfully!"
else
    echo "❌ Purchase verification failed"
    exit 1
fi

echo ""
echo "========================================="
echo "✅ All tests passed!"
echo "========================================="
