#!/bin/bash

# Test Backend Flow: Product Create -> Purchase -> Receive -> Inventory Check

BASE_URL="http://localhost:3000"
echo "========================================="
echo "Backend Flow Verification"
echo "========================================="
echo ""

# 1. Authenticate
# Check if we have a user, otherwise create one or use hardcoded if exists
echo "1. Authenticating..."
LOGIN_RES=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@cod.com","password":"admin123"}' \
  "$BASE_URL/auth/login")

TOKEN=$(echo $LOGIN_RES | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$TOKEN" ]]; then
    echo "❌ Authentication Failed. Checking if we need to seed user..."
    # Attempt to seed or just fail if this is a strict environment
    echo "Response: $LOGIN_RES"
    exit 1
fi
echo "✅ Authenticated"

# 2. Get Dependencies (Supplier, Fulfillment Center)
echo "2. Fetching Dependencies..."
SUPPLIERS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/suppliers")
SUPPLIER_ID=$(echo $SUPPLIERS | python3 -c "import sys,json; data=json.load(sys.stdin); print(data['data'][0]['id'] if isinstance(data,dict) else data[0]['id'] if len(data)>0 else '')" 2>/dev/null)

CENTERS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/fulfillment-centers")
FC_ID=$(echo $CENTERS | python3 -c "import sys,json; data=json.load(sys.stdin); print(data['data'][0]['id'] if isinstance(data,dict) else data[0]['id'] if len(data)>0 else '')" 2>/dev/null)


WHS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/inventory/warehouses")
WH_ID=$(echo $WHS | python3 -c "import sys,json; data=json.load(sys.stdin); print(data[0]['id'] if isinstance(data,list) and len(data)>0 else '')" 2>/dev/null)

if [[ -z "$WH_ID" ]]; then
    echo "⚠️ No Warehouse found. Creating one..."
    WH_PAYLOAD="{\"name\":\"Test Warehouse\",\"fulfillmentCenterId\":\"$FC_ID\",\"location\":\"Test Location\"}"
    CREATE_WH_RES=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$WH_PAYLOAD" "$BASE_URL/inventory/warehouses")
    WH_ID=$(echo $CREATE_WH_RES | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
    
    if [[ -z "$WH_ID" ]]; then
        echo "❌ Failed to create warehouse"
        echo "$CREATE_WH_RES"
        exit 1
    fi
    echo "✅ Created Warehouse: $WH_ID"
fi
echo "✅ Dependencies found"

# 3. Create Product
echo "3. Creating Test Product..."
SKU="TEST-SKU-$(date +%s)"
PRODUCT_PAYLOAD=$(cat <<EOF
{
  "name": "Backend Test Product",
  "sku": "$SKU",
  "unitCost": 10.00,
  "sellingPrice": 20.00,
  "supplierId": "$SUPPLIER_ID",
  "fulfillmentCenterId": "$FC_ID"
}
EOF
)
CREATE_PROD_RES=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$PRODUCT_PAYLOAD" "$BASE_URL/products")
PRODUCT_ID=$(echo $CREATE_PROD_RES | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [[ -z "$PRODUCT_ID" ]]; then
    echo "❌ Product Creation Failed"
    echo "$CREATE_PROD_RES"
    exit 1
fi
echo "✅ Product Created: $PRODUCT_ID ($SKU)"

# 4. Check Initial Inventory
echo "4. Checking Initial Inventory..."
INV_RES=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/inventory/stock?warehouseId=$WH_ID")
# Filter for our product
INITIAL_STOCK=$(echo $INV_RES | python3 -c "import sys,json; 
data=json.load(sys.stdin); 
item=next((x for x in data if x['id'] == '$PRODUCT_ID'), None);
print(item['currentStock'] if item else 0)" 2>/dev/null)

echo "Initial Stock: $INITIAL_STOCK"

# 5. Create Purchase Order
echo "5. Creating Purchase Order..."
PURCHASE_PAYLOAD=$(cat <<EOF
{
  "supplierId": "$SUPPLIER_ID",
  "fulfillmentCenterId": "$FC_ID",
  "orderDate": "$(date +%Y-%m-%d)",
  "status": "Draft",
  "items": [
    {
      "productId": "$PRODUCT_ID",
      "quantity": 100,
      "unitCost": 10.00
    }
  ]
}
EOF
)
CREATE_PO_RES=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$PURCHASE_PAYLOAD" "$BASE_URL/purchases")
PO_ID=$(echo $CREATE_PO_RES | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [[ -z "$PO_ID" ]]; then
    echo "❌ PO Creation Failed"
    echo "$CREATE_PO_RES"
    exit 1
fi
echo "✅ PO Created: $PO_ID"

# 6. Verify Inventory UNCHANGED
echo "6. Verifying Inventory (Unchanged)..."
INV_RES_2=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/inventory/stock?warehouseId=$WH_ID")
STOCK_AFTER_PO=$(echo $INV_RES_2 | python3 -c "import sys,json; 
data=json.load(sys.stdin); 
item=next((x for x in data if x['id'] == '$PRODUCT_ID'), None);
print(item['currentStock'] if item else 0)" 2>/dev/null)

if [[ "$STOCK_AFTER_PO" != "$INITIAL_STOCK" ]]; then
    echo "❌ Error: Stock changed after PO creation but before receipt! ($STOCK_AFTER_PO)"
else 
    echo "✅ Stock unchanged as expected ($STOCK_AFTER_PO)"
fi

# 7. Receive Goods
echo "7. Receiving Goods..."
RECEIVE_PAYLOAD=$(cat <<EOF
{
  "receivedItems": [
    {
      "productId": "$PRODUCT_ID",
      "quantity": 100,
      "warehouseId": "$WH_ID"
    }
  ]
}
EOF
)
RECEIVE_RES=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$RECEIVE_PAYLOAD" "$BASE_URL/purchases/$PO_ID/receive")
echo "Receive Response Code: $(echo $RECEIVE_RES | grep -o 'statusCode' || echo 'OK')"

# 8. Verify Inventory UPDATED
echo "8. Verifying Inventory (Updated)..."
INV_RES_3=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/inventory/stock?warehouseId=$WH_ID")
STOCK_FINAL=$(echo $INV_RES_3 | python3 -c "import sys,json; 
data=json.load(sys.stdin); 
item=next((x for x in data if x['id'] == '$PRODUCT_ID'), None);
print(item['currentStock'] if item else 0)" 2>/dev/null)

echo "Final Stock: $STOCK_FINAL"

if [[ "$STOCK_FINAL" == "100" ]]; then
     echo "✅ SUCCESS: Inventory updated to 100!"
else
     echo "❌ FAILURE: Inventory is $STOCK_FINAL, expected 100"
fi
