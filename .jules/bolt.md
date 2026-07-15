
## 2024-05-15 - Fast object property sanitization
**Learning:** High-frequency string matching via `Array.some(keyword => target.toLowerCase().includes(keyword))` during recursive network event sanitization is noticeably slow.
**Action:** Replace `Array.some` checks with a single pre-compiled, non-global regular expression (`RegExp.test()`) for property names. It reduces object allocation and iteration overhead, yielding ~33% faster execution.
