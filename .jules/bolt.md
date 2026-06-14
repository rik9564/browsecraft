## 2024-05-18 - RegExp Performance for String Matching
**Learning:** `Array.some(keyword => target.includes(keyword))` has significant overhead for frequent execution due to callback allocation and iterations compared to pre-compiled Regex.
**Action:** Replace `Array.some` checks on arrays of string constants with a single `RegExp.test()` check when performance matters.
