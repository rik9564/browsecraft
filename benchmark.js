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

const SENSITIVE_KEYS_REGEX =
	/(?:authorization|cookie|set-cookie|password|token|secret|session|auth)/i;

const testStr1 = 'thisisatokenstring';
const testStr2 = 'just_some_random_string';

console.time('Array.some');
for (let i = 0; i < 1000000; i++) {
	SENSITIVE_KEYS.some((k) => testStr1.includes(k));
	SENSITIVE_KEYS.some((k) => testStr2.includes(k));
}
console.timeEnd('Array.some');

console.time('RegExp.test');
for (let i = 0; i < 1000000; i++) {
	SENSITIVE_KEYS_REGEX.test(testStr1);
	SENSITIVE_KEYS_REGEX.test(testStr2);
}
console.timeEnd('RegExp.test');
