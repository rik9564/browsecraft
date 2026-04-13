import { readFileSync, writeFileSync } from 'fs';

const p = 'tests/smoke.mjs';
let code = readFileSync(p, 'utf-8');

const SEARCH1 = `		browser = await Browser.launch({ headless: true });
		const page = await browser.newPage();
		await page.goto('https://example.com');`;
const REPLACE1 = `		browser = await Browser.launch({ headless: true, ignoreHTTPSErrors: true });
		const page = await browser.newPage();
		await page.goto('https://example.com');`;

const SEARCH2 = `		browser = await Browser.launch({ headless: true });
		const page = await browser.newPage();

		// page.go() should work like page.goto()
		await page.go('https://example.com');`;
const REPLACE2 = `		browser = await Browser.launch({ headless: true, ignoreHTTPSErrors: true });
		const page = await browser.newPage();

		// page.go() should work like page.goto()
		await page.go('https://example.com');`;

if (code.includes(SEARCH1) && code.includes(SEARCH2)) {
    code = code.replace(SEARCH1, REPLACE1);
    code = code.replace(SEARCH2, REPLACE2);
    writeFileSync(p, code);
    console.log("Success");
} else {
    console.log("Not found");
}
