// ============================================================================
// Browsecraft - Public API
// Everything you need to write browser tests. Nothing you don't.
//
// import { test, expect, defineConfig } from 'browsecraft';
//
// test('example', async ({ page }) => {
//   await page.goto('https://example.com');
//   await page.click('More information');
//   await expect(page).toHaveURL(/iana/);
// });
// ============================================================================

// Core test API
export { test, describe, beforeAll, afterAll, beforeEach, afterEach, testRegistry, runTest } from './test.js';
export type { TestFixtures, TestCase, TestOptions, TestResult } from './test.js';

// Assertions
export { expect, AssertionError } from './expect.js';

// Configuration
export { defineConfig, resolveConfig } from './config.js';
export type { BrowsecraftConfig, UserConfig, AIConfig } from './config.js';

// Browser & Page (for advanced usage / scripting)
export { Browser, BrowserContext } from './browser.js';
export { Page, ElementHandle } from './page.js';
export type { GotoOptions, ClickOptions, FillOptions, MockResponse } from './page.js';

// Locator types (for advanced usage)
export type { ElementTarget, LocatorOptions } from './locator.js';
