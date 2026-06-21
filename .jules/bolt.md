# Bolt's Journal

## 2024-XX-XX - Initial Setup
**Learning:** Initial journal creation.
**Action:** Ready to find performance improvements.

## 2024-06-21 - Optimize object sanitization for network events
**Learning:** High-frequency string matching using `Array.some(keyword => target.toLowerCase().includes(keyword))` in object traversal (e.g., recursive sanitization) allocates short-lived objects and incurs iteration overhead, resulting in slower execution times.
**Action:** Replace `Array.some` checks with a single pre-compiled, non-global regular expression (`RegExp.test()`) to improve execution speed (~40% faster in this benchmark) without sacrificing readability.
