#!/bin/bash
# End-to-End System Test: "The Dubai Launch"
# Verifies the creation and linking of Store, FC, Supplier, Purchase, Product, Customer, and Order.

API_URL="http://localhost:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting E2E System Test: The Dubai Launch${NC}"

# 0. Authenticate
echo -n "0. Authenticating as Admin... "
LOGIN_RES=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123"
  }')
TOKEN=$(echo $LOGIN_RES | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}FAILED${NC}"
  echo "Response: $LOGIN_RES"
  exit 1
else
  echo -e "${GREEN}OK${NC}"
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"

# 1. Create Store
echo -n "1. Creating Store 'Urban Trends Dubai'... "
STORE_RES=$(curl -s -X POST "$API_URL/store-settings" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "storeName": "Urban Trends Dubai",
    "currency": "AED",
    "storeUrl": "https://urbantreds.ae"
  }')
STORE_ID=$(echo $STORE_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$STORE_ID" ]; then
  echo -e "${RED}FAILED${NC}"
  echo "Response: $STORE_RES"
  exit 1
else
  echo -e "${GREEN}OK${NC} (ID: $STORE_ID)"
fi

# 2. Create Fulfillment Center
echo -n "2. Creating Fulfillment Center 'DXB Warehouse'... "
FC_CODE="DXB-$(date +%s)"
FC_RES=$(curl -s -X POST "$API_URL/fulfillment-centers" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{
    \"name\": \"DXB Warehouse $FC_CODE\",
    \"code\": \"$FC_CODE\",
    \"country\": \"United Arab Emirates\",
    \"city\": \"Dubai\",
    \"addressLine1\": \"Al Quoz Industrial Area 4\",
    \"personInCharge\": \"Mohammed Ali\"
  }")
FC_ID=$(echo $FC_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$FC_ID" ]; then
  echo -e "${RED}FAILED${NC}"
  echo "Response: $FC_RES"
  exit 1
else
  echo -e "${GREEN}OK${NC} (ID: $FC_ID)"
fi

# 3. Create Supplier
echo -n "3. Creating Supplier 'Guangzhou Electronics'... "
SUPP_RES=$(curl -s -X POST "$API_URL/suppliers" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "name": "Guangzhou Electronics Ltd",
    "contactPerson": "Mr. Zhang",
    "email": "sales@gz-elec.com",
    "country": "China",
    "paymentTerms": "T/T 30/70"
  }')
SUPP_ID=$(echo $SUPP_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$SUPP_ID" ]; then
  echo -e "${RED}FAILED${NC}"
  echo "Response: $SUPP_RES"
  exit 1
else
  echo -e "${GREEN}OK${NC} (ID: $SUPP_ID)"
fi

# 4. Create Product
echo -n "4. Creating Product 'Wireless Earbuds' (SKU: EAR-$(date +%s))... "
SKU="EAR-$(date +%s)"
PROD_RES=$(curl -s -X POST "$API_URL/products" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{
    \"name\": \"Wireless Earbuds Pro $SKU\",
    \"sku\": \"$SKU\",
    \"description\": \"Noise cancelling earbuds\",
    \"sellingPrice\": 199.00,
    \"unitCost\": 45.00,
    \"stockLevel\": 0
  }")
PROD_ID=$(echo $PROD_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$PROD_ID" ]; then
  echo -e "${RED}FAILED${NC}"
  echo "Response: $PROD_RES"
  exit 1
else
  echo -e "${GREEN}OK${NC} (ID: $PROD_ID)"
fi

# 5. Create Purchase Order
echo -n "5. Creating Purchase Order (500 units -> DXB)... "
PURCH_RES=$(curl -s -X POST "$API_URL/purchases" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{
    \"supplierId\": \"$SUPP_ID\",
    \"fulfillmentCenterId\": \"$FC_ID\",
    \"status\": \"Ordered\",
    \"items\": [
      {
        \"productId\": \"$PROD_ID\",
        \"quantity\": 500,
        \"unitCost\": 45.00
      }
    ]
  }")
PURCH_ID=$(echo $PURCH_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$PURCH_ID" ]; then
  echo -e "${RED}FAILED${NC}"
  echo "Response: $PURCH_RES"
  exit 1
else
  echo -e "${GREEN}OK${NC} (ID: $PURCH_ID)"
fi

# 6. Create Customer
echo -n "6. Creating Customer 'Ahmed Al-Maktoum'... "
PHONE="+97150000$(date +%M%S)"
CUST_RES=$(curl -s -X POST "$API_URL/customers" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{
    \"name\": \"Ahmed Al-Maktoum\",
    \"phone\": \"$PHONE\",
    \"email\": \"ahmed.$PHONE@example.com\",
    \"country\": \"United Arab Emirates\",
    \"city\": \"Dubai\",
    \"addressLine1\": \"Downtown Dubai, Blvd Plaza\"
  }")
CUST_ID=$(echo $CUST_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$CUST_ID" ]; then
  echo -e "${RED}FAILED${NC}"
  echo "Response: $CUST_RES"
  exit 1
else
  echo -e "${GREEN}OK${NC} (ID: $CUST_ID)"
fi

# 7. Create Order
echo -n "7. Creating Order (2 units -> Customer)... "
ORDER_NO="ORD-$(date +%s)"
ORDER_RES=$(curl -s -X POST "$API_URL/orders" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{
    \"orderNumber\": \"$ORDER_NO\",
    \"customerId\": \"$CUST_ID\",
    \"storeId\": \"$STORE_ID\",
    \"storeName\": \"Urban Trends Dubai\",
    \"fulfillmentCenterId\": \"$FC_ID\",
    \"shippingAddressLine1\": \"Villa 12, Palm Jumeirah\",
    \"shippingCity\": \"Dubai\",
    \"shippingCountry\": \"United Arab Emirates\",
    \"status\": \"Processing\",
    \"totalAmount\": 398.00,
    \"items\": [ {
        \"productId\": \"$PROD_ID\",
        \"productName\": \"Wireless Earbuds\",
        \"sku\": \"$SKU\",
        \"quantity\": 2,
        \"unitPrice\": 199.00
      }
    ],
    \"paymentStatus\": \"COD Pending\"
  }")
ORDER_ID=$(echo $ORDER_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$ORDER_ID" ]; then
  echo -e "${RED}FAILED${NC}"
  echo "Response: $ORDER_RES"
  exit 1
else
  echo -e "${GREEN}OK${NC} (ID: $ORDER_ID)"
fi

echo -e "\n${GREEN}✅ E2E TEST COMPLETED SUCCESSFULLY!${NC}"
echo "------------------------------------------------"
echo "Store: Urban Trends Dubai ($STORE_ID)"
echo "FC:    DXB Warehouse ($FC_ID)"
echo "Prod:  Wireless Earbuds ($PROD_ID)"
echo "PO:    500 Units Incoming ($PURCH_ID)"
echo "Cust:  Ahmed Al-Maktoum ($CUST_ID)"
echo "Order: $ORDER_NO (2 Units) -> ($ORDER_ID)"
echo "------------------------------------------------"
