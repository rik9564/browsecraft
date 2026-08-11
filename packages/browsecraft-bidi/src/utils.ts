/**
 * Sanitizes a BiDi message by redacting sensitive information.
 * Handles both direct key matches and nested header/cookie structures.
 */

// Optimization: Combined regex for faster matching.
// 'auth' matches 'authorization', 'cookie' matches 'set-cookie', etc.
const SENSITIVE_REGEX = /(?:cookie|password|token|secret|session|auth)/i;
const REDACTED_VALUE = '[REDACTED]';

/**
 * Recursively redacts sensitive fields from an object.
 * Uses a copy-on-write strategy to avoid unnecessary allocations.
 */
export function sanitize(obj: unknown): unknown {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		let copy: unknown[] | null = null;
		for (let i = 0; i < obj.length; i++) {
			const val = obj[i];
			const sanitized = sanitize(val);
			if (sanitized !== val) {
				if (!copy) {
					copy = obj.slice(0, i);
				}
				copy.push(sanitized);
			} else if (copy) {
				copy.push(val);
			}
		}
		return copy || obj;
	}

	const record = obj as Record<string, unknown>;
	let copy: Record<string, unknown> | null = null;

	// Optimization: Pre-check if this object has a sensitive name property
	// This avoids checking 'value' + sibling 'name' in the loop for every key
	const name = record.name;
	const isSensitiveName = typeof name === 'string' && SENSITIVE_REGEX.test(name);

	for (const key in record) {
		// Ensure we only iterate own properties
		if (!Object.prototype.hasOwnProperty.call(record, key)) {
			continue;
		}

		const value = record[key];
		let newValue = value;

		// 1. If it's an array, let recursive sanitize handle it
		// This prevents redacting entire arrays like 'cookies' or 'headers'
		if (Array.isArray(value)) {
			newValue = sanitize(value);
		}
		// 2. Check if key is sensitive
		else if (SENSITIVE_REGEX.test(key)) {
			newValue = REDACTED_VALUE;
		}
		// 3. Check if it's a value for a sensitive name (e.g. { name: "Authorization", value: "..." })
		else if (isSensitiveName && key === 'value') {
			if (typeof value === 'object' && value !== null && 'value' in (value as object)) {
				// Handle BiDi RemoteValue-like structures: { type: "string", value: "..." }
				newValue = { ...(value as object), value: REDACTED_VALUE };
			} else {
				newValue = REDACTED_VALUE;
			}
		}
		// 4. Recurse for other objects
		else {
			newValue = sanitize(value);
		}

		// Copy-on-write: only create a new object if something changed
		if (newValue !== value) {
			if (!copy) {
				copy = { ...record };
			}
			copy[key] = newValue;
		}
	}

	return copy || obj;
}
