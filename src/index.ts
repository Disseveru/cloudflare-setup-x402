import "./tools";
import "./workflow";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { createProtectedRoute, type ProtectedRouteConfig } from "./auth";
import { generateJWT } from "./jwt";
import { hasBotManagementException } from "./bot-management";
import type { AppContext, Env } from "./env";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";

const app = new Hono<AppContext>();

/**
 * Built-in protected paths that always require payment
 * These are used for testing and don't need to be configured
 */
const BUILTIN_PROTECTED_PATHS: ProtectedRouteConfig[] = [
	{
		pattern: "/__x402/protected",
		price: "$0.01",
		description: "Access to test protected endpoint",
	},
];

/**
 * Built-in public paths that don't require payment
 * These are used for testing and don't need to be configured
 */
const BUILTIN_PUBLIC_PATHS = ["/__x402/health", "/__x402/config"];
const BUILT_IN_PUBLIC_PATHS = BUILTIN_PUBLIC_PATHS;

/**
 * Proxy a request to the origin server.
 *
 * Three modes:
 * 1. Service Binding (ORIGIN_SERVICE bound): Calls the bound Worker directly.
 *    Best for Worker-to-Worker communication within the same account.
 *    No network hop, faster than URL-based approaches.
 *
 * 2. External Origin (ORIGIN_URL set): Rewrites the URL to the specified origin
 *    while preserving the original Host header. This allows proxying to another
 *    Worker on a Custom Domain or any external service.
 *
 * 3. DNS-based (default): Uses fetch(request) which routes to the origin server
 *    defined in your DNS records. Best for traditional backends.
 */
async function proxyToOrigin(request: Request, env: Env): Promise<Response> {
	// Service Binding: call the bound Worker directly (highest priority)
	if (env.ORIGIN_SERVICE) {
		return env.ORIGIN_SERVICE.fetch(request);
	}

	if (env.ORIGIN_URL) {
		// External Origin mode: rewrite URL to target origin
		const originalUrl = new URL(request.url);
		const targetUrl = new URL(env.ORIGIN_URL);

		const proxiedUrl = new URL(request.url);
		proxiedUrl.hostname = targetUrl.hostname;
		proxiedUrl.protocol = targetUrl.protocol;
		proxiedUrl.port = targetUrl.port;

		const response = await fetch(proxiedUrl, {
			method: request.method,
			headers: request.headers, // Preserves original Host header
			body: request.body,
			redirect: "manual", // Handle redirects ourselves to rewrite Location headers
		});

		// Rewrite Location header in redirects to keep user on the proxy domain
		// We rewrite ALL redirects to stay on the proxy, regardless of where the origin
		// tries to send the user (e.g., cloudflare.com -> www.cloudflare.com)
		const location = response.headers.get("Location");
		if (location) {
			try {
				const locationUrl = new URL(location, proxiedUrl);

				// Rewrite the location to point back to the proxy
				locationUrl.hostname = originalUrl.hostname;
				locationUrl.protocol = originalUrl.protocol;
				locationUrl.port = originalUrl.port;

				const newHeaders = new Headers(response.headers);
				newHeaders.set("Location", locationUrl.toString());

				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers: newHeaders,
				});
			} catch {
				// If URL parsing fails, return response as-is
			}
		}

		return response;
	}

	// DNS-based mode: forward request as-is to origin defined in DNS
	return fetch(request);
}

/**
 * Normalize a route path for matching by trimming trailing slashes
 * while preserving the root path.
 */
function normalizeRoutePath(path: string): string {
	if (path === "/") {
		return path;
	}

	return path.replace(/\/+$/, "") || "/";
}

/**
 * Check if a path matches a route pattern
 * Supports exact matches and prefix matches with /* wildcard
 */
function pathMatchesPattern(path: string, pattern: string): boolean {
	const normalizedPath = normalizeRoutePath(path);

	if (pattern.endsWith("/*")) {
		const base = normalizeRoutePath(pattern.slice(0, -2));
		return normalizedPath === base || normalizedPath.startsWith(`${base}/`);
	}

	return normalizedPath === normalizeRoutePath(pattern);
}

/**
 * Helper to find the protected route config for a given path
 * Includes both built-in protected routes and configured patterns
 */
function findProtectedRouteConfig(
	path: string,
	patterns: ProtectedRouteConfig[]
): ProtectedRouteConfig | null {
	// Check built-in protected routes first, then configured patterns
	const allRoutes = [...BUILTIN_PROTECTED_PATHS, ...patterns];
	return (
		allRoutes.find((config) => pathMatchesPattern(path, config.pattern)) ?? null
	);
}

/**
 * Main proxy handler - intercepts protected routes, proxies everything else
 * Note: This middleware runs for all routes, but route handlers below can still
 * take precedence by being registered after this middleware
 */
app.use("*", async (c, next) => {
	const path = c.req.path;
	const protectedPatterns = c.env.PROTECTED_PATTERNS || [];

	// Special handling for built-in endpoints
	// These are handled by route handlers below, not proxied
	if (BUILT_IN_PUBLIC_PATHS.includes(path)) {
		return next(); // Let the route handler below handle it
	}

	// Check if this path is protected (including /__x402/protected)
	const protectedConfig = findProtectedRouteConfig(path, protectedPatterns);
	if (protectedConfig) {
		// Bot Management Filtering: check if request has exception (human or excepted bot)
		if (hasBotManagementException(c.req.raw, protectedConfig)) {
			if (path === "/__x402/protected") {
				return next();
			}
			return proxyToOrigin(c.req.raw, c.env);
		}

		// Ensure JWT_SECRET is configured before processing protected routes
		if (!c.env.JWT_SECRET) {
			return c.json(
				{
					error:
						"Server misconfigured: JWT_SECRET not set. See README for setup instructions.",
				},
				500
			);
		}

		// Use the protected route middleware
		const protectedMiddleware = createProtectedRoute(protectedConfig);
		let jwtToken = "";

		const result = await protectedMiddleware(c, async () => {
			// After successful auth, check if we need to issue a cookie
			const hasExistingAuth = c.get("auth");

			if (!hasExistingAuth) {
				// This is a new payment - generate JWT cookie
				// Note: This runs after payment verification but BEFORE settlement.
				// We'll check if settlement succeeded before actually using the token.
				jwtToken = await generateJWT(c.env.JWT_SECRET, 3600);
			}

			// Do nothing here - we'll proxy after middleware returns
		});

		// If middleware returned a response (e.g., 402), return it
		if (result) {
			return result;
		}

		// Check if the payment middleware set an error response (e.g., settlement failed)
		// The x402-hono middleware sets c.res to a 402 if settlement fails, even though
		// it doesn't return a Response object. We must check c.res status and discard
		// the JWT token if payment didn't fully complete.
		if (c.res && c.res.status >= 400) {
			// Payment verification succeeded but settlement failed - don't grant access
			return c.res;
		}

		if (path === "/__x402/protected") {
			// If we generated a JWT token, set the cookie BEFORE calling next()
			// so it's included in the response that Hono builds
			if (jwtToken) {
				setCookie(c, "auth_token", jwtToken, {
					httpOnly: true,
					secure: true,
					sameSite: "Strict",
					maxAge: 3600,
					path: "/",
				});
			}

			await next();
			return c.res;
		}

		// Proxy the authenticated request to origin
		const originResponse = await proxyToOrigin(c.req.raw, c.env);

		// If we generated a JWT token, add it as a cookie to the response
		if (jwtToken) {
			// Use Hono's setCookie to generate the proper Set-Cookie header
			setCookie(c, "auth_token", jwtToken, {
				httpOnly: true,
				secure: true,
				sameSite: "Strict",
				maxAge: 3600,
				path: "/",
			});

			// Clone the origin response and add our cookie header
			const newResponse = new Response(originResponse.body, {
				status: originResponse.status,
				statusText: originResponse.statusText,
				headers: new Headers(originResponse.headers),
			});

			// Copy Set-Cookie headers from Hono context to our response
			// Use getSetCookie() to properly handle multiple Set-Cookie headers
			const setCookieHeaders = c.res.headers.getSetCookie();
			for (const cookie of setCookieHeaders) {
				newResponse.headers.append("Set-Cookie", cookie);
			}

			return newResponse;
		}

		// Otherwise, return origin response as-is
		return originResponse;
	}

	// Proxy unprotected routes directly to origin
	return proxyToOrigin(c.req.raw, c.env);
});

/**
 * Built-in test endpoint - always public, never requires payment
 * Used for health checks and testing proxy functionality
 */
app.get("/__x402/health", (c) => {
	return c.json({
		status: "ok",
		proxy: "x402-proxy",
		message: "This endpoint is always public",
		timestamp: Date.now(),
	});
});

/**
 * Config status endpoint - shows current configuration (no secrets exposed)
 * Useful for debugging and verifying deployment
 */
app.get("/__x402/config", (c) => {
	const patterns = (c.env.PROTECTED_PATTERNS || []) as ProtectedRouteConfig[];
	const botFilteringEnabled = patterns.some(
		(p) => p.bot_score_threshold !== undefined
	);

	return c.json({
		network: c.env.NETWORK,
		payTo: c.env.PAY_TO ? `***${c.env.PAY_TO.slice(-6)}` : null,
		hasOriginUrl: !!c.env.ORIGIN_URL,
		hasOriginService: !!c.env.ORIGIN_SERVICE,
		protectedPatterns: patterns.map((p) => ({
			pattern: p.pattern,
			botManagementFiltering:
				p.bot_score_threshold !== undefined
					? {
							threshold: p.bot_score_threshold,
							exceptionsCount: p.except_detection_ids?.length ?? 0,
						}
					: null,
		})),
		botManagementFiltering: botFilteringEnabled,
	});
});

/**
 * Built-in test endpoint - always protected, always requires payment
 * Used for testing payment flow without needing to configure protected patterns
 * This endpoint serves content directly (not proxied to origin)
 */
app.get("/__x402/protected", (c) => {
	return c.json({
		message: "Premium content accessed!",
		timestamp: Date.now(),
		note: "This endpoint always requires payment or valid authentication cookie",
	});
});

/**
 * Shadow State Sandbox - AI-powered simulation environment
 * POST /api/simulate
 *
 * Protected by x402 payment system ($0.02 USDC on Base mainnet)
 * Uses Grok AI via xAI SDK to provide intelligent simulation analysis
 *
 * Accepts rich JSON payload describing what to simulate and returns
 * detailed analysis including success prediction, gas estimates, and AI insights
 */
app.post("/api/simulate", async (c) => {
	try {
		// Validate XAI_API_KEY is configured
		if (!c.env.XAI_API_KEY) {
			return c.json(
				{
					error:
						"Server misconfigured: XAI_API_KEY not set. Contact administrator.",
					simulation_status: "error",
					timestamp: Date.now(),
				},
				500
			);
		}

		// Parse request body
		let payload: unknown;
		try {
			payload = await c.req.json();
		} catch {
			return c.json(
				{
					error: "Invalid JSON payload",
					simulation_status: "error",
					timestamp: Date.now(),
				},
				400
			);
		}

		// Validate payload structure
		if (!payload || typeof payload !== "object") {
			return c.json(
				{
					error: "Payload must be a valid JSON object",
					simulation_status: "error",
					timestamp: Date.now(),
				},
				400
			);
		}

		const simulationPayload = payload as Record<string, unknown>;

		// Build comprehensive analysis prompt for Grok
		const analysisPrompt = `You are an expert blockchain and code simulation analyzer. Analyze the following simulation request and provide detailed insights.

Simulation Request:
${JSON.stringify(simulationPayload, null, 2)}

Provide a comprehensive analysis in the following JSON structure:
{
  "would_succeed": boolean (true if likely to succeed, false otherwise),
  "confidence": number (0-100, confidence percentage in your prediction),
  "estimated_gas": number or null (estimated gas units if blockchain transaction),
  "estimated_cost": string or null (estimated cost in USD if applicable),
  "potential_issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "issue": "description of the issue",
      "recommendation": "how to fix or mitigate"
    }
  ],
  "dry_run_logs": [
    "step-by-step trace of what would happen"
  ],
  "simulated_output": any (expected output or result),
  "grok_analysis": {
    "summary": "brief summary of the simulation",
    "key_findings": ["important findings"],
    "recommendations": ["actionable recommendations"],
    "risk_level": "low" | "medium" | "high" | "critical"
  }
}

IMPORTANT: Respond ONLY with valid JSON, no other text. Be thorough and accurate.`;

		// Call Grok AI for intelligent analysis
		const xaiProvider = createXai({
			apiKey: c.env.XAI_API_KEY,
		});
		const startTime = Date.now();
		const { text: grokResponse } = await generateText({
			model: xaiProvider("grok-2-1212"),
			prompt: analysisPrompt,
			maxRetries: 2,
		});
		const analysisTime = Date.now() - startTime;

		// Parse Grok's response
		let analysis: Record<string, unknown>;
		try {
			// Extract JSON from response (in case Grok adds extra text)
			const jsonMatch = grokResponse.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				throw new Error("No JSON found in response");
			}
			analysis = JSON.parse(jsonMatch[0]);
		} catch {
			// Fallback if Grok didn't return valid JSON
			analysis = {
				would_succeed: false,
				confidence: 50,
				estimated_gas: null,
				estimated_cost: null,
				potential_issues: [
					{
						severity: "medium",
						issue: "AI analysis failed to parse",
						recommendation: "Review simulation manually",
					},
				],
				dry_run_logs: ["Analysis parsing failed"],
				simulated_output: null,
				grok_analysis: {
					summary: "Unable to parse AI response",
					key_findings: ["Response format error"],
					recommendations: ["Retry simulation"],
					risk_level: "medium",
				},
			};
		}

		// Build comprehensive response
		const response = {
			simulation_status: "completed",
			would_succeed: analysis.would_succeed || false,
			confidence: analysis.confidence || 0,
			estimated_gas: analysis.estimated_gas || null,
			estimated_cost: analysis.estimated_cost || null,
			potential_issues: analysis.potential_issues || [],
			dry_run_logs: analysis.dry_run_logs || [],
			simulated_output: analysis.simulated_output || null,
			grok_analysis: analysis.grok_analysis || {
				summary: "Analysis completed",
				key_findings: [],
				recommendations: [],
				risk_level: "low",
			},
			timestamp: Date.now(),
			analysis_time_ms: analysisTime,
			rate_limit_hint:
				"This endpoint is rate-limited. Each simulation costs $0.02 USDC.",
		};

		return c.json(response, 200);
	} catch (error) {
		// Handle errors gracefully
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		return c.json(
			{
				error: "Simulation failed",
				details: errorMessage,
				simulation_status: "error",
				timestamp: Date.now(),
				rate_limit_hint:
					"Service temporarily unavailable. Please retry in a moment.",
			},
			500
		);
	}
});

export default app;
