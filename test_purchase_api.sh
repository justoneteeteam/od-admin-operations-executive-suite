#!/bin/bash
BASE_URL="http://localhost:3000"

echo "1. Authenticating..."
LOGIN_RES=$(curl -s -X POST -H "Content-Type: application/json" -d '{"email":"admin@cod.com","password":"admin123"}' "$BASE_URL/auth/login")
TOKEN=$(echo $LOGIN_RES | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$TOKEN" ]]; then
    echo "❌ Authentication Failed. Response: $LOGIN_RES"
    exit 1
else
    echo "✅ Authenticated. Token: ${TOKEN:0:10}..."
fi

echo "2. Testing Product Search..."
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/products?search=Pro")
# ... Use token in other requests logic below ...

if [[ $RESPONSE == *"id"* ]]; then
    echo "✅ Product Search Verified."
    PRODUCT_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "Found Product ID: $PRODUCT_ID"
else
    echo "❌ Product Search Failed."
    exit 1
fi

echo "3. Fetching Suppliers..."
SUPPLIERS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/suppliers")
SUPPLIER_ID=$(echo $SUPPLIERS | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -z "$SUPPLIER_ID" ]]; then
   echo "No suppliers found. Creating one..."
   CREATE_SUP_RES=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"name":"Test Supplier","companyName":"Test Co","contactPerson":"John","email":"test@sup.com","phone":"123","country":"US","paymentTerms":"Net 30","status":"Active"}' "$BASE_URL/suppliers")
   SUPPLIER_ID=$(echo $CREATE_SUP_RES | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
   echo "Created Supplier: $SUPPLIER_ID"
else
   echo "✅ Supplier Found: $SUPPLIER_ID"
fi

echo "4. Fetching Fulfillment Centers..."
CENTERS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/fulfillment-centers")
CENTER_ID=$(echo $CENTERS | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -z "$CENTER_ID" ]]; then
    echo "No fulfillment center found. Creating one..."
    CREATE_FC_RES=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"name":"Test FC","code":"FC-'$(date +%s)'","country":"US","city":"New York","addressLine1":"123 Test St","personInCharge":"Manager","status":"Active"}' "$BASE_URL/fulfillment-centers")
    echo "Create FC Response: $CREATE_FC_RES"
    CENTER_ID=$(echo $CREATE_FC_RES | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "Created FC: $CENTER_ID"
else
    echo "✅ Fulfillment Center Found: $CENTER_ID"
fi

echo "5. Creating Purchase Order..."
PAYLOAD=$(cat <<EOF
{
  "supplierId": "$SUPPLIER_ID",
  "fulfillmentCenterId": "$CENTER_ID",
  "purchaseOrderNumber": "TEST-$(date +%s)",
  "orderDate": "$(date +%Y-%m-%d)",
  "status": "Ordered",
  "totalAmount": 100,
  "subtotal": 90,
  "items": [
    {
      "productId": "$PRODUCT_ID",
      "quantity": 2,
      "unitCost": 45,
      "purchasePrice": 50,
      "taxPercent": 0,
       "taxAmount": 0,
       "discountPercent": 10,
       "discountAmount": 5,
       "subtotal": 90
    }
  ]
}
EOF
)

CREATE_RES=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$PAYLOAD" "$BASE_URL/purchases")
echo "Create Response: $CREATE_RES"

if [[ $CREATE_RES == *"id"* ]]; then
    echo "✅ Purchase Created Successfully."
else
    echo "❌ Purchase Creation Failed."
    exit 1
fi
