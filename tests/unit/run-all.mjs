#!/usr/bin/env node

// ============================================================================
// Run all unit tests
// ============================================================================

import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(__dirname)
	.filter((f) => f.endsWith('.test.mjs'))
	.sort();

console.log(`\n\x1b[1;36m══ Browsecraft Unit Tests ══\x1b[0m`);
console.log(`Found ${files.length} test files\n`);

let totalFailed = 0;
const results = [];

for (const file of files) {
	const filePath = join(__dirname, file);
	try {
		execSync(`node "${filePath}"`, { stdio: 'inherit', timeout: 60_000 });
		results.push({ file, status: 'passed' });
	} catch (err) {
		totalFailed++;
		results.push({ file, status: 'failed' });
	}
}

console.log('\x1b[1;36m══ Summary ══\x1b[0m\n');
for (const r of results) {
	const icon = r.status === 'passed' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
	console.log(`  ${icon} ${r.file}`);
}
console.log(
	`\n  ${results.length - totalFailed} passed, ${totalFailed} failed (${results.length} total)\n`,
);

process.exit(totalFailed > 0 ? 1 : 0);
