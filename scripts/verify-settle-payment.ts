/**
 * CDP Wallet Verification and Payment Settlement Script
 *
 * This script verifies the CDP wallet configuration and settles a payment
 * using the funded wallet at 0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d
 *
 * Usage:
 *   tsx scripts/verify-settle-payment.ts [recipient] [amount] [network]
 *
 * Examples:
 *   tsx scripts/verify-settle-payment.ts 0xRecipientAddress 0.01 base
 *   tsx scripts/verify-settle-payment.ts 0xRecipientAddress 0.02 base-sepolia
 */

const WORKER_URL =
	process.env.WORKER_URL ||
	"https://cloudflare-setup-x402.disseveru.workers.dev";
const EXPECTED_WALLET = "0x451ab8d06B6EF38416312Fe4261B1A56dD2EAF1d";

interface WalletInfoResponse {
	configured: boolean;
	message: string;
	capabilities?: string[];
	nextSteps?: string[];
	error?: string;
}

interface PaymentResponse {
	success: boolean;
	transactionHash?: string;
	transactionLink?: string;
	network?: string;
	amount?: string;
	asset?: string;
	to?: string;
	from?: string;
	error?: string;
	details?: string;
}

async function verifyWalletConfiguration(): Promise<boolean> {
	console.log("==========================================");
	console.log("CDP Wallet Verification & Payment Settlement");
	console.log("==========================================");
	console.log("");

	console.log("Step 1: Verifying CDP wallet configuration...");
	console.log(`Endpoint: ${WORKER_URL}/api/wallet/info`);
	console.log("");

	try {
		const response = await fetch(`${WORKER_URL}/api/wallet/info`);
		const data: WalletInfoResponse = await response.json();

		console.log(JSON.stringify(data, null, 2));
		console.log("");

		if (data.configured) {
			console.log("✅ CDP wallet is properly configured");
			return true;
		} else {
			console.log("❌ CDP wallet is NOT configured");
			console.log("");
			console.log("To configure CDP wallet, run:");
			console.log("  wrangler secret put CDP_API_KEY");
			console.log("  wrangler secret put CDP_PRIVATE_KEY");
			console.log("  wrangler secret put CDP_WALLET_SECRET");
			console.log("");
			return false;
		}
	} catch (error) {
		console.error("❌ Failed to verify wallet configuration:");
		console.error(error);
		return false;
	}
}

async function settlePayment(
	recipient: string,
	amount: string,
	network: string,
	asset: string = "usdc"
): Promise<boolean> {
	console.log("");
	console.log("==========================================");
	console.log("Step 2: Settling payment...");
	console.log("==========================================");
	console.log(`Recipient: ${recipient}`);
	console.log(`Amount: ${amount} ${asset}`);
	console.log(`Network: ${network}`);
	console.log(`Expected Wallet: ${EXPECTED_WALLET}`);
	console.log("");

	try {
		const response = await fetch(`${WORKER_URL}/api/wallet/send`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				to: recipient,
				amount,
				asset,
				network,
			}),
		});

		const data: PaymentResponse = await response.json();
		console.log(JSON.stringify(data, null, 2));
		console.log("");

		if (data.success) {
			console.log("✅ Payment settled successfully!");

			if (data.transactionHash) {
				console.log("");
				console.log(`Transaction Hash: ${data.transactionHash}`);
				console.log(`From Address: ${data.from}`);
				console.log(`View on Explorer: ${data.transactionLink}`);
				console.log("");

				// Verify the sender is the expected wallet
				if (
					data.from?.toLowerCase() === EXPECTED_WALLET.toLowerCase()
				) {
					console.log("✅ Payment sent from expected funded wallet");
				} else {
					console.log(
						`⚠️  Warning: Payment sent from ${data.from} instead of expected ${EXPECTED_WALLET}`
					);
				}
			}

			return true;
		} else {
			console.log("❌ Payment failed");
			if (data.error || data.details) {
				console.log(`Error: ${data.error || data.details}`);
			}
			return false;
		}
	} catch (error) {
		console.error("❌ Failed to settle payment:");
		console.error(error);
		return false;
	}
}

async function main() {
	// Parse command line arguments
	const args = process.argv.slice(2);
	const recipient =
		args[0] || "0xAGENTIC_MARKET_VALIDATION_ADDRESS"; // Placeholder
	const amount = args[1] || "0.01";
	const network = args[2] || "base";

	// Step 1: Verify wallet configuration
	const isConfigured = await verifyWalletConfiguration();

	if (!isConfigured) {
		console.error("❌ Wallet is not configured. Exiting.");
		process.exit(1);
	}

	// Step 2: Settle payment
	const paymentSuccess = await settlePayment(recipient, amount, network);

	if (!paymentSuccess) {
		console.error("❌ Payment settlement failed. Exiting.");
		process.exit(1);
	}

	console.log("");
	console.log("==========================================");
	console.log("✅ Verification and Settlement Complete!");
	console.log("==========================================");
}

// Run the script
main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
