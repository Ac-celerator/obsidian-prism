# Contributing to Obsidian Prism

Thank you for contributing to **Obsidian Prism**!

## License & Attribution Agreement (`GPL-3.0` + `NOTICE`)

By submitting a contribution to this repository, you agree that your contribution will be licensed under the **GNU General Public License v3.0 (`GPL-3.0-only`)** alongside the attribution terms in [`NOTICE`](./NOTICE) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

## Prerequisites

- **Node.js >= 22.0.0** (uses built-in `fetch` and `WebSocket` with zero external `npm` runtime dependencies).

## Modular Architecture Map

To prevent monolithic file growth, runtime features are cleanly separated into focused modules compiled in order by `cdp.js`:

- `cdp.js` / `inject.js` / `remove.js` — Zero-dependency lexical CSS/JS bundler, single-source-of-truth config validator (`VALIDATORS` & `SYNC_ROOT_FILES`), CDP transport, and clean teardown.
- `style.css` — Obsidian & Warm dark themes + Daylight Crystal & Warm Alabaster light presets.
- `i18n-locales.js` / `i18n-core.js` — 5-language (`zh-CN`, `zh-TW`, `yue`, `en`, `ja`) UI copy table.
- `motion-engine.js` / `animated-icons.js` — 4-tier damped spring physics & 21 micro-animated SVG icons.
- `ripple-core.js` / `conv-aura.js` — WebGL2 horizon aurora shader, 32% conversation aura scheduler, and character ripple matrix.
- `smooth-caret.js` — FastDOM read/write-separated gliding caret controller.
- `dual-mascot-rig.js` — Pixel mascot stage with rigid-body anti-overlap, leapfrog, and totem stacking.
- `vial-core.js` / `pulse-vial-bridge.js` — 512K borosilicate water vial & telemetry popover bridge.
- `settings-panel.js` — Collapsible settings banner, 5-group option renderer, and Git sync / credits card.
- `ui-runtime.js` — Incremental dirty-subtree scheduler & React Fiber state bridge.
- `vendor/pulse-dashboard/` — Absorbed telemetry collector & smart-coexistence fallback bar.
- `vendor/effort-slider/` — Absorbed reasoning effort slider with coexistence auto-yield.
- `vendor/thought-translator/` — Dual-mode (Machine / OpenAI SSE) thought translator service, client runtime, and multi-profile settings panel.

## Development & Verification

```bash
# Run the full zero-dependency test suite
npm test

# Install / sync into local Antigravity plugins directory
npm run install:plugin

# One-shot live CDP injection into open Antigravity windows
npm run inject
```

## Pull Request Checklist

1. Keep runtime dependencies at **zero** (pure Node >= 22 built-ins + browser Web APIs).
2. Never commit personal paths, API keys, custom prompts, or compiled `.exe` / `.dmg` binaries.
3. Preserve all `GPL-3.0`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` copyright headers and attributions.
4. Ensure `npm test` passes with 0 failures and the compiled bundle remains under the `680 KB` budget.
