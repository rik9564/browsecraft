import { sanitize } from './packages/browsecraft-bidi/dist/index.js';

const largeObj = {
	users: Array.from({ length: 1000 }, (_, i) => ({
		id: i,
		name: `User ${i}`,
		email: `user${i}@example.com`,
		headers: {
			authorization: 'Bearer foo',
			'content-type': 'application/json',
			cookie: 'session=123',
		},
		nested: {
			password: 'secretpassword',
			token: 'secrettoken',
			foo: 'bar',
		},
	})),
};

const SENSITIVE_REGEX = /(?:authorization|cookie|set-cookie|password|token|secret|session|auth)/i;
const REDACTED_VALUE = '[REDACTED]';

function sanitizeRegex(obj) {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(sanitizeRegex);
	}

	const result = {};

	for (const [key, value] of Object.entries(obj)) {
		// 1. If it's an array, always recurse into it
		if (Array.isArray(value)) {
			result[key] = value.map(sanitizeRegex);
			continue;
		}

		// 2. Direct key match
		if (SENSITIVE_REGEX.test(key)) {
			result[key] = REDACTED_VALUE;
			continue;
		}

		// 3. Header/Cookie match
		if (
			key.toLowerCase() === 'value' &&
			typeof obj.name === 'string' &&
			SENSITIVE_REGEX.test(obj.name)
		) {
			if (typeof value === 'object' && value !== null && 'value' in value) {
				result[key] = { ...value, value: REDACTED_VALUE };
			} else {
				result[key] = REDACTED_VALUE;
			}
			continue;
		}

		// 4. Recurse for other objects
		if (typeof value === 'object' && value !== null) {
			result[key] = sanitizeRegex(value);
		} else {
			result[key] = value;
		}
	}

	return result;
}

// Warm up
for (let i = 0; i < 10; i++) sanitizeRegex(largeObj);

const start = performance.now();
for (let i = 0; i < 100; i++) {
	sanitizeRegex(largeObj);
}
const end = performance.now();
console.log(`Execution time regex: ${end - start} ms`);
