# Security Policy

## Local-Only Credential & Zero-Server Privacy Architecture

**Obsidian Prism** is a pure client-side optical UI & native sidecar suite with zero telemetry upload and strict local security boundaries:

1. **Zero Secret Persistence in Repository**: API keys and custom system prompts configured for the optional OpenAI-compatible Thought Translator are stored exclusively on the user's machine at `~/.gemini/config/obsidian-prism-thought.json` with `0600` file permissions. They are masked in UI responses (`sk-••••xxxx`), redacted across multi-format token patterns (`sk-*`, `AIza*`, `xai-*`, `ghp_*`, `Bearer *`) in error logs, and never written to project directories or `config.json`.
2. **Strict Protocol Whitelisting & Credential Stripping**: Upstream API endpoints are validated to allow only `http:` and `https:` schemes while stripping embedded URL credentials before persistence or logging.
3. **Zero Arbitrary HTML Injection (XSS Defense)**: Translated Markdown and reasoning blocks are rendered strictly via DOM `createElement` / `createTextNode` (`textContent`), never via untrusted `innerHTML`.
4. **Loopback-Only CDP & Safe Subprocess Execution**: Host communication connects strictly to local `127.0.0.1` DevTools targets with payload size caps; all Git synchronization and installer tasks use parameterized `execFile` arrays or UTF-16LE Base64 `-EncodedCommand` without shell string interpolation.

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `1.0.x` | :white_check_mark: |

## Reporting a Vulnerability

Please report security issues privately via **[GitHub Private Vulnerability Reporting (Security Advisories)](https://github.com/RMvdesi/obsidian-prism/security/advisories/new)** rather than opening a public issue. Include reproduction steps and affected OS / Node.js versions.
