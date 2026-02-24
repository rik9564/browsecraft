/**
 * Sanitizes a BiDi message by redacting sensitive information.
 * Handles both direct key matches and nested header/cookie structures.
 */

const SENSITIVE_KEYS = [
	'authorization',
	'cookie',
	'set-cookie',
	'password',
	'token',
	'secret',
	'session',
	'auth',
];
const SENSITIVE_REGEX = new RegExp(SENSITIVE_KEYS.join('|'), 'i');
const REDACTED_VALUE = '[REDACTED]';

/**
 * Recursively redacts sensitive fields from an object.
 */
export function sanitize(obj: unknown): unknown {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		let changed = false;
		const newArray = obj.map((item) => {
			const sanitized = sanitize(item);
			if (sanitized !== item) changed = true;
			return sanitized;
		});
		return changed ? newArray : obj;
	}

	const record = obj as Record<string, unknown>;
	let result: Record<string, unknown> | undefined;

	for (const key of Object.keys(record)) {
		const value = record[key];
		let newValue = value;

		// 1. If it's an array, recurse into it (skipping key check for the array itself)
		if (Array.isArray(value)) {
			newValue = sanitize(value);
		} else {
			// 2. Direct key match
			if (SENSITIVE_REGEX.test(key)) {
				newValue = REDACTED_VALUE;
			}
			// 3. Header/Cookie match: { name: "Authorization", value: "..." }
			else if (
				key.length === 5 &&
				key.toLowerCase() === 'value' &&
				typeof record.name === 'string' &&
				SENSITIVE_REGEX.test(record.name)
			) {
				if (typeof value === 'object' && value !== null && 'value' in (value as object)) {
					// Handle BiDi RemoteValue-like structures: { type: "string", value: "..." }
					newValue = { ...(value as object), value: REDACTED_VALUE };
				} else {
					newValue = REDACTED_VALUE;
				}
			}
			// 4. Recurse for other objects
			else if (typeof value === 'object' && value !== null) {
				newValue = sanitize(value);
			}
		}

		if (newValue !== value) {
			if (!result) result = { ...record };
			result[key] = newValue;
		}
	}

	return result || obj;
}
