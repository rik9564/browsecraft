---
"browsecraft": patch
---

Fixed CLI flag values being treated as file paths. The `--scenario`, `--grep`, and other flags with values (e.g. `--scenario "Page loads with correct title"`) no longer cause "No matching feature files found" errors. Also made `--version` output dynamic from package.json instead of hardcoded.
