import { describe, it, expect } from 'vitest';
import { sanitize } from './utils.js';

describe('sanitize', () => {
	it('should redact sensitive keys in objects', () => {
		const input = {
			id: 1,
			password: 'my-secret-password',
			other: 'value',
		};
		const expected = {
			id: 1,
			password: '[REDACTED]',
			other: 'value',
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should redact sensitive keys in nested objects', () => {
		const input = {
			params: {
				credentials: {
					username: 'admin',
					password: 'secret-password',
				},
			},
		};
		const expected = {
			params: {
				credentials: {
					username: 'admin',
					password: '[REDACTED]',
				},
			},
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should redact Authorization header values', () => {
		const input = {
			method: 'network.continueRequest',
			params: {
				headers: [
					{ name: 'Content-Type', value: 'application/json' },
					{ name: 'Authorization', value: 'Bearer secret-token' },
				],
			},
		};
		const expected = {
			method: 'network.continueRequest',
			params: {
				headers: [
					{ name: 'Content-Type', value: 'application/json' },
					{ name: 'Authorization', value: '[REDACTED]' },
				],
			},
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should redact Authorization header values in BiDi RemoteValue format', () => {
		const input = {
			name: 'Authorization',
			value: { type: 'string', value: 'Bearer secret-token' },
		};
		const expected = {
			name: 'Authorization',
			value: { type: 'string', value: '[REDACTED]' },
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should redact Cookie header values', () => {
		const input = {
			name: 'Cookie',
			value: 'session=123456',
		};
		const expected = {
			name: 'Cookie',
			value: '[REDACTED]',
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should redact tokens and secrets', () => {
		const input = {
			apiToken: 'abc-123',
			appSecret: 'shhh',
		};
		const expected = {
			apiToken: '[REDACTED]',
			appSecret: '[REDACTED]',
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should redact sessions', () => {
		const input = {
			sessionId: 'abc-123',
			userSession: 'xyz-789',
		};
		const expected = {
			sessionId: '[REDACTED]',
			userSession: '[REDACTED]',
		};
		expect(sanitize(input)).toEqual(expected);
	});

	it('should not redact insensitive keys', () => {
		const input = {
			id: 123,
			method: 'browsingContext.navigate',
			params: {
				url: 'https://example.com',
			},
		};
		expect(sanitize(input)).toEqual(input);
	});

	it('should handle arrays and redact their elements', () => {
		const input = [{ password: 'p1' }, { name: 'Authorization', value: 'v1' }];
		const expected = [{ password: '[REDACTED]' }, { name: 'Authorization', value: '[REDACTED]' }];
		expect(sanitize(input)).toEqual(expected);
	});

	it('should not redact entire arrays if the key is sensitive (like cookies)', () => {
		const input = {
			cookies: [{ name: 'session', value: 'secret' }],
		};
		const expected = {
			cookies: [{ name: 'session', value: '[REDACTED]' }],
		};
		expect(sanitize(input)).toEqual(expected);
	});
});
