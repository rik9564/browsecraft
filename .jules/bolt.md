## 2024-07-11 - Pre-compiled RegExp for High-Frequency Array Searching
**Learning:** In high-frequency operations like network payload sanitization, `Array.some(keyword => target.toLowerCase().includes(keyword))` is noticeably slow due to lambda allocation and iterative object evaluation.
**Action:** Replace `Array.some(includes)` with a pre-compiled, non-global regular expression (`RegExp.test()`) to significantly reduce overhead in frequent data pipelines.
