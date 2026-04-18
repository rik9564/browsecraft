
## 2025-02-23 - Pre-compiled RegExp for High-Frequency String Matching
**Learning:** In fast-firing socket payload sanitization, `Array.some(str.includes)` introduces measurable overhead due to N+1 array traversal and intermediate string allocations. A pre-compiled regular expression (`RegExp.test`) avoids object allocation and reduces O(N*M) checks to an optimized native C++ regex engine call, which is significantly faster in Node.js.
**Action:** Always prefer pre-compiled `RegExp.test()` over `Array.some(str.includes)` when performing high-frequency key checks or sanitization against a static list of sensitive terms.
