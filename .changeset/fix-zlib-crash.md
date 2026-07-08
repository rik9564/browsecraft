---
"browsecraft-ai": patch
---

Fix a crash ("Dynamic require of zlib is not supported") in `compareScreenshots()` when loaded via the ESM build. A stray CJS `require('node:zlib')` inside the visual-diff module broke any second call to `expect(page).toMatchSnapshot()` that needed to diff against an existing baseline.
