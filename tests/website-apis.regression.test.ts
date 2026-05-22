import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import type { Context } from "hono";
import {
	handleCompliance,
	handleEnrich,
	handleExtract,
} from "../src/website-apis";
import type { AppContext } from "../src/env";

const app = new Hono();
for (const method of ["get", "post"] as const) {
	app[method]("/api/enrich", (c) => handleEnrich(c as Context<AppContext>));
	app[method]("/api/compliance", (c) =>
		handleCompliance(c as Context<AppContext>)
	);
	app[method]("/api/extract", (c) => handleExtract(c as Context<AppContext>));
}

const SAMPLE_HTML = `
<!doctype html>
<html>
<head>
  <title>Acme Platform</title>
  <meta name="description" content="Workflow platform for modern teams" />
</head>
<body>
  <h1>Automate your work</h1>
  <h2>Frequently Asked Questions</h2>
  <p>Acme helps distributed teams run operations with reliable automation and visibility across every process.</p>
  <p>Our cookie policy and privacy policy are available on dedicated pages for transparency.</p>
  <a href="/contact">Contact</a>
  <a href="/about">About</a>
  <a href="/pricing">Pricing</a>
  <a href="/blog">Blog</a>
  <a href="/careers">Careers</a>
  <a href="https://www.linkedin.com/company/acme">LinkedIn</a>
  <a href="/privacy">Privacy Policy</a>
  <a href="/terms">Terms of Service</a>
  <a href="/refund">Refund Policy</a>
  <a href="/book-demo">Book Demo</a>
  <summary>How does onboarding work?</summary>
</body>
</html>
`;

function htmlResponse(
	body: string,
	contentType = "text/html; charset=utf-8",
	status = 200
) {
	return new Response(body, {
		status,
		headers: {
			"content-type": contentType,
		},
	});
}

async function withMockedFetch(
	mock: typeof globalThis.fetch,
	run: () => Promise<void>
) {
	const original = globalThis.fetch;
	globalThis.fetch = mock;
	try {
		await run();
	} finally {
		globalThis.fetch = original;
	}
}

test("enrich returns structured lead signals from target page", async () => {
	await withMockedFetch(
		async () => htmlResponse(SAMPLE_HTML),
		async () => {
			const response = await app.request(
				"http://localhost/api/enrich?url=https://example.com"
			);

			assert.equal(response.status, 200);
			const json = (await response.json()) as {
				title: string;
				domain: string;
				links: { pricing: string[]; social: string[] };
				categoryHints: string[];
			};

			assert.equal(json.title, "Acme Platform");
			assert.equal(json.domain, "example.com");
			assert.equal(json.links.pricing[0], "https://example.com/pricing");
			assert.equal(
				json.links.social[0],
				"https://www.linkedin.com/company/acme"
			);
			assert.ok(json.categoryHints.includes("saas"));
		}
	);
});

test("compliance includes disclaimer and detected trust signals", async () => {
	await withMockedFetch(
		async () => htmlResponse(SAMPLE_HTML),
		async () => {
			const response = await app.request(
				"http://localhost/api/compliance?domain=example.com"
			);

			assert.equal(response.status, 200);
			const json = (await response.json()) as {
				signals: {
					privacyPolicyFound: boolean;
					termsFound: boolean;
					refundOrReturnsFound: boolean;
				};
				disclaimer: string;
			};

			assert.equal(json.signals.privacyPolicyFound, true);
			assert.equal(json.signals.termsFound, true);
			assert.equal(json.signals.refundOrReturnsFound, true);
			assert.match(json.disclaimer, /not legal advice/i);
		}
	);
});

test("extract supports JSON body input and returns LLM-friendly blocks", async () => {
	await withMockedFetch(
		async () => htmlResponse(SAMPLE_HTML),
		async () => {
			const response = await app.request("http://localhost/api/extract", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ url: "https://example.com" }),
			});

			assert.equal(response.status, 200);
			const json = (await response.json()) as {
				headings: string[];
				callsToAction: Array<{ text: string; href: string }>;
				faqLike: string[];
			};

			assert.ok(json.headings.includes("Automate your work"));
			assert.equal(json.callsToAction[0]?.text, "Book Demo");
			assert.equal(json.faqLike[0], "How does onboarding work?");
		}
	);
});

test("website APIs fail safely for missing or unsupported target content", async () => {
	const missingTargetResponse = await app.request(
		"http://localhost/api/enrich"
	);
	assert.equal(missingTargetResponse.status, 400);

	await withMockedFetch(
		async () => htmlResponse('{"ok":true}', "application/json"),
		async () => {
			const unsupportedResponse = await app.request(
				"http://localhost/api/enrich?url=example.com"
			);
			assert.equal(unsupportedResponse.status, 415);
		}
	);
});
