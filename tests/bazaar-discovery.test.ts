import { describe, it } from "node:test";
import assert from "node:assert";
import app from "../src/index";
import {
	CDP_FACILITATOR_URL,
	buildX402RouteConfig,
	normalizeNetwork,
	type ProtectedRouteConfig,
} from "../src/auth";

const ROOT_ENDPOINT = "https://example.com/";
const TEST_ENV = {
	JWT_SECRET:
		"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	PAY_TO: "0xed7d30e8bc643503f9da261ed8e623bb6ecf6189",
	NETWORK: "base",
	PROTECTED_PATTERNS: [],
	FACILITATOR_URL: CDP_FACILITATOR_URL,
} as unknown as CloudflareBindings;

function decodePaymentRequired(header: string): Record<string, unknown> {
	return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}

describe("Bazaar discovery metadata", () => {
	it("normalizes supported EVM network names to CAIP-2 IDs", () => {
		assert.strictEqual(normalizeNetwork("base"), "eip155:8453");
		assert.strictEqual(normalizeNetwork("base-sepolia"), "eip155:84532");
		assert.strictEqual(normalizeNetwork("polygon"), "eip155:137");
		assert.strictEqual(normalizeNetwork("arbitrum"), "eip155:42161");
	});

	it("builds route config with the Bazaar extension key from declareDiscoveryExtension", () => {
		const protectedRoute: ProtectedRouteConfig = {
			pattern: "/",
			price: "$0.001",
			description: "Access to x402 proxy service discovery",
			mimeType: "application/json",
			inputExample: {},
			outputExample: { status: "ok" },
			outputSchema: {
				type: "object",
				properties: { status: { type: "string" } },
				required: ["status"],
			},
		};

		const routeConfig = buildX402RouteConfig(protectedRoute, TEST_ENV);
		const accepts = Array.isArray(routeConfig.accepts)
			? routeConfig.accepts[0]
			: routeConfig.accepts;
		const bazaar = routeConfig.extensions?.bazaar as {
			info: { input: { queryParams: Record<string, unknown> } };
			schema: { $schema: string; type: string };
		};

		assert.strictEqual(accepts.network, "eip155:8453");
		assert.strictEqual(accepts.price, "$0.001");
		assert.strictEqual(accepts.payTo, TEST_ENV.PAY_TO);
		assert.deepStrictEqual(bazaar.info.input.queryParams, {});
		assert.strictEqual(
			bazaar.schema.$schema,
			"https://json-schema.org/draft/2020-12/schema"
		);
		assert.strictEqual(bazaar.schema.type, "object");
	});

	it("returns a Bazaar-discoverable x402 v2 payment-required header for GET /", async () => {
		const response = await app.fetch(new Request(ROOT_ENDPOINT), TEST_ENV);
		assert.strictEqual(response.status, 402);

		const header = response.headers.get("payment-required");
		assert.ok(header);

		const envelope = decodePaymentRequired(header);
		const resource = envelope.resource as Record<string, unknown>;
		const accepts = envelope.accepts as Record<string, unknown>[];
		const bazaar = (envelope.extensions as Record<string, unknown>)
			.bazaar as Record<string, unknown>;
		const bazaarInfo = bazaar.info as Record<string, unknown>;
		const bazaarInput = bazaarInfo.input as Record<string, unknown>;
		const bazaarOutput = bazaarInfo.output as Record<string, unknown>;
		const bazaarSchema = bazaar.schema as Record<string, unknown>;

		assert.strictEqual(envelope.x402Version, 2);
		assert.strictEqual(envelope.error, "Payment required");
		assert.strictEqual(resource.url, ROOT_ENDPOINT);
		assert.strictEqual(resource.mimeType, "application/json");
		assert.strictEqual(accepts[0].scheme, "exact");
		assert.strictEqual(accepts[0].network, "eip155:8453");
		assert.strictEqual(accepts[0].amount, "1000");
		assert.strictEqual(
			accepts[0].asset,
			"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
		);
		assert.strictEqual(accepts[0].payTo, TEST_ENV.PAY_TO);
		assert.strictEqual(accepts[0].maxTimeoutSeconds, 300);
		assert.strictEqual(bazaarInput.type, "http");
		assert.strictEqual(bazaarInput.method, "GET");
		assert.deepStrictEqual(bazaarInput.queryParams, {});
		assert.strictEqual(bazaarOutput.type, "json");
		assert.strictEqual(
			bazaarSchema.$schema,
			"https://json-schema.org/draft/2020-12/schema"
		);
		assert.strictEqual(bazaarSchema.type, "object");
	});
});
