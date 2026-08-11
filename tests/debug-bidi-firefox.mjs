import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BiDiSession } from '../packages/browsecraft-bidi/src';

const FIREFOX_PATH = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
const OUTPUT_FILE = join(process.cwd(), 'tests', 'artifacts', 'firefox-example.png');
const OUTPUT_DIR = join(process.cwd(), 'tests', 'artifacts');

function getStringValue(remoteValue) {
	if (!remoteValue || remoteValue.type !== 'string') {
		return null;
	}
	return remoteValue.value;
}

let session = null;

try {
	console.log('1) Launch Firefox and create BiDi session...');
	session = await BiDiSession.launch({
		browser: 'firefox',
		executablePath: FIREFOX_PATH,
		headless: false,
		timeout: 20_000,
	});

	console.log('2) Create a new tab...');
	const { context } = await session.browsingContext.create({ type: 'tab' });

	console.log('3) Navigate to https://example.com ...');
	await session.browsingContext.navigate({
		context,
		url: 'https://example.com',
		wait: 'complete',
	});

	console.log('4) Evaluate document.title ...');
	const evalResult = await session.script.evaluate({
		expression: 'document.title',
		target: { context },
		awaitPromise: false,
	});

	if (evalResult.type !== 'success') {
		throw new Error(
			`script.evaluate failed: ${evalResult.exceptionDetails?.text ?? 'unknown error'}`,
		);
	}

	const title = getStringValue(evalResult.result);
	console.log(`   Page title: ${title ?? '<not a string>'}`);

	if (title !== 'Example Domain') {
		throw new Error(`Unexpected title. Expected "Example Domain", got "${title ?? 'null'}"`);
	}

	console.log('5) Capture screenshot...');
	const screenshot = await session.browsingContext.captureScreenshot({
		context,
		format: { type: 'image/png' },
	});

	await mkdir(OUTPUT_DIR, { recursive: true });
	await writeFile(OUTPUT_FILE, Buffer.from(screenshot.data, 'base64'));
	console.log(`   Screenshot saved: ${OUTPUT_FILE}`);

	console.log('Done. Firefox BiDi end-to-end case passed.');
} catch (error) {
	console.error('Case failed:', error);
	process.exitCode = 1;
} finally {
	if (session) {
		// await session.close().catch(() => {});
	}
}
