/**
 * Authentication middleware for cookie-based JWT verification
 */

import { Context, Next, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifyJWT } from "./jwt";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient, type RouteConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
	bazaarResourceServerExtension,
	declareDiscoveryExtension,
	type DeclareDiscoveryExtensionInput,
} from "@x402/extensions/bazaar";
import type { SupportedResponse } from "@x402/core/types";
import type { AppContext } from "./env";

export const CDP_FACILITATOR_URL =
	"https://api.cdp.coinbase.com/platform/v2/x402/facilitator";

const CDP_SUPPORTED_EXACT_EVM_NETWORKS = [
	"eip155:8453",
	"eip155:84532",
	"eip155:137",
	"eip155:42161",
] as const;

class CdpFacilitatorClient extends HTTPFacilitatorClient {
	async getSupported(): Promise<SupportedResponse> {
		return {
			kinds: CDP_SUPPORTED_EXACT_EVM_NETWORKS.map((network) => ({
				x402Version: 2,
				scheme: "exact",
				network,
			})),
			extensions: ["bazaar"],
			signers: {},
		};
	}
}

/**
 * Creates a combined middleware that checks for valid cookie authentication
 * and conditionally applies payment middleware only if cookie auth fails
 *
 * @param paymentMiddleware - The payment middleware to apply when no valid cookie exists
 * @returns Combined authentication and payment middleware
 */
export function requirePaymentOrCookie(paymentMw: MiddlewareHandler) {
	return async (c: Context<AppContext>, next: Next) => {
		// Check for valid cookie
		const token = getCookie(c, "auth_token");

		if (token) {
			const jwtSecret = c.env.JWT_SECRET;

			// Ensure JWT_SECRET is configured
			if (!jwtSecret) {
				return c.json(
					{
						error:
							"Server misconfigured: JWT_SECRET not set. See README for setup instructions.",
					},
					500
				);
			}

			const payload = await verifyJWT(token, jwtSecret);

			// If token is valid, skip payment and go directly to handler
			if (payload) {
				c.set("auth", payload);
				await next(); // Call the handler
				return;
			}
		}

		// No valid cookie - apply payment middleware
		return await paymentMw(c, next);
	};
}

/**
 * Configuration for a protected route that requires payment
 */
export interface ProtectedRouteConfig {
	/** Route pattern to protect (e.g., "/premium", "/api/paid/*", "/users/:id") */
	pattern: string;
	/** Price in USD (e.g. "$0.01") */
	price: string;
	/** Human-readable description of what the payment is for */
	description: string;
	/**
	 * Bot Management Filtering (optional)
	 * Requires Bot Management for Enterprise. See src/bot-management/ for details.
	 */
	bot_score_threshold?: number;
	except_detection_ids?: number[];

	// ===== x402 v2 Bazaar Discovery Extension (optional) =====
	/** MIME type of the response (e.g., "application/json") */
	mimeType?: string;
	/** Example query parameters/body for Bazaar probes */
	inputExample?: Record<string, unknown>;
	/** JSON Schema for query parameters/body */
	inputSchema?: Record<string, unknown>;
	/** JSON Schema for path parameters (e.g., { properties: { id: { type: "string" } }, required: ["id"] }) */
	pathParamsSchema?: {
		properties: Record<string, { type: string; description?: string }>;
		required?: string[];
	};
	/** Example output for API documentation */
	outputExample?: unknown;
	/** JSON Schema for the output example */
	outputSchema?: Record<string, unknown>;

	// ===== Service-level metadata for Bazaar catalog (optional) =====
	/** Human-readable service name (≤ 32 chars) */
	serviceName?: string;
	/** Up to 5 topical tags (each ≤ 32 chars) */
	tags?: string[];
	/** Absolute HTTPS URL to service icon (≤ 2048 chars) */
	iconUrl?: string;
}

/**
 * Extracted path parameters from a dynamic route
 */
export interface PathParams {
	[key: string]: string;
}

/**
 * Convert route pattern to route template for x402 v2
 * Converts /users/:id to /users/:id (already v2 format)
 * Converts /users/* to /users/:var1 (wildcard to named param)
 *
 * @param pattern - Route pattern (e.g., "/users/:id", "/users/*")
 * @returns Route template for catalog normalization
 */
export function patternToRouteTemplate(pattern: string): string {
	// Already using :param syntax - return as-is
	if (pattern.includes(":")) {
		return pattern;
	}

	// Convert wildcard /* to named parameter
	if (pattern.endsWith("/*")) {
		return pattern.replace(/\/\*$/, "/:var1");
	}

	return pattern;
}

export function normalizeNetwork(network: string): `${string}:${string}` {
	const networkMap: Record<string, `${string}:${string}`> = {
		base: "eip155:8453",
		"base-sepolia": "eip155:84532",
		polygon: "eip155:137",
		arbitrum: "eip155:42161",
	};

	return (networkMap[network] || network) as `${string}:${string}`;
}

function hasBazaarDiscoveryMetadata(config: ProtectedRouteConfig): boolean {
	return (
		config.inputExample !== undefined ||
		config.inputSchema !== undefined ||
		config.pathParamsSchema !== undefined ||
		config.outputExample !== undefined ||
		config.outputSchema !== undefined
	);
}

function buildBazaarDiscoveryConfig(
	config: ProtectedRouteConfig
): DeclareDiscoveryExtensionInput {
	const output =
		config.outputExample !== undefined || config.outputSchema
			? {
					...(config.outputExample !== undefined
						? { example: config.outputExample }
						: {}),
					...(config.outputSchema ? { schema: config.outputSchema } : {}),
				}
			: undefined;

	return {
		input: config.inputExample ?? {},
		inputSchema: config.inputSchema ?? {
			properties: {},
			additionalProperties: false,
		},
		...(config.pathParamsSchema
			? { pathParamsSchema: config.pathParamsSchema }
			: {}),
		...(output ? { output } : {}),
	};
}

export function buildX402RouteConfig(
	config: ProtectedRouteConfig,
	env: Pick<CloudflareBindings, "NETWORK" | "PAY_TO">
): RouteConfig {
	const routeConfig: RouteConfig = {
		accepts: {
			scheme: "exact",
			price: config.price,
			network: normalizeNetwork(env.NETWORK),
			payTo: env.PAY_TO,
			maxTimeoutSeconds: 300,
		},
		description: config.description,
	};

	if (config.mimeType) {
		routeConfig.mimeType = config.mimeType;
	}

	if (config.serviceName) {
		routeConfig.serviceName = config.serviceName;
	}
	if (config.tags && config.tags.length > 0) {
		routeConfig.tags = config.tags;
	}
	if (config.iconUrl) {
		routeConfig.iconUrl = config.iconUrl;
	}

	if (hasBazaarDiscoveryMetadata(config)) {
		routeConfig.extensions = declareDiscoveryExtension(
			buildBazaarDiscoveryConfig(config)
		);
	}

	return routeConfig;
}

/**
 * Extract path parameters from a request path given a route pattern
 * Supports both :param syntax and /* wildcard syntax
 *
 * @param path - Request path (e.g., "/users/123")
 * @param pattern - Route pattern (e.g., "/users/:id")
 * @returns Extracted parameters or null if path doesn't match pattern
 */
export function extractPathParams(
	path: string,
	pattern: string
): PathParams | null {
	// Normalize paths
	const normalizedPath = path.replace(/\/+$/, "") || "/";
	const normalizedPattern = pattern.replace(/\/+$/, "") || "/";

	// Convert pattern to regex
	const paramNames: string[] = [];
	let regexPattern = normalizedPattern;

	// Handle /* wildcard first - convert to named param
	if (regexPattern.endsWith("/*")) {
		regexPattern = regexPattern.slice(0, -2) + "/(.*)";
		paramNames.push("var1");
	} else {
		// Handle :param syntax
		regexPattern = regexPattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
			paramNames.push(name);
			return "([^/]+)";
		});
	}

	// Exact match for non-parameterized routes
	if (paramNames.length === 0) {
		return normalizedPath === normalizedPattern ? {} : null;
	}

	// Match and extract params
	const regex = new RegExp(`^${regexPattern}$`);
	const match = normalizedPath.match(regex);

	if (!match) {
		return null;
	}

	// Build params object
	const params: PathParams = {};
	paramNames.forEach((name, index) => {
		params[name] = match[index + 1];
	});

	return params;
}

/**
 * Creates middleware for a protected route that requires payment OR valid cookie
 * This dynamically creates payment middleware at request time to access environment variables
 * The route path is automatically determined from the request context
 * Supports v2 dynamic routes with path parameter extraction
 *
 * @param config - Payment configuration
 * @returns Middleware that enforces payment or cookie authentication
 */
export function createProtectedRoute(config: ProtectedRouteConfig) {
	return async (c: Context<AppContext>, next: Next) => {
		// Get the route path from the request context
		// Normalize the path by removing trailing slashes (except for root "/")
		const rawPath = c.req.path;
		const routePath =
			rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;

		// Extract path parameters if this is a dynamic route
		const pathParams = extractPathParams(routePath, config.pattern);
		if (pathParams && Object.keys(pathParams).length > 0) {
			// Store path params in context for handlers to use
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			c.set("pathParams" as any, pathParams);
		}

		// Get the HTTP method
		const method = c.req.method;

		// Convert pattern to route template (for catalog normalization)
		const routeTemplate = patternToRouteTemplate(config.pattern);

		const network = normalizeNetwork(c.env.NETWORK);

		// Create facilitator client
		const facilitatorUrl = c.env.FACILITATOR_URL || CDP_FACILITATOR_URL;
		const facilitatorClient = new CdpFacilitatorClient({
			url: facilitatorUrl,
		});

		// Create resource server with EVM scheme and Bazaar discovery enrichment.
		const resourceServer = new x402ResourceServer(facilitatorClient)
			.register(network, new ExactEvmScheme())
			.registerExtension(bazaarResourceServerExtension);

		// Create route configuration for x402 v2
		const routeKey = `${method} ${routeTemplate}`;
		const routeConfig = buildX402RouteConfig(config, c.env);

		const routes = {
			[routeKey]: routeConfig,
		};

		// Create payment middleware. Facilitator sync is required so the 402
		// response includes CDP-supported asset and amount fields for Bazaar.
		const paymentMw = paymentMiddleware(
			routes,
			resourceServer,
			undefined,
			undefined
		);

		// Apply the combined auth/payment middleware
		return await requirePaymentOrCookie(paymentMw)(c, next);
	};
}
