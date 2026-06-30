## 2024-11-20 - Regex Global Flag State
**Learning:** When optimizing high-frequency string matching with a pre-compiled regular expression and `RegExp.test()`, avoid using the global `g` flag. It maintains `lastIndex` state across executions and causes false negatives on subsequent checks.
**Action:** Always omit the `g` flag for simple stateless pattern matching.
