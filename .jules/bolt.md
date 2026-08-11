## 2024-05-23 - Pre-compiled Regex over Array.some() for high-frequency matching
**Learning:** In the WebDriver BiDi communication layer, `sanitize()` is invoked repeatedly for every socket payload. Using `Array.some(str.includes)` for substring checks across multiple keys causes unnecessary array iteration, closure creation, and string allocations per object key, creating a measurable performance bottleneck under heavy load.
**Action:** Replace `Array.some(str.includes)` arrays with a pre-compiled, non-capturing `RegExp.test(...)` for high-frequency string matching tasks.
