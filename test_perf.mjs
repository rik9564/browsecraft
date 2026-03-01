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

const start = performance.now();
for (let i = 0; i < 100; i++) {
	sanitize(largeObj);
}
const end = performance.now();
console.log(`Execution time: ${end - start} ms`);
