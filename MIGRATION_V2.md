# x402 v2 Migration Guide

This repository is **fully compliant with x402 v2** specification and includes support for dynamic routes with Bazaar discovery.

## x402 v2 HTTP Transport Compliance

As of @x402/core v2.14.0, this repository is fully compliant with the x402 HTTP transport v2 spec:

✅ **PAYMENT-REQUIRED Header**: PaymentRequired payload is delivered via a base64-encoded `PAYMENT-REQUIRED` response header (not in the response body)
✅ **402 Status Code**: Returns HTTP 402 Payment Required status
✅ **Dynamic Routes**: Supports parameterized routes with `:param` syntax
✅ **Bazaar Discovery**: Includes metadata for automatic service discovery

**Required Package Versions:**
- `@x402/core: ^2.14.0`
- `@x402/hono: ^2.14.0`
- `@x402/evm: ^2.14.0`
- `@x402/extensions: ^2.14.0`

The v2 HTTP transport delivers the PaymentRequired response using the standard header format:

```http
HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: eyJ4NDAyVmVyc2lvbiI6MiwiYWNjZXB0cyI6W3sic2NoZW1lIjoiZX...
Content-Type: application/json
```

This ensures compatibility with x402 clients and Bazaar discovery services that expect the v2 header format.

## What's New in x402 v2

### 1. Dynamic Routes with Path Parameters

v2 introduces parameterized routes using `:param` syntax, enabling catalog normalization where multiple concrete URLs map to a single route template.

**Example:**

- `/weather/tokyo`, `/weather/london`, `/weather/paris` all map to `/weather/:city`
- Facilitators use the route template as catalog key for discovery

### 2. Bazaar Discovery Extension

Routes can include metadata for automatic discovery in the x402 Bazaar:

- **`pathParamsSchema`** - JSON Schema for path parameters
- **`mimeType`** - Response content type
- **`outputExample`** - Example response for API documentation
- **`serviceName`** - Human-readable service name (≤ 32 chars)
- **`tags`** - Up to 5 topical tags (each ≤ 32 chars)
- **`iconUrl`** - Service icon URL (HTTPS, ≤ 2048 chars)

### 3. Route Template Normalization

Wildcards (`/*`) are automatically converted to named parameters (`:var1`) for catalog consistency.

## Migration Status

✅ **Fully Migrated** - This repository uses:

- `@x402/hono: ^2.14.0`
- `@x402/core: ^2.14.0`
- `@x402/evm: ^2.14.0`
- `@x402/extensions: ^2.14.0`

## Using Dynamic Routes

### Basic Dynamic Route

```jsonc
{
	"pattern": "/users/:id",
	"price": "$0.01",
	"description": "Get user profile by ID",
}
```

### With Bazaar Discovery

```jsonc
{
	"pattern": "/weather/:city",
	"price": "$0.001",
	"description": "Weather data for a city",
	"mimeType": "application/json",
	"pathParamsSchema": {
		"properties": {
			"city": { "type": "string", "description": "City name slug" },
		},
		"required": ["city"],
	},
	"outputExample": {
		"city": "tokyo",
		"weather": "rainy",
		"temperature": 65,
	},
	"serviceName": "Weather API",
	"tags": ["weather", "data", "real-time"],
	"iconUrl": "https://example.com/weather-icon.png",
}
```

### Multiple Path Parameters

```jsonc
{
	"pattern": "/weather/:country/:city",
	"price": "$0.001",
	"description": "Weather data for city in specific country",
	"mimeType": "application/json",
	"pathParamsSchema": {
		"properties": {
			"country": { "type": "string", "description": "Country code" },
			"city": { "type": "string", "description": "City name slug" },
		},
		"required": ["country", "city"],
	},
	"outputExample": {
		"country": "us",
		"city": "san-francisco",
		"weather": "foggy",
		"temperature": 60,
	},
}
```

## How It Works

### 1. Pattern Matching

The system supports three pattern types:

- **Static**: `/api/simulate` - exact match
- **Parameterized**: `/users/:id` - extract named parameters
- **Wildcard**: `/premium/*` - match everything under path (converted to `:var1`)

### 2. Parameter Extraction

Path parameters are automatically extracted and stored in the request context:

```typescript
// Request: GET /users/123
// Pattern: /users/:id
// Extracted: { id: "123" }

// Access in handler:
const pathParams = c.get("pathParams"); // { id: "123" }
```

### 3. Catalog Normalization

All requests to parameterized routes map to the same catalog entry:

```
/weather/tokyo    → /weather/:city
/weather/london   → /weather/:city
/weather/paris    → /weather/:city
```

This allows:

- Single payment for route template (not per city)
- Consolidated discovery in Bazaar
- Efficient catalog management

## Configuration Examples

See `wrangler.jsonc` for commented examples of:

1. Single parameter dynamic routes
2. Multi-parameter dynamic routes
3. Bazaar discovery metadata
4. Service-level metadata

## Testing

Run the dynamic routes test suite:

```bash
npm test
```

Test coverage includes:

- ✅ Pattern to route template conversion
- ✅ Single path parameter extraction
- ✅ Multiple path parameter extraction
- ✅ Wildcard route handling
- ✅ Trailing slash normalization
- ✅ Catalog normalization validation

## API Reference

### `ProtectedRouteConfig`

```typescript
interface ProtectedRouteConfig {
	// Required fields
	pattern: string; // "/users/:id" or "/premium/*"
	price: string; // "$0.01"
	description: string; // Human-readable description

	// Bot Management (optional)
	bot_score_threshold?: number;
	except_detection_ids?: number[];

	// Bazaar Discovery (optional)
	mimeType?: string; // "application/json"
	pathParamsSchema?: {
		properties: Record<string, { type: string; description?: string }>;
		required?: string[];
	};
	outputExample?: unknown; // Example response

	// Service Metadata (optional)
	serviceName?: string; // ≤ 32 chars
	tags?: string[]; // Up to 5, each ≤ 32 chars
	iconUrl?: string; // HTTPS URL, ≤ 2048 chars
}
```

### Helper Functions

```typescript
// Convert pattern to route template
patternToRouteTemplate("/weather/:city"); // → "/weather/:city"
patternToRouteTemplate("/premium/*"); // → "/premium/:var1"

// Extract path parameters
extractPathParams("/users/123", "/users/:id");
// → { id: "123" }

extractPathParams("/weather/us/sf", "/weather/:country/:city");
// → { country: "us", city: "sf" }
```

## Resources

- [x402 Protocol](https://x402.org)
- [Bazaar Extension Docs](https://github.com/x402-foundation/x402/blob/main/docs/extensions/bazaar.mdx)
- [x402 TypeScript Examples](https://github.com/x402-foundation/x402/tree/main/examples/typescript/servers/bazaar)
- [CDP x402 Quickstart](https://docs.cdp.coinbase.com/cdp-apis/docs/x402-quickstart-sellers)

## Backward Compatibility

The implementation is fully backward compatible:

- Existing static routes continue to work
- Wildcard routes (`/*`) still function (converted to `:var1`)
- All v1 configurations are valid in v2
- No breaking changes to existing endpoints
