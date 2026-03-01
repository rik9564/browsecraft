/**
 * Sanitizes a BiDi message by redacting sensitive information.
 * Handles both direct key matches and nested header/cookie structures.
 */

const SENSITIVE_REGEX = /(?:authorization|cookie|set-cookie|password|token|secret|session|auth)/i;
const REDACTED_VALUE = '[REDACTED]';

/**
 * Recursively redacts sensitive fields from an object.
 */
export function sanitize(obj: unknown): unknown {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(sanitize);
	}

	const result: Record<string, unknown> = {};
	const record = obj as Record<string, unknown>;

	for (const [key, value] of Object.entries(record)) {
		// 1. If it's an array, always recurse into it
		// This prevents redacting entire arrays like 'cookies' or 'headers'
		if (Array.isArray(value)) {
			result[key] = value.map(sanitize);
			continue;
		}

		// 2. Direct key match (e.g., { password: "..." })
		if (SENSITIVE_REGEX.test(key)) {
			result[key] = REDACTED_VALUE;
			continue;
		}

		// 3. Header/Cookie match: { name: "Authorization", value: "..." }
		// If we're looking at the 'value' key, check its sibling 'name'
		if (key === 'value' && typeof record.name === 'string' && SENSITIVE_REGEX.test(record.name)) {
			if (typeof value === 'object' && value !== null && 'value' in (value as object)) {
				// Handle BiDi RemoteValue-like structures: { type: "string", value: "..." }
				result[key] = { ...(value as object), value: REDACTED_VALUE };
			} else {
				result[key] = REDACTED_VALUE;
			}
			continue;
		}

		// 4. Recurse for other objects
		if (typeof value === 'object' && value !== null) {
			result[key] = sanitize(value);
		} else {
			result[key] = value;
		}
	}

	return result;
}
