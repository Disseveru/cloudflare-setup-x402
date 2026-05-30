#!/bin/bash
# Script to verify CDP wallet configuration and settle a payment
# Usage: ./scripts/verify-settle-payment.sh [recipient_address] [amount] [network]

set -e

# Configuration
WORKER_URL="${WORKER_URL:-https://cloudflare-setup-x402.disseveru.workers.dev}"
RECIPIENT="${1:-0xAGENTIC_MARKET_VALIDATION_ADDRESS}"
AMOUNT="${2:-0.01}"
NETWORK="${3:-base}"
ASSET="usdc"

echo "=========================================="
echo "CDP Wallet Verification & Payment Settlement"
echo "=========================================="
echo ""

# Step 1: Verify CDP wallet configuration
echo "Step 1: Verifying CDP wallet configuration..."
echo "Endpoint: $WORKER_URL/api/wallet/info"
echo ""

WALLET_INFO=$(curl -s "$WORKER_URL/api/wallet/info")
echo "$WALLET_INFO" | jq . || echo "$WALLET_INFO"
echo ""

# Check if CDP is configured
if echo "$WALLET_INFO" | grep -q "\"configured\":true"; then
    echo "✅ CDP wallet is properly configured"
else
    echo "❌ CDP wallet is NOT configured"
    echo ""
    echo "To configure CDP wallet, run:"
    echo "  wrangler secret put CDP_API_KEY"
    echo "  wrangler secret put CDP_PRIVATE_KEY"
    echo "  wrangler secret put CDP_WALLET_SECRET"
    echo ""
    exit 1
fi

echo ""
echo "=========================================="
echo "Step 2: Settling payment..."
echo "=========================================="
echo "Recipient: $RECIPIENT"
echo "Amount: $AMOUNT $ASSET"
echo "Network: $NETWORK"
echo "Expected Wallet: 0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d"
echo ""

# Step 2: Send payment
PAYMENT_RESULT=$(curl -s -X POST "$WORKER_URL/api/wallet/send" \
  -H "Content-Type: application/json" \
  -d "{
    \"to\": \"$RECIPIENT\",
    \"amount\": \"$AMOUNT\",
    \"asset\": \"$ASSET\",
    \"network\": \"$NETWORK\"
  }")

echo "$PAYMENT_RESULT" | jq . || echo "$PAYMENT_RESULT"
echo ""

# Check if payment was successful
if echo "$PAYMENT_RESULT" | grep -q "\"success\":true"; then
    echo "✅ Payment settled successfully!"

    # Extract transaction details
    TX_HASH=$(echo "$PAYMENT_RESULT" | jq -r '.transactionHash // empty')
    TX_LINK=$(echo "$PAYMENT_RESULT" | jq -r '.transactionLink // empty')
    FROM_ADDR=$(echo "$PAYMENT_RESULT" | jq -r '.from // empty')

    if [ -n "$TX_HASH" ]; then
        echo ""
        echo "Transaction Hash: $TX_HASH"
        echo "From Address: $FROM_ADDR"
        echo "View on Explorer: $TX_LINK"
        echo ""

        # Verify the sender is the expected wallet
        if [ "$FROM_ADDR" = "0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d" ]; then
            echo "✅ Payment sent from expected funded wallet"
        else
            echo "⚠️  Warning: Payment sent from $FROM_ADDR instead of expected 0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d"
        fi
    fi
else
    echo "❌ Payment failed"
    ERROR_MSG=$(echo "$PAYMENT_RESULT" | jq -r '.error // .details // empty')
    if [ -n "$ERROR_MSG" ]; then
        echo "Error: $ERROR_MSG"
    fi
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Verification and Settlement Complete!"
echo "=========================================="
