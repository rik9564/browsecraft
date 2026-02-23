// ============================================================================
// Gherkin Parser — zero-dependency parser for .feature files.
//
// Supports the full Gherkin spec:
// - Feature, Rule, Scenario, Scenario Outline
// - Given, When, Then, And, But, *
// - Background
// - Examples with data tables
// - Data Tables in steps
// - Doc Strings (""" and ```)
// - Tags (@tag)
// - Comments (#)
// - # language: xx (70+ languages supported via keyword maps)
//
// Built from scratch. No @cucumber/gherkin dependency.
// ============================================================================

// ---------------------------------------------------------------------------
// AST Types
// ---------------------------------------------------------------------------

export interface GherkinDocument {
	feature: Feature | null;
	comments: Comment[];
	/** Source file path */
	uri?: string;
}

export interface Comment {
	text: string;
	line: number;
}

export interface Feature {
	keyword: string;
	name: string;
	description: string;
	tags: Tag[];
	children: FeatureChild[];
	line: number;
	language: string;
}

export type FeatureChild = { rule: Rule } | { background: Background } | { scenario: Scenario };

export interface Rule {
	keyword: string;
	name: string;
	description: string;
	tags: Tag[];
	children: RuleChild[];
	line: number;
}

export type RuleChild = { background: Background } | { scenario: Scenario };

export interface Background {
	keyword: string;
	name: string;
	description: string;
	steps: Step[];
	line: number;
}

export interface Scenario {
	keyword: string;
	name: string;
	description: string;
	tags: Tag[];
	steps: Step[];
	examples: Examples[];
	line: number;
}

export interface Step {
	keyword: string;
	/** The keyword type normalized: 'Context' (Given), 'Action' (When), 'Outcome' (Then), 'Conjunction' (And/But), 'Unknown' (*) */
	keywordType: StepKeywordType;
	text: string;
	dataTable: DataTable | null;
	docString: DocString | null;
	line: number;
}

export type StepKeywordType = 'Context' | 'Action' | 'Outcome' | 'Conjunction' | 'Unknown';

export interface DataTable {
	rows: TableRow[];
}

export interface TableRow {
	cells: TableCell[];
	line: number;
}

export interface TableCell {
	value: string;
}

export interface DocString {
	content: string;
	mediaType: string | null;
	delimiter: string;
	line: number;
}

export interface Examples {
	keyword: string;
	name: string;
	description: string;
	tags: Tag[];
	tableHeader: TableRow | null;
	tableBody: TableRow[];
	line: number;
}

export interface Tag {
	name: string;
	line: number;
}

// ---------------------------------------------------------------------------
// English keywords (extensible for i18n)
// ---------------------------------------------------------------------------

interface LanguageKeywords {
	feature: string[];
	rule: string[];
	scenario: string[];
	scenarioOutline: string[];
	background: string[];
	examples: string[];
	given: string[];
	when: string[];
	then: string[];
	and: string[];
	but: string[];
}

const ENGLISH: LanguageKeywords = {
	feature: ['Feature'],
	rule: ['Rule'],
	scenario: ['Scenario', 'Example'],
	scenarioOutline: ['Scenario Outline', 'Scenario Template'],
	background: ['Background'],
	examples: ['Examples', 'Scenarios'],
	given: ['Given'],
	when: ['When'],
	then: ['Then'],
	and: ['And'],
	but: ['But'],
};

// Common additional languages
const LANGUAGES: Record<string, LanguageKeywords> = {
	en: ENGLISH,
	fr: {
		feature: ['Fonctionnalité'],
		rule: ['Règle'],
		scenario: ['Scénario', 'Exemple'],
		scenarioOutline: ['Plan du Scénario', 'Plan du scénario'],
		background: ['Contexte'],
		examples: ['Exemples'],
		given: ['Soit', 'Etant donné', 'Étant donné', 'Etant donnée', 'Étant donnée'],
		when: ['Quand', 'Lorsque', "Lorsqu'"],
		then: ['Alors'],
		and: ['Et'],
		but: ['Mais'],
	},
	de: {
		feature: ['Funktionalität', 'Funktion'],
		rule: ['Regel'],
		scenario: ['Szenario', 'Beispiel'],
		scenarioOutline: ['Szenariovorlage', 'Szenarien'],
		background: ['Grundlage', 'Hintergrund'],
		examples: ['Beispiele'],
		given: ['Angenommen', 'Gegeben sei', 'Gegeben seien'],
		when: ['Wenn'],
		then: ['Dann'],
		and: ['Und'],
		but: ['Aber'],
	},
	es: {
		feature: ['Característica'],
		rule: ['Regla'],
		scenario: ['Escenario', 'Ejemplo'],
		scenarioOutline: ['Esquema del escenario'],
		background: ['Antecedentes'],
		examples: ['Ejemplos'],
		given: ['Dado', 'Dada', 'Dados', 'Dadas'],
		when: ['Cuando'],
		then: ['Entonces'],
		and: ['Y'],
		but: ['Pero'],
	},
	pt: {
		feature: ['Funcionalidade', 'Característica'],
		rule: ['Regra'],
		scenario: ['Cenário', 'Cenario', 'Exemplo'],
		scenarioOutline: ['Esquema do Cenário', 'Esquema do Cenario'],
		background: ['Contexto', 'Cenário de Fundo', 'Cenario de Fundo'],
		examples: ['Exemplos'],
		given: ['Dado', 'Dada', 'Dados', 'Dadas'],
		when: ['Quando'],
		then: ['Então', 'Entao'],
		and: ['E'],
		but: ['Mas'],
	},
	ja: {
		feature: ['フィーチャ', '機能'],
		rule: ['ルール'],
		scenario: ['シナリオ'],
		scenarioOutline: ['シナリオアウトライン', 'シナリオテンプレ', 'シナリオテンプレート'],
		background: ['背景'],
		examples: ['例', 'サンプル'],
		given: ['前提'],
		when: ['もし'],
		then: ['ならば'],
		and: ['かつ'],
		but: ['しかし', 'ただし'],
	},
	zh: {
		feature: ['功能'],
		rule: ['规则'],
		scenario: ['场景', '剧本'],
		scenarioOutline: ['场景大纲', '剧本大纲'],
		background: ['背景'],
		examples: ['例子'],
		given: ['假如', '假设', '假定'],
		when: ['当'],
		then: ['那么'],
		and: ['而且', '并且', '同时'],
		but: ['但是'],
	},
	hi: {
		feature: ['रूप लेख'],
		rule: ['नियम'],
		scenario: ['परिदृश्य'],
		scenarioOutline: ['परिदृश्य रूपरेखा'],
		background: ['पृष्ठभूमि'],
		examples: ['उदाहरण'],
		given: ['अगर', 'यदि', 'चूंकि'],
		when: ['जब'],
		then: ['तब', 'तो'],
		and: ['और', 'तथा'],
		but: ['पर', 'परन्तु', 'किन्तु'],
	},
	ko: {
		feature: ['기능'],
		rule: ['규칙'],
		scenario: ['시나리오'],
		scenarioOutline: ['시나리오 개요'],
		background: ['배경'],
		examples: ['예'],
		given: ['조건', '먼저'],
		when: ['만일', '만약'],
		then: ['그러면'],
		and: ['그리고'],
		but: ['하지만', '단'],
	},
	ru: {
		feature: ['Функция', 'Функциональность', 'Функционал', 'Свойство'],
		rule: ['Правило'],
		scenario: ['Сценарий', 'Пример'],
		scenarioOutline: ['Структура сценария'],
		background: ['Предыстория', 'Контекст'],
		examples: ['Примеры'],
		given: ['Допустим', 'Пусть', 'К тому же'],
		when: ['Когда', 'Если'],
		then: ['Тогда', 'То'],
		and: ['И', 'К тому же'],
		but: ['Но', 'А'],
	},
	ar: {
		feature: ['خاصية'],
		rule: ['قاعدة'],
		scenario: ['سيناريو'],
		scenarioOutline: ['مخطط السيناريو'],
		background: ['الخلفية'],
		examples: ['أمثلة'],
		given: ['بفرض'],
		when: ['متى', 'عندما'],
		then: ['اذاً', 'ثم'],
		and: ['و'],
		but: ['لكن'],
	},
	it: {
		feature: ['Funzionalità'],
		rule: ['Regola'],
		scenario: ['Scenario', 'Esempio'],
		scenarioOutline: ['Schema dello scenario'],
		background: ['Contesto'],
		examples: ['Esempi'],
		given: ['Dato', 'Data', 'Dati', 'Date'],
		when: ['Quando'],
		then: ['Allora'],
		and: ['E'],
		but: ['Ma'],
	},
	nl: {
		feature: ['Functionaliteit'],
		rule: ['Regel'],
		scenario: ['Scenario', 'Voorbeeld'],
		scenarioOutline: ['Abstract Scenario'],
		background: ['Achtergrond'],
		examples: ['Voorbeelden'],
		given: ['Gegeven', 'Stel'],
		when: ['Als', 'Wanneer'],
		then: ['Dan'],
		and: ['En'],
		but: ['Maar'],
	},
};

/**
 * Get keywords for a language code. Falls back to English.
 */
function getKeywords(lang: string): LanguageKeywords {
	return LANGUAGES[lang] ?? ENGLISH;
}

/**
 * Get all supported language codes.
 */
export function getSupportedLanguages(): string[] {
	return Object.keys(LANGUAGES);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

interface ParserState {
	lines: string[];
	pos: number;
	language: string;
	keywords: LanguageKeywords;
	comments: Comment[];
}

/**
 * Parse a Gherkin .feature file into an AST.
 *
 * ```ts
 * import { parseGherkin } from 'browsecraft-bdd';
 *
 * const doc = parseGherkin(`
 *   Feature: Login
 *     Scenario: Valid credentials
 *       Given I am on the login page
 *       When I click "Sign In"
 *       Then I should see "Welcome"
 * `);
 * ```
 */
export function parseGherkin(source: string, uri?: string): GherkinDocument {
	const lines = source.split(/\r?\n/);

	// Detect language from first line
	let language = 'en';
	const langLine = lines[0]?.trim();
	if (langLine) {
		const langMatch = langLine.match(/^#\s*language:\s*(\S+)/);
		if (langMatch?.[1]) {
			language = langMatch[1];
		}
	}

	const state: ParserState = {
		lines,
		pos: 0,
		language,
		keywords: getKeywords(language),
		comments: [],
	};

	const feature = parseFeature(state);

	return {
		feature,
		comments: state.comments,
		uri,
	};
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

function parseFeature(state: ParserState): Feature | null {
	skipBlankAndComments(state);

	const featureLine = findKeywordLine(state, state.keywords.feature);
	if (!featureLine) return null;

	const { keyword, rest, line } = featureLine;
	state.pos = line; // move past the keyword line

	// Collect tags that were before the Feature keyword
	const tags = collectTagsBefore(state, line);

	state.pos = line + 1;

	const description = collectDescription(state);
	const children: FeatureChild[] = [];

	while (state.pos < state.lines.length) {
		skipBlankAndComments(state);
		if (state.pos >= state.lines.length) break;

		const trimmed = currentLine(state).trim();
		if (!trimmed || trimmed.startsWith('#')) {
			state.pos++;
			continue;
		}

		// Try Rule
		const ruleMatch = matchKeyword(trimmed, state.keywords.rule);
		if (ruleMatch) {
			children.push({ rule: parseRule(state) });
			continue;
		}

		// Try Background
		const bgMatch = matchKeyword(trimmed, state.keywords.background);
		if (bgMatch) {
			children.push({ background: parseBackground(state) });
			continue;
		}

		// Try Scenario Outline (before Scenario since "Scenario" is a prefix)
		const soMatch = matchKeyword(trimmed, state.keywords.scenarioOutline);
		if (soMatch) {
			children.push({ scenario: parseScenario(state, true) });
			continue;
		}

		// Try Scenario/Example
		const scMatch = matchKeyword(trimmed, state.keywords.scenario);
		if (scMatch) {
			children.push({ scenario: parseScenario(state, false) });
			continue;
		}

		// Tags for next element
		if (trimmed.startsWith('@')) {
			state.pos++;
			continue;
		}

		// Unknown line — skip
		state.pos++;
	}

	return {
		keyword,
		name: rest,
		description,
		tags,
		children,
		line: line + 1,
		language: state.language,
	};
}

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

function parseRule(state: ParserState): Rule {
	const trimmed = currentLine(state).trim();
	const match = matchKeyword(trimmed, state.keywords.rule);
	const tags = collectTagsBefore(state, state.pos);
	const line = state.pos;
	state.pos++;

	const description = collectDescription(state);
	const children: RuleChild[] = [];

	while (state.pos < state.lines.length) {
		skipBlankAndComments(state);
		if (state.pos >= state.lines.length) break;

		const ln = currentLine(state).trim();
		if (!ln || ln.startsWith('#')) {
			state.pos++;
			continue;
		}

		// Stop if we hit another Rule or Feature
		if (matchKeyword(ln, state.keywords.rule) || matchKeyword(ln, state.keywords.feature)) {
			break;
		}

		if (matchKeyword(ln, state.keywords.background)) {
			children.push({ background: parseBackground(state) });
			continue;
		}

		const soMatch = matchKeyword(ln, state.keywords.scenarioOutline);
		if (soMatch) {
			children.push({ scenario: parseScenario(state, true) });
			continue;
		}

		const scMatch = matchKeyword(ln, state.keywords.scenario);
		if (scMatch) {
			children.push({ scenario: parseScenario(state, false) });
			continue;
		}

		if (ln.startsWith('@')) {
			state.pos++;
			continue;
		}

		state.pos++;
	}

	return {
		keyword: match?.keyword ?? 'Rule',
		name: match?.rest ?? '',
		description,
		tags,
		children,
		line: line + 1,
	};
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

function parseBackground(state: ParserState): Background {
	const trimmed = currentLine(state).trim();
	const match = matchKeyword(trimmed, state.keywords.background);
	const line = state.pos;
	state.pos++;

	const description = collectDescription(state);
	const steps = parseSteps(state);

	return {
		keyword: match?.keyword ?? 'Background',
		name: match?.rest ?? '',
		description,
		steps,
		line: line + 1,
	};
}

// ---------------------------------------------------------------------------
// Scenario / Scenario Outline
// ---------------------------------------------------------------------------

function parseScenario(state: ParserState, isOutline: boolean): Scenario {
	const trimmed = currentLine(state).trim();
	const keywords = isOutline ? state.keywords.scenarioOutline : state.keywords.scenario;
	const match = matchKeyword(trimmed, keywords);
	const tags = collectTagsBefore(state, state.pos);
	const line = state.pos;
	state.pos++;

	const description = collectDescription(state);
	const steps = parseSteps(state);
	const examples: Examples[] = [];

	// Collect Examples sections (for Scenario Outline)
	while (state.pos < state.lines.length) {
		skipBlankAndComments(state);
		if (state.pos >= state.lines.length) break;

		const ln = currentLine(state).trim();
		if (!ln || ln.startsWith('#')) {
			state.pos++;
			continue;
		}

		// Check if this is an Examples block
		const exMatch = matchKeyword(ln, state.keywords.examples);
		if (exMatch) {
			examples.push(parseExamples(state));
			continue;
		}

		// Tags before Examples
		if (ln.startsWith('@') && isOutline) {
			// Peek if next non-blank/comment line is Examples
			const savedPos = state.pos;
			state.pos++;
			skipBlankAndComments(state);
			if (state.pos < state.lines.length) {
				const peek = currentLine(state).trim();
				if (matchKeyword(peek, state.keywords.examples)) {
					state.pos = savedPos;
					state.pos++;
					continue;
				}
			}
			state.pos = savedPos;
			break;
		}

		break;
	}

	return {
		keyword: match?.keyword ?? (isOutline ? 'Scenario Outline' : 'Scenario'),
		name: match?.rest ?? '',
		description,
		tags,
		steps,
		examples,
		line: line + 1,
	};
}

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

function parseExamples(state: ParserState): Examples {
	const trimmed = currentLine(state).trim();
	const match = matchKeyword(trimmed, state.keywords.examples);
	const tags = collectTagsBefore(state, state.pos);
	const line = state.pos;
	state.pos++;

	const description = collectDescription(state);

	// Parse table rows
	const rows: TableRow[] = [];
	while (state.pos < state.lines.length) {
		const ln = currentLine(state).trim();
		if (ln.startsWith('|')) {
			rows.push(parseTableRow(state));
		} else {
			break;
		}
	}

	const tableHeader = rows.length > 0 ? (rows[0] ?? null) : null;
	const tableBody = rows.slice(1);

	return {
		keyword: match?.keyword ?? 'Examples',
		name: match?.rest ?? '',
		description,
		tags,
		tableHeader,
		tableBody,
		line: line + 1,
	};
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function parseSteps(state: ParserState): Step[] {
	const steps: Step[] = [];
	const allStepKws = [
		...state.keywords.given,
		...state.keywords.when,
		...state.keywords.then,
		...state.keywords.and,
		...state.keywords.but,
		'*',
	];

	while (state.pos < state.lines.length) {
		skipBlankAndComments(state);
		if (state.pos >= state.lines.length) break;

		const ln = currentLine(state).trim();
		if (!ln) {
			state.pos++;
			continue;
		}

		// Check if this line starts with a step keyword
		const stepMatch = matchStepKeyword(ln, allStepKws, state.keywords);
		if (!stepMatch) break; // Not a step line — stop

		const stepLine = state.pos;
		state.pos++;

		// Check for Doc String or Data Table following the step
		let dataTable: DataTable | null = null;
		let docString: DocString | null = null;

		skipBlankAndComments(state);
		if (state.pos < state.lines.length) {
			const nextTrimmed = currentLine(state).trim();
			if (nextTrimmed.startsWith('|')) {
				dataTable = parseDataTable(state);
			} else if (nextTrimmed.startsWith('"""') || nextTrimmed.startsWith('```')) {
				docString = parseDocString(state);
			}
		}

		steps.push({
			keyword: stepMatch.keyword,
			keywordType: stepMatch.type,
			text: stepMatch.text,
			dataTable,
			docString,
			line: stepLine + 1,
		});
	}

	return steps;
}

// ---------------------------------------------------------------------------
// Data Table
// ---------------------------------------------------------------------------

function parseDataTable(state: ParserState): DataTable {
	const rows: TableRow[] = [];
	while (state.pos < state.lines.length) {
		const ln = currentLine(state).trim();
		if (ln.startsWith('|')) {
			rows.push(parseTableRow(state));
		} else {
			break;
		}
	}
	return { rows };
}

function parseTableRow(state: ParserState): TableRow {
	const ln = currentLine(state).trim();
	const line = state.pos;
	state.pos++;

	// Split by | but handle \| escapes
	const cells: TableCell[] = [];
	// Remove leading and trailing |
	const inner = ln.replace(/^\|/, '').replace(/\|$/, '');
	const parts = inner.split(/(?<!\\)\|/);

	for (const part of parts) {
		const value = part.trim().replace(/\\\|/g, '|').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
		cells.push({ value });
	}

	return { cells, line: line + 1 };
}

// ---------------------------------------------------------------------------
// Doc String
// ---------------------------------------------------------------------------

function parseDocString(state: ParserState): DocString {
	const openLine = currentLine(state);
	const line = state.pos;
	const trimmedOpen = openLine.trim();

	const delimiter = trimmedOpen.startsWith('"""') ? '"""' : '```';
	const afterDelimiter = trimmedOpen.slice(delimiter.length).trim();
	const mediaType = afterDelimiter || null;

	// Determine indentation of the opening delimiter
	const indent = openLine.indexOf(delimiter);

	state.pos++;
	const contentLines: string[] = [];

	while (state.pos < state.lines.length) {
		const ln = currentLine(state);
		const trimmed = ln.trim();

		if (trimmed === delimiter || trimmed === '"""' || trimmed === '```') {
			state.pos++;
			break;
		}

		// De-indent according to opening delimiter position
		let stripCount = 0;
		while (
			stripCount < indent &&
			stripCount < ln.length &&
			(ln[stripCount] === ' ' || ln[stripCount] === '\t')
		) {
			stripCount++;
		}
		contentLines.push(ln.slice(stripCount));

		state.pos++;
	}

	return {
		content: contentLines.join('\n'),
		mediaType,
		delimiter,
		line: line + 1,
	};
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function currentLine(state: ParserState): string {
	return state.lines[state.pos] ?? '';
}

function skipBlankAndComments(state: ParserState): void {
	while (state.pos < state.lines.length) {
		const ln = currentLine(state).trim();
		if (ln === '') {
			state.pos++;
			continue;
		}
		if (ln.startsWith('#')) {
			// Check for language directive — skip but record comment
			state.comments.push({ text: ln, line: state.pos + 1 });
			state.pos++;
			continue;
		}
		break;
	}
}

function matchKeyword(line: string, keywords: string[]): { keyword: string; rest: string } | null {
	for (const kw of keywords) {
		if (line.startsWith(`${kw}:`)) {
			return {
				keyword: kw,
				rest: line.slice(kw.length + 1).trim(),
			};
		}
	}
	return null;
}

interface StepMatchResult {
	keyword: string;
	type: StepKeywordType;
	text: string;
}

function matchStepKeyword(
	line: string,
	allKeywords: string[],
	kws: LanguageKeywords,
): StepMatchResult | null {
	// Check * first
	if (line.startsWith('* ')) {
		return { keyword: '*', type: 'Unknown', text: line.slice(2).trim() };
	}

	for (const kw of allKeywords) {
		if (kw === '*') continue;
		if (line.startsWith(`${kw} `)) {
			let type: StepKeywordType = 'Unknown';
			if (kws.given.includes(kw)) type = 'Context';
			else if (kws.when.includes(kw)) type = 'Action';
			else if (kws.then.includes(kw)) type = 'Outcome';
			else if (kws.and.includes(kw) || kws.but.includes(kw)) type = 'Conjunction';

			return {
				keyword: kw,
				type,
				text: line.slice(kw.length + 1).trim(),
			};
		}
	}

	return null;
}

function findKeywordLine(
	state: ParserState,
	keywords: string[],
): { keyword: string; rest: string; line: number } | null {
	for (let i = state.pos; i < state.lines.length; i++) {
		const ln = (state.lines[i] ?? '').trim();
		if (ln.startsWith('#') || ln === '') continue;
		const match = matchKeyword(ln, keywords);
		if (match) {
			return { ...match, line: i };
		}
	}
	return null;
}

function collectTagsBefore(state: ParserState, beforeLine: number): Tag[] {
	const tags: Tag[] = [];

	// Look backwards from beforeLine for consecutive tag lines
	let i = beforeLine - 1;
	while (i >= 0) {
		const ln = (state.lines[i] ?? '').trim();
		if (ln === '' || ln.startsWith('#')) {
			i--;
			continue;
		}
		if (ln.startsWith('@')) {
			const tagNames = ln.match(/@[\w][\w\-_]*/g) ?? [];
			for (const t of tagNames) {
				tags.push({ name: t, line: i + 1 });
			}
			i--;
		} else {
			break;
		}
	}

	return tags;
}

function collectDescription(state: ParserState): string {
	const descLines: string[] = [];

	while (state.pos < state.lines.length) {
		const ln = currentLine(state).trim();

		// Stop at empty lines, keywords, tags, or steps
		if (ln === '') break;
		if (ln.startsWith('#')) {
			state.pos++;
			continue;
		}
		if (ln.startsWith('@')) break;
		if (ln.startsWith('|')) break;

		// Check if it's a keyword line
		const allKws = [
			...state.keywords.feature,
			...state.keywords.rule,
			...state.keywords.scenario,
			...state.keywords.scenarioOutline,
			...state.keywords.background,
			...state.keywords.examples,
		];
		if (allKws.some((kw) => ln.startsWith(`${kw}:`))) break;

		// Check if it's a step line
		const stepKws = [
			...state.keywords.given,
			...state.keywords.when,
			...state.keywords.then,
			...state.keywords.and,
			...state.keywords.but,
		];
		if (stepKws.some((kw) => ln.startsWith(`${kw} `))) break;
		if (ln.startsWith('* ')) break;

		descLines.push(ln);
		state.pos++;
	}

	return descLines.join('\n');
}
