#!/usr/bin/env node

// Test connecting to Chrome BiDi at /session path
import { WebSocket } from '../packages/browsecraft-bidi/node_modules/ws/wrapper.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = await mkdtemp(join(tmpdir(), 'browsecraft-bidi-'));

const args = [
	'--headless=new',
	'--remote-debugging-port=0',
	`--user-data-dir=${userDataDir}`,
	'--no-first-run',
	'--no-default-browser-check',
	'--disable-extensions',
	'--no-startup-window',
	'about:blank',
];

console.log('Launching Chrome...');
const proc = spawn(chromePath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

let stderr = '';
const wsEndpoint = await new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error(`Timeout. stderr: ${stderr}`)), 15000);
	proc.stderr.on('data', (data) => {
		const chunk = data.toString('utf-8');
		stderr += chunk;
		const m = chunk.match(/DevTools listening on (ws:\/\/.+)/);
		if (m?.[1]) {
			clearTimeout(timer);
			resolve(m[1]);
		}
	});
});

console.log('CDP endpoint:', wsEndpoint);

// Extract host:port from the CDP endpoint and try /session
const url = new URL(wsEndpoint);
const bidiEndpoint = `ws://${url.host}/session`;
console.log('Trying BiDi endpoint:', bidiEndpoint);

try {
	const ws = new WebSocket(bidiEndpoint);
	await new Promise((resolve, reject) => {
		ws.on('open', () => {
			console.log('Connected to /session!');
			resolve();
		});
		ws.on('error', (err) => {
			console.log('/session failed:', err.message);
			reject(err);
		});
		setTimeout(() => reject(new Error('timeout')), 5000);
	});

	// Try session.new
	ws.on('message', (data) => {
		console.log('\n<<< RECV:', JSON.parse(data.toString('utf-8')));
	});

	const cmd = { id: 1, method: 'session.new', params: { capabilities: {} } };
	console.log('\n>>> SEND:', cmd);
	ws.send(JSON.stringify(cmd));

	await new Promise(r => setTimeout(r, 3000));
	ws.close();
} catch (err) {
	console.log('Failed to connect to /session');
	
	// Try other known paths
	for (const path of ['/devtools/browser', '/bidi', '/cdp']) {
		const ep = `ws://${url.host}${path}`;
		console.log(`\nTrying ${ep}...`);
		try {
			const ws2 = new WebSocket(ep);
			await new Promise((resolve, reject) => {
				ws2.on('open', () => {
					console.log(`  Connected to ${path}!`);
					resolve();
				});
				ws2.on('error', (e) => {
					console.log(`  ${path} failed: ${e.message}`);
					reject(e);
				});
				setTimeout(() => reject(new Error('timeout')), 2000);
			});
			
			ws2.on('message', (data) => {
				console.log(`  <<< ${path} RECV:`, JSON.parse(data.toString('utf-8')));
			});
			
			const cmd = { id: 1, method: 'session.new', params: { capabilities: {} } };
			console.log(`  >>> ${path} SEND:`, cmd);
			ws2.send(JSON.stringify(cmd));
			await new Promise(r => setTimeout(r, 2000));
			ws2.close();
		} catch {
			// continue
		}
	}
}

proc.kill('SIGTERM');
await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
console.log('\nDone.');
