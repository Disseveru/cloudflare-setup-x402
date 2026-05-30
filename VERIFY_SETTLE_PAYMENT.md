# CDP Wallet Payment Verification and Settlement Guide

This guide explains how to verify the CDP wallet configuration and settle payments using the funded wallet at `0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d`.

## Prerequisites

Before you can verify and settle payments, ensure the following secrets are configured in your Cloudflare Worker:

1. **CDP_API_KEY** - Your CDP API Key ID
2. **CDP_PRIVATE_KEY** - Your CDP API Private Key
3. **CDP_WALLET_SECRET** - The wallet secret for accessing the funded wallet

## Step 1: Configure CDP Secrets

If the secrets are not already configured, set them using the Wrangler CLI:

```bash
# Set CDP API Key
wrangler secret put CDP_API_KEY
# Enter your CDP API Key ID when prompted

# Set CDP Private Key
wrangler secret put CDP_PRIVATE_KEY
# Enter your CDP API Private Key when prompted

# Set CDP Wallet Secret
wrangler secret put CDP_WALLET_SECRET
# Enter your CDP Wallet Secret when prompted
```

**Note:** These secrets should be obtained from the [CDP Portal](https://portal.cdp.coinbase.com).

## Step 2: Verify Secrets Are Configured

Check that all required secrets are set:

```bash
wrangler secret list
```

Expected output should include:
- JWT_SECRET
- CDP_API_KEY
- CDP_PRIVATE_KEY
- CDP_WALLET_SECRET

## Step 3: Verify CDP Wallet Configuration

Test the wallet info endpoint to confirm the CDP SDK is properly configured:

```bash
curl https://cloudflare-setup-x402.disseveru.workers.dev/api/wallet/info
```

Expected successful response:

```json
{
  "configured": true,
  "message": "CDP SDK is properly configured",
  "capabilities": [
    "Create EVM and Solana accounts",
    "Send transactions on Base, Base Sepolia, and other networks",
    "Manage end users and delegated signing",
    "EIP-7702 delegation support"
  ],
  "nextSteps": [
    "Create an account: POST /api/wallet/account/create",
    "Send funds: POST /api/wallet/send (after account creation)"
  ]
}
```

If you receive an error about missing credentials, go back to Step 1.

## Step 4: Settle a Payment

Use the `/api/wallet/send` endpoint to send a payment from the funded wallet.

### Example: Send Validation Payment for Agentic.Market

```bash
curl -X POST https://cloudflare-setup-x402.disseveru.workers.dev/api/wallet/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xAGENTIC_MARKET_VALIDATION_ADDRESS",
    "amount": "0.01",
    "asset": "usdc",
    "network": "base"
  }'
```

### Parameters

- **to** (required): Recipient wallet address (0x...)
- **amount** (required): Amount to send (e.g., "0.01" for 1 cent)
- **asset** (optional): "usdc" or "eth" (default: "usdc")
- **network** (optional): "base" or "base-sepolia" (default: "base-sepolia")

### Expected Successful Response

```json
{
  "success": true,
  "transactionHash": "0x123abc...",
  "transactionLink": "https://basescan.org/tx/0x123abc...",
  "network": "base-mainnet",
  "amount": "0.01",
  "asset": "usdc",
  "to": "0xRecipientAddress",
  "from": "0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d"
}
```

### Verification

1. Check the `from` address matches the expected funded wallet: `0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d`
2. Visit the `transactionLink` to verify the transaction on the blockchain explorer
3. Confirm the transaction shows the correct amount and recipient

## Step 5: Using the Automation Script

For convenience, a verification and settlement script is provided:

```bash
# Basic usage (defaults to 0.01 USDC on Base mainnet)
./scripts/verify-settle-payment.sh [recipient_address] [amount] [network]

# Example: Send 0.01 USDC on Base mainnet
./scripts/verify-settle-payment.sh 0xRecipientAddress 0.01 base

# Example: Send 0.02 USDC on Base Sepolia testnet
./scripts/verify-settle-payment.sh 0xRecipientAddress 0.02 base-sepolia
```

The script will:
1. Verify CDP wallet configuration
2. Send the payment
3. Display transaction details and explorer link
4. Verify the payment came from the expected wallet address

## Troubleshooting

### "CDP credentials not configured"

The CDP secrets are not set in the Cloudflare Worker. Follow Step 1 to configure them.

### "CDP_WALLET_SECRET not configured"

The wallet secret is missing. Set it with:

```bash
wrangler secret put CDP_WALLET_SECRET
```

### "No accounts found"

The CDP wallet secret did not return any accounts. Verify:
1. The wallet secret is correct
2. You're using the secret from the correct wallet in the CDP Portal
3. The wallet has been properly created and funded

### "Insufficient funds"

The wallet doesn't have enough balance for the transaction. Check:
1. Visit the [CDP Portal](https://portal.cdp.coinbase.com)
2. Verify the wallet `0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d` has sufficient USDC/ETH
3. Ensure you're on the correct network (Base vs Base Sepolia)

### Wrong wallet address

If the `from` address doesn't match `0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d`:
1. Verify you're using the correct CDP_WALLET_SECRET
2. Check the CDP Portal to confirm the wallet address
3. The code includes a warning when using a different address

## Network Configuration

- **Base Mainnet**: Use `"network": "base"` for production payments
- **Base Sepolia**: Use `"network": "base-sepolia"` for testing

Transaction explorers:
- Base Mainnet: https://basescan.org
- Base Sepolia: https://sepolia.basescan.org

## Security Notes

⚠️ **IMPORTANT:**
- Never commit CDP secrets to version control
- Secrets are stored securely in Cloudflare Workers
- Use `wrangler secret put` to set them
- For local development, use `.dev.vars` file (gitignored)

## Additional Resources

- [CDP SDK Documentation](https://coinbase.github.io/cdp-sdk/typescript)
- [CDP Wallet API v2](https://docs.cdp.coinbase.com/wallet-api-v2/docs/welcome)
- [CDP Portal](https://portal.cdp.coinbase.com)
- [Base Network Documentation](https://docs.base.org)
