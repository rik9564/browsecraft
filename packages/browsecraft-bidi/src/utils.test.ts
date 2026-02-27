import { describe, expect, it } from 'vitest';
import { sanitize } from './utils';

describe('sanitize', () => {
	it('should redact sensitive keys', () => {
		const input = {
			password: 'my-secret-password',
			token: '12345',
			session_id: 'abcde',
			authorization: 'Bearer 123',
			'set-cookie': 'foo=bar',
			authKey: 'secret',
			mySecret: 'hidden',
		};
		const expected = {
			password: '[REDACTED]',
			token: '[REDACTED]',
			session_id: '[REDACTED]',
			authorization: '[REDACTED]',
			'set-cookie': '[REDACTED]',
			authKey: '[REDACTED]',
			mySecret: '[REDACTED]',
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should recursivly redact sensitive keys in nested objects', () => {
		const input = {
			user: {
				name: 'John Doe',
				password: 'secret-password',
			},
			metadata: {
				headers: {
					authorization: 'Bearer token',
					'content-type': 'application/json',
				},
			},
		};
		const expected = {
			user: {
				name: 'John Doe',
				password: '[REDACTED]',
			},
			metadata: {
				headers: {
					authorization: '[REDACTED]',
					'content-type': 'application/json',
				},
			},
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should handle arrays correctly', () => {
		const input = {
			tokens: ['abc', 'def'],
			users: [
				{ id: 1, password: 'p1' },
				{ id: 2, password: 'p2' },
			],
		};
		// Arrays themselves are not redacted, but their contents are sanitized recursively
		const expected = {
			tokens: ['abc', 'def'],
			users: [
				{ id: 1, password: '[REDACTED]' },
				{ id: 2, password: '[REDACTED]' },
			],
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should redact entire object if key is sensitive (unless array)', () => {
		const input = {
			cookie: { name: 'foo', value: 'bar' },
		};
		const expected = {
			cookie: '[REDACTED]',
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should handle the special "value" key logic for cookies/headers', () => {
		const input = {
			header: { name: 'Authorization', value: 'Bearer 123' },
			// Using a wrapper to avoid direct key redaction of "cookie" or similar
			response: {
				headers: [
					{ name: 'Set-Cookie', value: 'secret=123' },
					{ name: 'Content-Type', value: 'application/json' },
				],
			},
		};
		const expected = {
			header: { name: 'Authorization', value: '[REDACTED]' },
			response: {
				headers: [
					{ name: 'Set-Cookie', value: '[REDACTED]' },
					{ name: 'Content-Type', value: 'application/json' },
				],
			},
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should handle the special "value" key logic with object values (BiDi RemoteValue)', () => {
		const input = {
			result: {
				name: 'password',
				value: {
					type: 'string',
					value: 'super-secret',
				},
			},
		};
		const expected = {
			result: {
				name: 'password',
				value: {
					type: 'string',
					value: '[REDACTED]',
				},
			},
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should not redact non-sensitive keys', () => {
		const input = {
			name: 'John Doe',
			age: 30,
			email: 'john@example.com',
			publicData: '123',
		};
		expect(sanitize(input)).toEqual(input);
	});

	it('should handle null and primitives', () => {
		expect(sanitize(null)).toBe(null);
		expect(sanitize(123)).toBe(123);
		expect(sanitize('string')).toBe('string');
		expect(sanitize(true)).toBe(true);
	});
});
