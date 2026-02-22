import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	banner: {
		js: '#!/usr/bin/env node',
	},
	splitting: false,
	sourcemap: false,
	clean: true,
	treeshake: true,
	outDir: 'dist',
	target: 'node20',
	minify: false,
});
