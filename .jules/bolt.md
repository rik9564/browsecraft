## 2025-02-14 - Pre-compiled Regex for high-frequency string matching
**Learning:** In high-frequency operations like network event sanitization, using `Array.some(keyword => target.toLowerCase().includes(keyword))` creates significant iteration and object allocation overhead.
**Action:** Always use a single, pre-compiled non-global regular expression (`RegExp.test()`) with the `/i` flag to avoid string allocations from `.toLowerCase()` and improve execution speed by ~6x.
