# Bolt Journal

## 2024-07-17 - [Initializing Journal]
**Learning:** Initializing journal to keep track of critical performance learnings.
**Action:** Follow instructions to only log critical performance learnings specific to the codebase.

## 2024-07-17 - [Optimize High-Frequency String Matching in Sanitization]
**Learning:** When sanitizing high-frequency network events, replacing `Array.some(keyword => target.toLowerCase().includes(keyword))` with a single pre-compiled, non-global regular expression (`RegExp.test()`) can improve execution speed by ~60% by reducing object allocation and iteration overhead.
**Action:** Use pre-compiled regex for high-frequency string list matching in critical paths.
