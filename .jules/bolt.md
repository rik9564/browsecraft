
## 2024-06-22 - Optimize Sanitize String Matching with RegExp
**Learning:** For high-frequency string matching (like the `sanitize` routine processing network events), using a single pre-compiled, non-global regular expression (`RegExp.test()`) can improve execution speed by ~6x compared to `Array.some(keyword => target.toLowerCase().includes(keyword))` by reducing object allocation and iteration overhead.
**Action:** When implementing routines that filter or redact keys in hot paths, avoid `Array.some` iterations over keyword lists; instead, use a pre-compiled `/(?:keyword1|keyword2)/i` RegExp.
