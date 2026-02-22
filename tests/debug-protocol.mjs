#!/usr/bin/env node

// Quick debug: what does Chrome actually send back?
import { WebSocket } from '../packages/browsecraft-bidi/node_modules/ws/wrapper.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = await mkdtemp(join(tmpdir(), 'browsecraft-debug-'));

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
		console.log('STDERR:', chunk.trim());
		const m = chunk.match(/DevTools listening on (ws:\/\/.+)/);
		if (m?.[1]) {
			clearTimeout(timer);
			resolve(m[1]);
		}
	});
	proc.on('exit', (code) => {
		clearTimeout(timer);
		reject(new Error(`Chrome exited with code ${code}. stderr: ${stderr}`));
	});
});

console.log('WS Endpoint:', wsEndpoint);

// Connect WebSocket
const ws = new WebSocket(wsEndpoint);
await new Promise((resolve, reject) => {
	ws.on('open', resolve);
	ws.on('error', reject);
});
console.log('WebSocket connected');

// Listen for ALL messages
ws.on('message', (data) => {
	const msg = JSON.parse(data.toString('utf-8'));
	console.log('\n<<< RECEIVED:', JSON.stringify(msg, null, 2));
});

// Send session.new
const cmd1 = { id: 1, method: 'session.new', params: { capabilities: {} } };
console.log('\n>>> SEND:', JSON.stringify(cmd1));
ws.send(JSON.stringify(cmd1));

// Wait for response
await new Promise(r => setTimeout(r, 3000));

// Send browsingContext.create
const cmd2 = { id: 2, method: 'browsingContext.create', params: { type: 'tab' } };
console.log('\n>>> SEND:', JSON.stringify(cmd2));
ws.send(JSON.stringify(cmd2));

await new Promise(r => setTimeout(r, 3000));

// Cleanup
ws.close();
proc.kill('SIGTERM');
await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
console.log('\nDone.');
