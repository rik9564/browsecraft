## 2023-08-01 - RegEx for high-frequency checks
**Learning:** For high-frequency string matching within arrays or objects, converting an `Array.some(keyword => target.includes(keyword))` check to a single pre-compiled `RegExp.test()` is significantly faster because it minimizes object allocations and iterative overhead.
**Action:** Replace `Array.some()` checks with `RegExp.test()` where applicable for string inclusion matching in hot paths.
