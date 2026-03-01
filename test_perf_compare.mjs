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
const REDACTED_VALUE = '[REDACTED]';

function sanitizeOriginal(obj) {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(sanitizeOriginal);
	}

	const result = {};

	for (const [key, value] of Object.entries(obj)) {
		const lowerKey = key.toLowerCase();

		if (Array.isArray(value)) {
			result[key] = value.map(sanitizeOriginal);
			continue;
		}

		if (SENSITIVE_KEYS.some((k) => lowerKey.includes(k))) {
			result[key] = REDACTED_VALUE;
			continue;
		}

		if (
			lowerKey === 'value' &&
			typeof obj.name === 'string' &&
			SENSITIVE_KEYS.some((k) => obj.name.toLowerCase().includes(k))
		) {
			if (typeof value === 'object' && value !== null && 'value' in value) {
				result[key] = { ...value, value: REDACTED_VALUE };
			} else {
				result[key] = REDACTED_VALUE;
			}
			continue;
		}

		if (typeof value === 'object' && value !== null) {
			result[key] = sanitizeOriginal(value);
		} else {
			result[key] = value;
		}
	}

	return result;
}

const SENSITIVE_REGEX = /(?:authorization|cookie|set-cookie|password|token|secret|session|auth)/i;

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
			key === 'value' && // No need for toLowerCase here since 'value' is lower
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

// Warm up
for (let i = 0; i < 10; i++) sanitizeOriginal(largeObj);
for (let i = 0; i < 10; i++) sanitizeRegex(largeObj);

console.log('Starting benchmark...');

const startOrig = performance.now();
for (let i = 0; i < 500; i++) {
	sanitizeOriginal(largeObj);
}
const endOrig = performance.now();

const startRegex = performance.now();
for (let i = 0; i < 500; i++) {
	sanitizeRegex(largeObj);
}
const endRegex = performance.now();

console.log(`Original: ${endOrig - startOrig} ms`);
console.log(`Regex:    ${endRegex - startRegex} ms`);
console.log(`Speedup:  ${((endOrig - startOrig) / (endRegex - startRegex)).toFixed(2)}x`);
