## 2024-05-24 - [N+1 Locator Resolution]
**Learning:** `resolveLabelsToInputs` iteratively issues a `callFunction` to BiDi for every `<label>` node found. This creates an N+1 browser round-trip problem, especially slow when locating elements on larger pages with multiple labels.
**Action:** Use spread arguments `...elements` in `callFunction` to pass all node references at once and process them in a single round-trip, similar to how `filterByCIAccessibleName` does it.
