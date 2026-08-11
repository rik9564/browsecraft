## 2024-05-24 - High-frequency String Matching Pattern
**Learning:** In `sanitize` routines that run on every network event, using `Array.some(keyword => target.toLowerCase().includes(keyword))` is a significant CPU bottleneck due to object allocation and loop iteration.
**Action:** For high-frequency checking of a known set of keywords, pre-compile a single non-global regular expression (`RegExp.test()`) to improve execution speed by ~6x.
