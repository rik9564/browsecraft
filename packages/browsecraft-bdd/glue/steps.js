// ============================================================================
// BrowseCraft Built-in Step Definitions — IDE Discovery File
//
// This file enables Cucumber IDE extensions (VS Code, IntelliJ) to provide:
//   ✓ Ctrl+Click navigation from .feature files to step definitions
//   ✓ Autocomplete suggestions when writing .feature files
//   ✓ Step definition validation and "undefined step" warnings
//
// DO NOT IMPORT THIS FILE — it exists solely for IDE integration.
// The actual implementations are registered at runtime by registerBuiltInSteps().
//
// Supported extensions:
//   - Cucumber (Gherkin) Full Support (alexkrechik.cucumberautocomplete)
//   - Cucumber Official (CucumberOpen.cucumber-official)
//   - JetBrains Cucumber Plugin
//
// This file is automatically included in the npm package. Configure your
// IDE to point at it — or run `npx browsecraft setup-ide` to auto-configure.
// ============================================================================

// Stub functions — these exist so IDE extensions can parse the patterns.
// At runtime, the real implementations live in browsecraft-bdd/built-in-steps.
function Given(pattern, fn) {}
function When(pattern, fn) {}
function Then(pattern, fn) {}

// =========================================================================
// Navigation
// =========================================================================

/** Navigate to a URL. Example: Given I am on "https://example.com" */
Given('I am on {string}', async function (url) {
	await this.page.goto(url);
});

/** Navigate to a URL. Example: Given I navigate to "https://example.com" */
Given('I navigate to {string}', async function (url) {
	await this.page.goto(url);
});

/** Navigate to a URL. Example: Given I go to "https://example.com" */
Given('I go to {string}', async function (url) {
	await this.page.goto(url);
});

/** Reload the current page. Example: When I reload the page */
When('I reload the page', async function () {
	await this.page.reload();
});

/** Navigate back in browser history. Example: When I go back */
When('I go back', async function () {
	await this.page.goBack();
});

/** Navigate forward in browser history. Example: When I go forward */
When('I go forward', async function () {
	await this.page.goForward();
});

// =========================================================================
// Click / Interaction
// =========================================================================

/** Click an element. Example: When I click "Submit" */
When('I click {string}', async function (target) {
	await this.page.click(target);
});

/** Click a button by name. Example: When I click the "Submit" button */
When('I click the {string} button', async function (name) {
	await this.page.click(name);
});

/** Double-click an element. Example: When I double click "Edit" */
When('I double click {string}', async function (target) {
	await this.page.dblclick(target);
});

/** Hover over an element. Example: When I hover over "Menu" */
When('I hover over {string}', async function (target) {
	await this.page.hover(target);
});

/** Tap an element (touch). Example: When I tap "Submit" */
When('I tap {string}', async function (target) {
	await this.page.tap(target);
});

/** Focus on an element. Example: When I focus on "Email" */
When('I focus on {string}', async function (target) {
	await this.page.focus(target);
});

// =========================================================================
// Form Input
// =========================================================================

/** Fill a field with a value. Example: When I fill "Email" with "user@test.com" */
When('I fill {string} with {string}', async function (target, value) {
	await this.page.fill(target, value);
});

/** Type text into a field. Example: When I type "hello" into "Search" */
When('I type {string} into {string}', async function (text, target) {
	await this.page.type(target, text);
});

/** Clear an input field. Example: When I clear "Email" */
When('I clear {string}', async function (target) {
	await this.page.fill(target, '');
});

/** Select an option from a dropdown. Example: When I select "USA" from "Country" */
When('I select {string} from {string}', async function (value, target) {
	await this.page.select(target, value);
});

/** Check a checkbox. Example: When I check "Remember me" */
When('I check {string}', async function (target) {
	await this.page.check(target);
});

/** Uncheck a checkbox. Example: When I uncheck "Newsletter" */
When('I uncheck {string}', async function (target) {
	await this.page.uncheck(target);
});

// =========================================================================
// Keyboard
// =========================================================================

/** Press a keyboard key. Example: When I press "Enter" */
When('I press {string}', async function (key) {
	await this.page.press(key);
});

// =========================================================================
// Visibility Assertions
// =========================================================================

/** Assert text is visible on the page. Example: Then I should see "Welcome" */
Then('I should see {string}', async function (text) {
	await this.page.see(text);
});

/** Assert text is visible on the page. Example: Then I see "Welcome" */
Then('I see {string}', async function (text) {
	await this.page.see(text);
});

/** Assert text is NOT visible. Example: Then I should not see "Error" */
Then('I should not see {string}', async function (text) {
	await this.page.waitForSelector(text, { state: 'hidden', timeout: 5000 });
});

// =========================================================================
// URL Assertions
// =========================================================================

/** Assert the URL contains a substring. Example: Then the URL should contain "dashboard" */
Then('the URL should contain {string}', async function (expected) {
	const url = await this.page.url();
	if (!url.includes(expected)) {
		throw new Error(`Expected URL to contain "${expected}", got "${url}"`);
	}
});

/** Assert the URL matches exactly. Example: Then the URL should be "https://example.com" */
Then('the URL should be {string}', async function (expected) {
	const url = await this.page.url();
	if (url !== expected) {
		throw new Error(`Expected URL to be "${expected}", got "${url}"`);
	}
});

// =========================================================================
// Title Assertions
// =========================================================================

/** Assert the page title matches. Example: Then the title should be "Home" */
Then('the title should be {string}', async function (expected) {
	const title = await this.page.title();
	if (title !== expected) {
		throw new Error(`Expected title to be "${expected}", got "${title}"`);
	}
});

/** Assert the title contains a substring. Example: Then the title should contain "Home" */
Then('the title should contain {string}', async function (expected) {
	const title = await this.page.title();
	if (!title.includes(expected)) {
		throw new Error(`Expected title to contain "${expected}", got "${title}"`);
	}
});

// =========================================================================
// Text Content Assertions
// =========================================================================

/** Assert element has exact text. Example: Then "#heading" should have text "Hello" */
Then('{string} should have text {string}', async function (target, expected) {
	const text = await this.page.innerText(target);
	if (text !== expected) {
		throw new Error(`Expected "${target}" text to be "${expected}", got "${text}"`);
	}
});

/** Assert element contains text. Example: Then "#heading" should contain text "Hello" */
Then('{string} should contain text {string}', async function (target, expected) {
	const text = await this.page.innerText(target);
	if (!text.includes(expected)) {
		throw new Error(`Expected "${target}" to contain "${expected}", got "${text}"`);
	}
});

// =========================================================================
// Input Value Assertions
// =========================================================================

/** Assert input has a value. Example: Then "#email" should have value "user@test.com" */
Then('{string} should have value {string}', async function (target, expected) {
	const value = await this.page.inputValue(target);
	if (value !== expected) {
		throw new Error(`Expected "${target}" value to be "${expected}", got "${value}"`);
	}
});

// =========================================================================
// Waiting
// =========================================================================

/** Wait for an element to appear. Example: When I wait for ".spinner" */
When('I wait for {string}', async function (target) {
	await this.page.waitForSelector(target);
});

/** Wait for an element to disappear. Example: When I wait for ".spinner" to disappear */
When('I wait for {string} to disappear', async function (target) {
	await this.page.waitForSelector(target, { state: 'hidden' });
});

/** Wait for a number of seconds. Example: When I wait 3 seconds */
When('I wait {int} seconds', async function (seconds) {
	await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
});

// =========================================================================
// Screenshots
// =========================================================================

/** Take a screenshot. Example: When I take a screenshot */
When('I take a screenshot', async function () {
	await this.page.screenshot();
});

// =========================================================================
// Dialogs
// =========================================================================

/** Accept the current dialog/alert. Example: When I accept the dialog */
When('I accept the dialog', async function () {
	await this.page.acceptDialog();
});

/** Dismiss the current dialog/alert. Example: When I dismiss the dialog */
When('I dismiss the dialog', async function () {
	await this.page.dismissDialog();
});

// =========================================================================
// Cookies
// =========================================================================

/** Clear all browser cookies. Example: When I clear all cookies */
When('I clear all cookies', async function () {
	await this.page.clearCookies();
});

// =========================================================================
// Drag and Drop
// =========================================================================

/** Drag an element to another. Example: When I drag "#item" to "#target" */
When('I drag {string} to {string}', async function (source, dest) {
	await this.page.dragTo(source, dest);
});

// =========================================================================
// JavaScript Evaluation
// =========================================================================

/** Execute JavaScript code. Example: When I execute "document.title = 'Test'" */
When('I execute {string}', async function (script) {
	await this.page.evaluate(script);
});
