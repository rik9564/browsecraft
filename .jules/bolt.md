## 2025-02-15 - Optimize high-frequency string matching with Regex
**Learning:** When checking string inclusion against multiple keywords in hot paths (like sanitizing nested network events), pre-compiling a non-global regex is significantly faster than using Array.some().
**Action:** Use RegExp.test() for frequent sanitization or matching logic instead of array iteration.
