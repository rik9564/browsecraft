#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ud = mkdtempSync(join(tmpdir(), 'bc-debug2-'));

const proc = spawn(chromePath, [
	'--headless=new',
	'--remote-debugging-port=9333',
	`--user-data-dir=${ud}`,
	'--no-first-run',
	'--no-default-browser-check',
	'--disable-extensions',
	'--no-startup-window',
	'about:blank',
], { stdio: ['pipe', 'pipe', 'pipe'] });

let stderr = '';
proc.stderr.on('data', (d) => { stderr += d.toString(); });

// Wait for Chrome to be ready
await new Promise((resolve) => {
	const check = () => {
		if (stderr.includes('DevTools listening on')) {
			resolve();
		} else {
			setTimeout(check, 200);
		}
	};
	setTimeout(check, 500);
});

console.log('Chrome started. stderr:', stderr.trim());

// Query /json/version to find endpoints
function httpGet(url) {
	return new Promise((resolve, reject) => {
		http.get(url, (res) => {
			let data = '';
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () => resolve(JSON.parse(data)));
		}).on('error', reject);
	});
}

try {
	const version = await httpGet('http://127.0.0.1:9333/json/version');
	console.log('\n=== /json/version ===');
	console.log(JSON.stringify(version, null, 2));

	const list = await httpGet('http://127.0.0.1:9333/json/list');
	console.log('\n=== /json/list ===');
	console.log(JSON.stringify(list, null, 2));
} catch (err) {
	console.error('Error:', err.message);
} finally {
	proc.kill();
}
