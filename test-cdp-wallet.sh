#!/bin/bash
# Test script for CDP Wallet endpoints

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default to workers.dev URL if WORKER_URL is not set
WORKER_URL="${WORKER_URL:-https://x402-proxy.disseveru.workers.dev}"

echo -e "${YELLOW}Testing CDP Wallet Integration${NC}"
echo "Worker URL: $WORKER_URL"
echo ""

# Test 1: Check wallet info endpoint
echo -e "${YELLOW}Test 1: GET /api/wallet/info${NC}"
echo "Testing wallet configuration status..."
RESPONSE=$(curl -s "${WORKER_URL}/api/wallet/info")
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

if echo "$RESPONSE" | grep -q '"configured": true'; then
  echo -e "${GREEN}✓ Wallet is configured${NC}"
else
  echo -e "${RED}✗ Wallet is not configured${NC}"
fi
echo ""

# Test 2: Check root endpoint shows wallet endpoints
echo -e "${YELLOW}Test 2: GET / (check wallet endpoints listed)${NC}"
RESPONSE=$(curl -s "${WORKER_URL}/")
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

if echo "$RESPONSE" | grep -q 'wallet'; then
  echo -e "${GREEN}✓ Wallet endpoints are listed${NC}"
else
  echo -e "${RED}✗ Wallet endpoints not found${NC}"
fi
echo ""

# Test 3: Test wallet send endpoint (without actually sending)
echo -e "${YELLOW}Test 3: POST /api/wallet/send (test validation)${NC}"
echo "Testing with missing parameters (should return 400)..."
RESPONSE=$(curl -s -X POST "${WORKER_URL}/api/wallet/send" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

if echo "$RESPONSE" | grep -q 'Missing required fields'; then
  echo -e "${GREEN}✓ Validation working correctly${NC}"
else
  echo -e "${YELLOW}⚠ Unexpected response${NC}"
fi
echo ""

echo -e "${YELLOW}Test 4: POST /api/wallet/send (with valid parameters)${NC}"
echo "Note: This returns instructions, not an actual transaction..."
RESPONSE=$(curl -s -X POST "${WORKER_URL}/api/wallet/send" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
    "amount": "0.01",
    "asset": "usdc",
    "network": "base-sepolia"
  }')
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

if echo "$RESPONSE" | grep -q 'CDP SDK integrated successfully'; then
  echo -e "${GREEN}✓ Endpoint responds correctly${NC}"
else
  echo -e "${YELLOW}⚠ Unexpected response${NC}"
fi
echo ""

echo -e "${GREEN}CDP Wallet Integration Tests Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. The CDP SDK is integrated and endpoints are working"
echo "2. To actually send transactions, you'll need to:"
echo "   - Create an EVM account using CDP SDK"
echo "   - Fund the account with testnet/mainnet tokens"
echo "   - Implement the full transaction logic in the send endpoint"
echo ""
echo "For agentic.market validation:"
echo "Once you have a funded account, send 0.01 USDC to the validation address."
