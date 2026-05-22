import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/index";

type ProtectedPattern = {
	pattern: string;
	price: string;
	description: string;
	bot_score_threshold?: number;
	except_detection_ids?: number[];
};

function makeEnv(patterns: ProtectedPattern[]) {
	return {
		NETWORK: "base-sepolia",
		PAY_TO: "0x000000000000000000000000000000000000dEaD",
		FACILITATOR_URL: "https://x402.org/facilitator",
		PROTECTED_PATTERNS: patterns,
		JWT_SECRET: "test-secret",
	};
}

test("returns configuration error when built-in API path is not protected", async () => {
	const response = await app.request(
		"http://localhost/api/enrich?url=example.com",
		undefined,
		makeEnv([])
	);

	assert.equal(response.status, 500);
	const json = (await response.json()) as { error: string };
	assert.match(json.error, /\/api\/enrich/);
	assert.match(json.error, /PROTECTED_PATTERNS/);
});

test("returns x402 payment requirement when enrich path is protected", async () => {
	const response = await app.request(
		"http://localhost/api/enrich?url=example.com",
		undefined,
		makeEnv([
			{
				pattern: "/api/enrich",
				price: "$0.01",
				description: "Lead enrichment signals for a target website",
			},
		])
	);

	assert.equal(response.status, 402);
	const json = (await response.json()) as {
		error: string;
		accepts: Array<{ description: string; network: string }>;
	};
	assert.equal(json.error, "X-PAYMENT header is required");
	assert.equal(json.accepts[0]?.network, "base-sepolia");
	assert.match(json.accepts[0]?.description ?? "", /Lead enrichment signals/);
});

test("bypasses payment with bot-management exception and enforces method guard", async () => {
	for (const method of ["PUT", "DELETE", "PATCH", "OPTIONS"] as const) {
		const request = new Request(
			"http://localhost/api/enrich?url=https://example.com",
			{
				method,
			}
		);
		(request as Request & { cf?: unknown }).cf = {
			botManagement: {
				// A high score (above 30 threshold) represents likely human traffic.
				score: 99,
				detectionIds: [],
			},
		};

		const response = await app.request(
			request,
			undefined,
			makeEnv([
				{
					pattern: "/api/enrich",
					price: "$0.01",
					description: "Lead enrichment signals",
					bot_score_threshold: 30,
				},
			])
		);

		assert.equal(response.status, 405);
		const json = (await response.json()) as { error: string };
		assert.equal(json.error, "Method not allowed. Use GET or POST.");
	}
});
