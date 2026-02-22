# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Browsecraft, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email **agniva179@gmail.com** with:

1. A description of the vulnerability
2. Steps to reproduce
3. The potential impact
4. Any suggested fix (if applicable)

### What to Expect

- **Acknowledgment**: You will receive a response within 48 hours confirming receipt.
- **Assessment**: We will investigate and assess the severity within 7 days.
- **Fix**: Critical vulnerabilities will be patched as quickly as possible.
- **Disclosure**: We will coordinate with you on public disclosure timing.

## Security Best Practices for Users

- Always use the latest version of Browsecraft.
- Never commit `.env` files or API tokens to version control.
- When using the AI features, be aware that page content may be sent to GitHub Models API.
- Review the permissions your `GITHUB_TOKEN` has when using AI features.

## Scope

This policy applies to:
- All packages in the `browsecraft` npm scope (`browsecraft`, `browsecraft-bidi`, `browsecraft-ai`, `browsecraft-bdd`, `browsecraft-runner`)
- The [browsecraft GitHub repository](https://github.com/rik9564/browsecraft)
