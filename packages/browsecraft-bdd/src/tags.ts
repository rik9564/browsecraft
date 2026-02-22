// ============================================================================
// Tag Expression Parser & Evaluator — built from scratch.
//
// Supports:
// - Tag names: @smoke, @regression, @wip
// - Boolean operators: and, or, not
// - Parentheses for grouping: (@smoke or @regression) and not @wip
// - Nested expressions with arbitrary depth
//
// Grammar (recursive descent):
//   expr     = or_expr
//   or_expr  = and_expr ('or' and_expr)*
//   and_expr = not_expr ('and' not_expr)*
//   not_expr = 'not' not_expr | primary
//   primary  = TAG | '(' expr ')'
//
// Compatible with Cucumber's tag expression format.
// ============================================================================

// ---------------------------------------------------------------------------
// AST Types
// ---------------------------------------------------------------------------

export type TagExpression =
	| { type: 'tag'; name: string }
	| { type: 'and'; left: TagExpression; right: TagExpression }
	| { type: 'or'; left: TagExpression; right: TagExpression }
	| { type: 'not'; operand: TagExpression };

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
	| { type: 'TAG'; value: string }
	| { type: 'AND' }
	| { type: 'OR' }
	| { type: 'NOT' }
	| { type: 'LPAREN' }
	| { type: 'RPAREN' }
	| { type: 'EOF' };

function tokenize(input: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;

	while (i < input.length) {
		// Skip whitespace
		if (/\s/.test(input[i]!)) {
			i++;
			continue;
		}

		// Parentheses
		if (input[i] === '(') {
			tokens.push({ type: 'LPAREN' });
			i++;
			continue;
		}
		if (input[i] === ')') {
			tokens.push({ type: 'RPAREN' });
			i++;
			continue;
		}

		// Tags: @name
		if (input[i] === '@') {
			let name = '@';
			i++;
			while (i < input.length && /[\w\-_]/.test(input[i]!)) {
				name += input[i];
				i++;
			}
			if (name === '@') {
				throw new Error(`Invalid tag expression: lone '@' at position ${i}`);
			}
			tokens.push({ type: 'TAG', value: name });
			continue;
		}

		// Keywords: and, or, not
		const rest = input.slice(i);
		const kwMatch = rest.match(/^(and|or|not)\b/i);
		if (kwMatch) {
			const kw = kwMatch[1]!.toLowerCase();
			if (kw === 'and') tokens.push({ type: 'AND' });
			else if (kw === 'or') tokens.push({ type: 'OR' });
			else tokens.push({ type: 'NOT' });
			i += kw.length;
			continue;
		}

		throw new Error(
			`Unexpected character '${input[i]}' at position ${i} in tag expression: "${input}"`,
		);
	}

	tokens.push({ type: 'EOF' });
	return tokens;
}

// ---------------------------------------------------------------------------
// Parser (recursive descent)
// ---------------------------------------------------------------------------

class TagExpressionParser {
	private pos = 0;

	constructor(private readonly tokens: Token[]) {}

	parse(): TagExpression {
		const expr = this.parseOr();
		this.expect('EOF');
		return expr;
	}

	private parseOr(): TagExpression {
		let left = this.parseAnd();

		while (this.peek().type === 'OR') {
			this.advance(); // consume 'or'
			const right = this.parseAnd();
			left = { type: 'or', left, right };
		}

		return left;
	}

	private parseAnd(): TagExpression {
		let left = this.parseNot();

		while (this.peek().type === 'AND') {
			this.advance(); // consume 'and'
			const right = this.parseNot();
			left = { type: 'and', left, right };
		}

		return left;
	}

	private parseNot(): TagExpression {
		if (this.peek().type === 'NOT') {
			this.advance(); // consume 'not'
			const operand = this.parseNot();
			return { type: 'not', operand };
		}

		return this.parsePrimary();
	}

	private parsePrimary(): TagExpression {
		const token = this.peek();

		if (token.type === 'TAG') {
			this.advance();
			return { type: 'tag', name: token.value };
		}

		if (token.type === 'LPAREN') {
			this.advance(); // consume '('
			const expr = this.parseOr();
			this.expect('RPAREN');
			return expr;
		}

		throw new Error(`Expected tag or '(' but got '${token.type}' in tag expression`);
	}

	private peek(): Token {
		return this.tokens[this.pos] ?? { type: 'EOF' };
	}

	private advance(): Token {
		const token = this.tokens[this.pos] ?? { type: 'EOF' };
		this.pos++;
		return token;
	}

	private expect(type: Token['type']): void {
		const token = this.peek();
		if (token.type !== type) {
			throw new Error(`Expected '${type}' but got '${token.type}' in tag expression`);
		}
		this.advance();
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a tag expression string into an AST.
 *
 * ```ts
 * const expr = parseTagExpression('@smoke and not @slow');
 * ```
 */
export function parseTagExpression(input: string): TagExpression {
	const trimmed = input.trim();
	if (!trimmed) {
		throw new Error('Empty tag expression');
	}
	const tokens = tokenize(trimmed);
	const parser = new TagExpressionParser(tokens);
	return parser.parse();
}

/**
 * Evaluate a tag expression against a set of tags.
 *
 * ```ts
 * const expr = parseTagExpression('@smoke and not @slow');
 * evaluateTagExpression(expr, ['@smoke', '@fast']); // true
 * evaluateTagExpression(expr, ['@smoke', '@slow']); // false
 * ```
 */
export function evaluateTagExpression(expr: TagExpression, tags: string[]): boolean {
	switch (expr.type) {
		case 'tag':
			return tags.includes(expr.name);
		case 'and':
			return evaluateTagExpression(expr.left, tags) && evaluateTagExpression(expr.right, tags);
		case 'or':
			return evaluateTagExpression(expr.left, tags) || evaluateTagExpression(expr.right, tags);
		case 'not':
			return !evaluateTagExpression(expr.operand, tags);
	}
}

/**
 * Convenience function: parse and evaluate in one call.
 *
 * ```ts
 * matchesTags('@smoke and not @slow', ['@smoke', '@fast']); // true
 * ```
 */
export function matchesTags(expression: string, tags: string[]): boolean {
	const expr = parseTagExpression(expression);
	return evaluateTagExpression(expr, tags);
}

/**
 * Check if a set of tags matches a simple tag filter.
 * If the filter is a single tag string (e.g. '@smoke'), does an includes check.
 * If the filter contains operators, parses as a full tag expression.
 */
export function tagsMatch(filter: string, tags: string[]): boolean {
	const trimmed = filter.trim();

	// Simple single-tag filter (fast path)
	if (trimmed.startsWith('@') && !/\s/.test(trimmed)) {
		return tags.includes(trimmed);
	}

	// Full expression
	return matchesTags(trimmed, tags);
}
