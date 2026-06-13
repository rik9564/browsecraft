## 2024-05-18 - RegExp test optimization
**Learning:** For high-frequency string matching, replacing `Array.some(keyword => target.includes(keyword))` with a single pre-compiled, non-global regular expression (`RegExp.test()`) can improve execution speed by ~3x by reducing object allocation and iteration overhead.
**Action:** Use pre-compiled non-global Regular Expressions for high-frequency string matching instead of array iterations.
