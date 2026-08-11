
## 2024-03-07 - High-frequency String Matching Allocation Overhead
**Learning:** For extremely high-frequency string matching checks (like the BiDi message sanitization running on every socket payload), using `Array.some(str.includes)` incurs measurable performance penalties because of the repetitive array traversal and continuous allocations. Pre-compiling a regex and using `RegExp.test(str)` is significantly faster in Node.js, completely bypassing the array allocation overhead for checks.
**Action:** When inspecting hot paths or fast-firing loops that do substring matches across a dictionary of terms, default to using a pre-compiled `RegExp` (`/(?:term1|term2)/`) over array iterator methods.
