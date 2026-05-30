# CDP Wallet Payment Verification and Settlement - Complete Guide

## Overview

This guide provides step-by-step instructions to verify and settle a payment using the CDP (Coinbase Developer Platform) wallet integration with the funded wallet at `0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d`.

## Prerequisites

1. **Cloudflare Account**: Authenticated with wrangler
2. **CDP Account**: With API credentials from [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)
3. **Funded Wallet**: The wallet `0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d` should be funded with USDC/ETH
4. **GitHub Secrets**: CDP credentials configured in repository secrets

## Current Status

✅ **Completed:**
- CDP SDK integration in worker (`/api/wallet/send`, `/api/wallet/info`)
- GitHub Actions workflow configured to deploy CDP secrets
- Verification and settlement scripts created
- Comprehensive documentation

⚠️ **Remaining Steps:**
1. Ensure CDP secrets are deployed to the worker
2. Verify wallet configuration
3. Execute payment settlement
4. Confirm transaction on blockchain

## Step-by-Step Process

### 1. Verify CDP Secrets Are Configured

Check which secrets are currently set in the worker:

```bash
npx wrangler secret list
```

Expected secrets:
- `JWT_SECRET` ✅ (already configured)
- `CDP_API_KEY` (needs verification)
- `CDP_PRIVATE_KEY` (needs verification)
- `CDP_WALLET_SECRET` (needs verification)

### 2. Configure Missing Secrets

If any CDP secrets are missing, configure them manually:

```bash
# Get the values from GitHub Secrets or CDP Portal, then:
npx wrangler secret put CDP_API_KEY
npx wrangler secret put CDP_PRIVATE_KEY
npx wrangler secret put CDP_WALLET_SECRET
```

**Note:** These values should match what's in GitHub Secrets:
- `secrets.CDP_API_KEY`
- `secrets.CDP_PRIVATE_KEY`
- `secrets.CDP_WALLET_SECRET`

### 3. Verify Worker Deployment

Ensure the worker is deployed with the latest code:

```bash
npm run deploy
```

### 4. Test Wallet Configuration

Use the TypeScript verification script:

```bash
# Run verification (this tests the /api/wallet/info endpoint)
npx tsx scripts/verify-settle-payment.ts
```

Or use curl directly:

```bash
curl https://cloudflare-setup-x402.disseveru.workers.dev/api/wallet/info
```

Expected response if configured correctly:

```json
{
  "configured": true,
  "message": "CDP SDK is properly configured",
  "capabilities": [
    "Create EVM and Solana accounts",
    "Send transactions on Base, Base Sepolia, and other networks",
    "Manage end users and delegated signing",
    "EIP-7702 delegation support"
  ]
}
```

### 5. Settle a Payment

Once wallet configuration is verified, settle a payment:

```bash
# Using the TypeScript script:
npx tsx scripts/verify-settle-payment.ts <recipient_address> <amount> <network>

# Example: Send 0.01 USDC on Base mainnet
npx tsx scripts/verify-settle-payment.ts 0xRecipientAddress 0.01 base

# Or using curl directly:
curl -X POST https://cloudflare-setup-x402.disseveru.workers.dev/api/wallet/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xRecipientAddress",
    "amount": "0.01",
    "asset": "usdc",
    "network": "base"
  }'
```

### 6. Verify the Transaction

The response will include:

```json
{
  "success": true,
  "transactionHash": "0x...",
  "transactionLink": "https://basescan.org/tx/0x...",
  "network": "base-mainnet",
  "amount": "0.01",
  "asset": "usdc",
  "to": "0xRecipientAddress",
  "from": "0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d"
}
```

**Verification checklist:**
- [ ] `success` is `true`
- [ ] `from` address matches `0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d`
- [ ] Transaction link opens on blockchain explorer
- [ ] Explorer shows correct amount and recipient
- [ ] Transaction status is "Success"

## Common Issues and Solutions

### Issue: "CDP credentials not configured"

**Cause:** CDP secrets are not set in the worker.

**Solution:**
```bash
npx wrangler secret put CDP_API_KEY
npx wrangler secret put CDP_PRIVATE_KEY
npx wrangler secret put CDP_WALLET_SECRET
```

### Issue: "CDP_WALLET_SECRET not configured"

**Cause:** The wallet secret is missing or incorrect.

**Solution:**
1. Get the wallet secret from the CDP Portal
2. Set it: `npx wrangler secret put CDP_WALLET_SECRET`

### Issue: "No accounts found"

**Cause:** The CDP wallet secret doesn't return any accounts.

**Solution:**
1. Verify the wallet secret is correct in the CDP Portal
2. Ensure the wallet `0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d` exists
3. Check that you're using the correct CDP API credentials

### Issue: "Insufficient funds"

**Cause:** The wallet doesn't have enough USDC/ETH.

**Solution:**
1. Visit [CDP Portal](https://portal.cdp.coinbase.com)
2. Fund the wallet `0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d`
3. Ensure you have enough for the transaction + gas fees

### Issue: Worker URL not accessible

**Cause:** The worker subdomain may be different or not deployed.

**Solution:**
1. Check deployment: `npx wrangler deployments list`
2. Get worker URL: The worker name is `cloudflare-setup-x402`
3. Try both possible URLs:
   - `https://cloudflare-setup-x402.disseveru.workers.dev`
   - `https://cloudflare-setup-x402.<account_id>.workers.dev`

## Quick Reference

### Available Scripts

```bash
# Bash version
./scripts/verify-settle-payment.sh [recipient] [amount] [network]

# TypeScript version
npx tsx scripts/verify-settle-payment.ts [recipient] [amount] [network]
```

### API Endpoints

- **GET** `/api/wallet/info` - Check CDP configuration
- **POST** `/api/wallet/send` - Send payment from funded wallet

### Networks

- **Base Mainnet**: `"network": "base"` → Explorer: https://basescan.org
- **Base Sepolia**: `"network": "base-sepolia"` → Explorer: https://sepolia.basescan.org

### Expected Wallet

All payments should come from: `0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d`

## Testing Checklist

Before settling a real payment, verify:

- [ ] Secrets are configured (`npx wrangler secret list`)
- [ ] Worker is deployed (`npx wrangler deployments list`)
- [ ] Wallet info endpoint returns `"configured": true`
- [ ] You have the correct recipient address
- [ ] You're using the correct network (base vs base-sepolia)
- [ ] The funded wallet has sufficient balance

## Security Notes

⚠️ **IMPORTANT:**
- Never commit CDP secrets to version control
- Store secrets in GitHub Secrets and Cloudflare Workers only
- Use `.dev.vars` for local testing (gitignored)
- Verify transaction details before confirming payments
- Double-check recipient addresses

## Next Steps

After successful payment verification and settlement:

1. **Document the transaction**: Save the transaction hash and link
2. **Verify on-chain**: Confirm the transaction on the blockchain explorer
3. **Update records**: Record the payment for accounting/validation purposes
4. **Monitor wallet**: Check wallet balance and transaction history

## Resources

- [CDP SDK Documentation](https://coinbase.github.io/cdp-sdk/typescript)
- [CDP Portal](https://portal.cdp.coinbase.com)
- [Base Documentation](https://docs.base.org)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [x402 Protocol](https://x402.org)

## Support

For issues or questions:
- Check the [CDP Wallet Setup Guide](./CDP_WALLET_SETUP.md)
- Review the [Troubleshooting section](#common-issues-and-solutions)
- Check Cloudflare Worker logs: `npx wrangler tail`
- Verify CDP Portal for wallet status

---

**Last Updated:** 2026-05-30
**Worker Name:** `cloudflare-setup-x402`
**Expected Wallet:** `0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d`
