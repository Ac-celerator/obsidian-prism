import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');

test('perf guard 1: cdp.stripJsFunctionsByName handles regex /}/, comments, and nested template ${ {a:1} } safely', () => {
  const cdp = require(path.join(ROOT, 'cdp.js'));
  const sample = [
    'function keepBefore() { return 1; }',
    'function targetFn(x) {',
    '  // comment with unmatched }',
    '  /* block comment { */',
    '  const re = /foo}bar{/g;',
    '  const tpl = `hello ${ ({ a: 1, b: { c: 2 } }).a } world`;',
    '  return re.test(tpl) ? x : 0;',
    '}',
    'async function asyncKeep() { return 99; }',
    'function keepAfter() { return 42; }',
  ].join('\n');

  const sample2 = `${sample}\nvar IIFE_VAL = (function namedIife(){return 99;})();`;
  const stripped = cdp.stripJsFunctionsByName(sample2, {
    targetFn: 'function targetFn(){return 7;}',
    asyncKeep: '',
    namedIife: '',
  });
  assert.ok(stripped.includes('async function asyncKeep()'), 'async function must be safely preserved');
  assert.ok(stripped.includes('function namedIife()'), 'named function expression IIFE must not be stripped');
  const res = vm.runInNewContext(`${stripped}; [keepBefore(), targetFn(9), keepAfter(), typeof asyncKeep, IIFE_VAL]`, {});
  assert.deepEqual(Array.from(res), [1, 7, 42, 'function', 99]);
});

test('perf guard 2: home-ripple-host enters 0fps idle sleep after 1200ms stationary pointer without clearing visual aura', () => {
  const src = fs.readFileSync(path.join(ROOT, 'home-ripple-host.js'), 'utf8');
  let now = 1000;
  let rafSeq = 1;
  const rafs = new Map();
  let drawCalls = 0;
  const fakeCanvas = {
    width: 1280, height: 720, style: {}, isConnected: true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    getContext: () => null, setAttribute() {},
  };
  const fakeHome = {
    isConnected: true, style: {}, clientWidth: 1280, clientHeight: 720,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    insertBefore() {}, appendChild() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, setAttribute() {}, removeAttribute() {},
  };
  const makeHostEl = () => {
    const attrs = new Map();
    return {
      style: {}, isConnected: true, className: '', children: [],
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) { this.children.push(c); return c; },
      remove() { this.isConnected = false; },
    };
  };
  let cvCount = 0;
  const fakeDoc = {
    hidden: false,
    documentElement: { getAttribute: () => 'obsidian', classList: { contains: () => false } },
    body: { classList: { contains: () => false } },
    createElement(tag) { return tag === 'canvas' ? (++cvCount === 1 ? { ...fakeCanvas } : fakeCanvas) : makeHostEl(); },
    querySelector: (sel) => (sel.includes('agy-home') ? fakeHome : null),
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  };
  const sb = {
    window: null, document: fakeDoc, performance: { now: () => now },
    requestAnimationFrame(cb) { const id = rafSeq++; rafs.set(id, cb); return id; },
    cancelAnimationFrame(id) { rafs.delete(id); },
    getComputedStyle: () => ({ color: 'rgb(220,220,220)', backgroundColor: 'rgb(14,15,20)', fontFamily: 'monospace', getPropertyValue: () => '' }),
    ResizeObserver: class { observe() {} disconnect() {} },
    setTimeout, clearTimeout, Math, Number, String, Boolean, Array, Object, Map, Set,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.runInNewContext(src, sb);

  const ctl = sb.__agPrismHomeRippleHost.createHomeRippleController({
    rippleCore: {
      RIPPLE: { cellWidth: 16, cellHeight: 24, skimStep: 24, clickImpulse: 1 },
      parseCssColorToRgb: () => null,
      createWaveField: () => ({ advance() {}, active: () => false, impulse() {}, clear() {} }),
      createGlyphField: () => ({ mode: 'webgl2', busy: () => false, needsDraw: () => false, draw() { drawCalls++; }, invalidate() {}, setCalmZones() {}, dispose() {} }),
      createHorizonGlow: () => ({ resize() {}, draw() {}, clear() {}, dispose() {} }),
    },
    isDestroyed: () => false, isAllowed: () => true, isDarkTheme: () => true, motionReduced: () => false,
    getMinFrameGapMs: () => 5.5, getAmbientIntensity: () => 1, getAccentTone: () => 'cobalt', setAttrIfChanged() {}, onPointerPressMascot() {},
  });
  ctl.sync(fakeHome);
  now = 5000;
  ctl.getMount().onMove({ clientX: 400, clientY: 300, pointerType: 'mouse' });
  drawCalls = 0;
  let drawsAfter1500ms = 0;
  for (let i = 0; i < 180; i++) {
    now += 16.67;
    const cbs = [...rafs.values()];
    rafs.clear();
    const before = drawCalls;
    for (const cb of cbs) cb(now);
    if (i >= 90) drawsAfter1500ms += drawCalls - before;
  }
  assert.equal(ctl.getMount().sleeping, true, 'Must enter 0fps idle sleep after 1200ms stationary pointer');
  assert.equal(drawsAfter1500ms, 0, 'Must perform 0 draws once stationary beyond idle sleep window');
});

test('perf guard 3: conv-aura O(1) indicator cache immediately exits running when React mutates data-testid in place', () => {
  const src = fs.readFileSync(path.join(ROOT, 'conv-aura.js'), 'utf8');
  let now = 1000;
  let btnTestId = 'stop-button';
  let btnVisible = true;
  const stopBtn = {
    nodeType: 1,
    isConnected: true,
    style: {},
    getAttribute: (k) => (k === 'data-testid' ? btnTestId : null),
    matches: (sel) => sel.includes(`"${btnTestId}"`),
    closest: () => null,
    checkVisibility: () => btnVisible,
  };
  let qsaCalls = 0;
  const fakeDoc = {
    hidden: false,
    querySelectorAll(sel) {
      qsaCalls++;
      if (sel.includes('stop-button') && btnTestId === 'stop-button') return [stopBtn];
      return [];
    },
  };
  const sb = {
    window: null, document: fakeDoc, performance: { now: () => now },
    WeakSet, Set, Map, Array, Object, Math, Number, String, Boolean,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.runInNewContext(src, sb);

  const api = sb.__agPrismConvAura;
  assert.equal(api.isConvRunning(), true);
  assert.equal(qsaCalls, 1);

  // Advance beyond 200ms TTL while button is still live stop-button -> O(1) cache hit with 0 querySelectorAll!
  now += 250;
  assert.equal(api.isConvRunning(), true);
  assert.equal(qsaCalls, 1, 'O(1) indicator fast-path should skip querySelectorAll while indicator matches & is visible');

  // React mutates same DOM node in place from stop-button -> send-button -> must immediately exit running!
  btnTestId = 'send-button';
  now += 250;
  assert.equal(api.isConvRunning(), false, 'In-place data-testid mutation must invalidate O(1) indicator cache immediately');
  assert.equal(qsaCalls, 2);

  // Restore stop-button then hide via CSS class (checkVisibility -> false) -> must exit running!
  btnTestId = 'stop-button';
  now += 250;
  assert.equal(api.isConvRunning(), true);
  btnVisible = false;
  now += 250;
  assert.equal(api.isConvRunning(), false, 'CSS-hidden indicator must invalidate O(1) indicator cache immediately');
});

test('perf guard 4: host-workbench-enhancer pruneUnsubs clears WeakSet so detached-then-reattached navRail rebinds cleanly', () => {
  const src = fs.readFileSync(path.join(ROOT, 'host-workbench-enhancer.js'), 'utf8');
  let addCount = 0;
  let removeCount = 0;
  const rail = {
    nodeType: 1,
    isConnected: true,
    addEventListener() { addCount++; },
    removeEventListener() { removeCount++; },
    querySelectorAll: () => [],
    closest: () => null,
  };
  let railsInDoc = [rail];
  const fakeDoc = {
    documentElement: { getAttribute: () => 'obsidian', classList: { contains: () => false } },
    body: { classList: { contains: () => false } },
    querySelectorAll: (sel) => (sel === '[data-testid="conversation-navigator"]' ? railsInDoc : []),
    querySelector: () => null,
  };
  const sb = {
    window: { addEventListener() {}, removeEventListener() {} },
    document: fakeDoc,
    WeakMap, WeakSet, Set, Map, Array, Object, Math, Number, String, Boolean, Date, setTimeout, clearTimeout,
  };
  sb.globalThis = sb;
  vm.runInNewContext(src, sb);

  const ctl = sb.__agPrismHostEnhancer.createHostEnhancerController({
    document: fakeDoc,
    window: sb.window,
    getLang: () => 'zh-CN',
    isDestroyed: () => false,
    isConvRunning: () => false,
    runGuardedMut: (fn) => fn(),
    setAttrIfChanged() {},
  });

  ctl.sync();
  assert.equal(addCount, 3, 'Initial navRail attach registers 3 pointer listeners');

  // Detach rail -> sync() prunes listeners and clears WeakSet
  rail.isConnected = false;
  railsInDoc = [];
  ctl.sync();
  assert.equal(removeCount, 3, 'Detached navRail must remove its 3 pointer listeners immediately');

  // Reattach same DOM node -> sync() must rebind cleanly instead of being permanently ignored by WeakSet
  rail.isConnected = true;
  railsInDoc = [rail];
  ctl.sync();
  assert.equal(addCount, 6, 'Reattached navRail must rebind listeners cleanly after prune');
  ctl.destroy();
});

test('perf guard 5: thought-client CRLF + inner ```foo code lines keep O(1) incremental checkpoint identical to full parse', () => {
  const clientSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');
  const patchedSrc = clientSrc.replace(
    '__memCache: memCache,',
    '__benchRender: renderIncrementalStreamDom, __benchSplit: splitMarkdownBlocks, __memCache: memCache,'
  );
  function makeNode(nodeType, tagOrText) {
    return {
      nodeType, tagName: nodeType === 1 ? String(tagOrText).toUpperCase() : undefined, className: '',
      data: nodeType === 3 ? String(tagOrText) : undefined, nodeValue: nodeType === 3 ? String(tagOrText) : undefined,
      parentNode: null, parentElement: null, childNodes: [], attrs: new Map(), style: {}, isConnected: true,
      appendChild(c) { c.parentNode = this; c.parentElement = this; this.childNodes.push(c); return c; },
      removeChild(c) { const idx = this.childNodes.indexOf(c); if (idx >= 0) this.childNodes.splice(idx, 1); c.parentNode = null; c.parentElement = null; },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      setAttribute(k, v) { this.attrs.set(k, String(v)); },
      getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
      hasAttribute(k) { return this.attrs.has(k); },
      removeAttribute(k) { this.attrs.delete(k); },
      appendData(s) { this.data += s; this.nodeValue = this.data; },
      get firstChild() { return this.childNodes[0] || null; },
      get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; },
      get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map((c) => c.textContent).join(''); },
      set textContent(v) { if (this.nodeType === 3) { this.data = String(v); this.nodeValue = this.data; return; } this.childNodes = []; if (v !== '' && v != null) this.appendChild(makeNode(3, String(v))); },
      querySelectorAll: () => [], querySelector: () => null, closest: () => null, addEventListener() {}, removeEventListener() {},
    };
  }
  const fakeDoc = {
    hidden: false, documentElement: makeNode(1, 'html'), head: makeNode(1, 'head'), body: makeNode(1, 'body'),
    createElement: (tag) => { const el = makeNode(1, tag); el.ownerDocument = fakeDoc; return el; },
    createTextNode: (t) => { const tn = makeNode(3, t); tn.ownerDocument = fakeDoc; return tn; },
    createDocumentFragment: () => makeNode(11, ''), createRange: () => ({ setStart() {}, setEnd() {} }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  };
  const sb = {
    window: null, document: fakeDoc, CSS: { highlights: new Map() }, Highlight: class extends Set {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    performance: { now: () => 1000 }, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} }, setTimeout, clearTimeout,
    Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.runInNewContext(patchedSrc, sb);

  const crlfMd = [
    '第一段分析上下文。',
    '',
    '```js',
    'const sample = "```foo should NOT close fence";',
    'console.log(sample);',
    '```',
    '',
    '- 列表项一',
    '- 列表项二',
    '',
    '最后一段结论收尾。',
  ].join('\r\n');

  const blocks = sb.__agPrismThought.__benchSplit(crlfMd, false);
  assert.equal(blocks.filter((b) => b.k === 'pre').length, 1, 'Inner ```foo line must not prematurely close code fence');
  assert.ok(blocks.find((b) => b.k === 'pre').x.includes('console.log(sample);'));

  const panel = fakeDoc.createElement('div');
  const body = fakeDoc.createElement('div');
  panel.appendChild(body);
  for (let n = 8; n <= crlfMd.length; n += 13) {
    sb.__agPrismThought.__benchRender(panel, body, crlfMd.slice(0, n), 1000 + n, false);
  }
  sb.__agPrismThought.__benchRender(panel, body, crlfMd, 2000, false);
  assert.ok(body.textContent.includes('第一段分析上下文。'));
  assert.ok(body.textContent.includes('console.log(sample);'));
  assert.ok(body.textContent.includes('最后一段结论收尾。'));
});

test('perf guard 6: upstream-client unbind clears __cesAgBound so reused panel rebinds cleanly', () => {
  const up = fs.readFileSync(path.join(ROOT, 'vendor', 'effort-slider', 'upstream-client.js'), 'utf8');
  assert.ok(up.includes('panel.__cesAgBound = true;'));
  assert.ok(up.includes('delete panel.__cesAgBound;'), 'Unbind must delete panel.__cesAgBound (not a mismatched typo)');
  assert.equal(up.includes('__cesAgPanelBound'), false);
});

test('perf guard 7: style.css & omni-client have zero hot :has(), unscoped ::highlight(), universal * motion-off, or *:nth-last-child', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.equal((css.match(/:has\(/g) || []).length, 0, 'style.css must contain zero :has() selectors');
  assert.equal(/^\s*::highlight\(/m.test(css), false, 'style.css must anchor ::highlight() to :root (not universal *)');
  assert.ok(css.includes(':root::highlight(ag-stream-f0)'), 'style.css must use O(1) :root::highlight() inheritance');
  assert.equal(css.includes('&,& *,& *::before,& *::after'), false, 'motion=off universal * rule must be mounted on demand only');
  assert.equal(css.includes('*:nth-last-child('), false, 'autoscroll-viewport must not use backward positional *:nth-last-child');

  const omniSrc = fs.readFileSync(path.join(ROOT, 'vendor', 'omni-viewer', 'omni-client.js'), 'utf8');
  assert.ok(omniSrc.includes("':root::highlight(ag-omni-url)"), 'omni-client ::highlight rules must anchor to :root');
  assert.ok(omniSrc.includes("':root::highlight(ag-omni-path)"), 'omni-client ::highlight rules must anchor to :root');
});

test('perf guard 8: stream-choreography slices bulk syncWorkedForAutoUnfold clicks per frame and cancels on session swap', () => {
  const src = fs.readFileSync(path.join(ROOT, 'stream-choreography.js'), 'utf8');
  const rafCbs = [];
  const clicks = [];
  const mkBtn = (id, tid, expanded) => {
    const attrs = new Map([['data-testid', tid], ['aria-expanded', expanded]]);
    return {
      id,
      tagName: 'BUTTON',
      nodeType: 1,
      isConnected: true,
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute: (k, v) => attrs.set(k, String(v)),
      removeAttribute: (k) => attrs.delete(k),
      hasAttribute: (k) => attrs.has(k),
      click() {
        clicks.push(id);
        attrs.set('aria-expanded', 'true');
      },
      querySelectorAll: () => [],
    };
  };
  const innerBtns = [0, 1, 2, 3, 4, 5].map((i) => mkBtn(`inner-${i}`, 'tool-group-collapsible', 'false'));
  const scope = {
    nodeType: 1,
    isConnected: true,
    querySelectorAll: (sel) => (sel.includes('tool-group-collapsible') ? innerBtns : []),
  };
  const outer = mkBtn('outer-0', 'worked-for-collapsible', 'true');
  outer.nextElementSibling = scope;
  const fakeDoc = {
    documentElement: { getAttribute: () => 'ultra' },
    body: {},
    querySelectorAll: (sel) => (sel.includes('worked-for-collapsible') ? [outer] : []),
  };
  const sb = {
    document: fakeDoc,
    window: {},
    performance: { now: () => 1000 },
    requestAnimationFrame: (fn) => {
      rafCbs.push(fn);
      return rafCbs.length;
    },
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout,
    Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, RegExp,
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(src, sb);
  const ctl = sb.__agPrismStreamChoreography.createStreamChoreographyController({
    isDestroyed: () => false,
    isMotionStandardOrUltra: () => true,
    isMotionUltra: () => true,
    isConvRunning: () => false,
    isThoughtIsolatedNode: () => false,
    isThoughtMutationRecord: () => false,
    isManagedThoughtPanel: () => false,
    setAttrIfChanged: (el, k, v) => el.setAttribute(k, v),
    runGuardedMut: (fn) => fn(),
  });

  ctl.syncWorkedForAutoUnfold();
  assert.deepEqual(clicks, ['inner-5', 'inner-4'], 'Sync frame must click only newest 2 collapsed tool groups');
  assert.equal(rafCbs.length, 1, 'Remaining historical tool groups must queue into next animation frame');

  // Step 1 frame -> clicks next 2
  rafCbs.shift()();
  assert.deepEqual(clicks, ['inner-5', 'inner-4', 'inner-3', 'inner-2']);

  // Cancel on session swap -> remaining queued clicks are dropped
  ctl.cancelDeferredHydration();
  while (rafCbs.length) rafCbs.shift()();
  assert.equal(clicks.length, 4, 'cancelDeferredHydration must cancel remaining historical clicks');
});

test('perf guard 9: thought-client api.sync(cfg) is idempotent on repeated identical config calls', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vendor', 'thought-translator', 'thought-client.js'), 'utf8');
  let qsaCount = 0;
  let timerCount = 0;
  const fakeDoc = {
    hidden: false,
    documentElement: { getAttribute: () => null, setAttribute() {}, removeAttribute() {}, hasAttribute: () => false },
    body: { addEventListener() {}, removeEventListener() {} },
    querySelectorAll: () => {
      qsaCount += 1;
      return [];
    },
    querySelector: () => null,
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  const sb = {
    document: fakeDoc,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: (fn, ms) => {
      timerCount += 1;
      return setTimeout(fn, ms);
    },
    clearTimeout,
    Map, Set, WeakMap, WeakSet, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(src, sb);

  const cfg = { thoughtTranslate: 'ai', thoughtTrigger: 'expand', thoughtView: 'immersive', language: 'zh-CN' };
  sb.__agPrismThought.sync(cfg);
  const qsaAfterFirst = qsaCount;
  const timersAfterFirst = timerCount;

  // Repeated identical sync calls (e.g. during streaming/tool-chain updates) must do 0 DOM scans and 0 reschedules
  for (let i = 0; i < 10; i++) sb.__agPrismThought.sync(cfg);
  assert.equal(qsaCount, qsaAfterFirst, 'Repeated identical sync() must perform 0 extra querySelectorAll scans');
  assert.equal(timerCount, timersAfterFirst, 'Repeated identical sync() must not schedule extra scan timers');
  sb.__agPrismThought.destroy();
});

test('perf guard 10: ui-runtime runGuardedMut drains MO records & default bundle stays under 670 KiB', () => {
  const cdp = require(path.join(ROOT, 'cdp.js'));
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  assert.ok(uiSrc.includes('mainObserver.takeRecords()'), 'runGuardedMut must synchronously drain mainObserver records');
  assert.ok(uiSrc.includes('if (!force && key === lastAbsorbedSyncKey) return;'), 'syncAbsorbedModules must gate identical calls');
  const bytes = Buffer.byteLength(cdp.buildInjectExpression(), 'utf8');
  assert.ok(bytes < 670 * 1024, `Expected default bundle < 670 KiB, got ${bytes}`);
});

test('perf guard 11: style.css enables offscreen content-visibility, sidebar containment, zero global * wildcards, and runtime flattener compiles nested/:is() rules', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.ok(css.includes('content-visibility:auto'), 'style.css must apply content-visibility:auto to offscreen expanded bodies/turns');
  assert.ok(css.includes('contain-intrinsic-size:auto 26px'), 'style.css must apply step-level content-visibility:auto to expanded tool-group step rows');
  assert.ok(css.includes('[data-testid="sidebar-split"]>div:first-child{contain:style;'), 'sidebar container must isolate style via contain:style without trapping position:fixed descendants');
  assert.equal(/html\[[^\]]+\]\s*&/.test(css), false, 'style.css must not use html[...] & self-nesting that produces duplicate html prefixes');
  assert.equal(/:is\([^)]*::(?:before|after)/.test(css), false, 'style.css must not place ::before/::after pseudo-elements inside :is(...)');
  assert.equal(css.includes('.divide-y>*+*'), false, 'must not use global *+* universal selector');
  assert.equal(css.includes('.ag-anim-icon{display:inline-block;flex-shrink:0;overflow:visible;vertical-align:middle;pointer-events:none;transform-origin:50% 50%;& *{'), false, 'must not use universal * inside .ag-anim-icon');
  assert.equal(css.includes('.ag-cs-crab{opacity:0 !important;pointer-events:none !important;& *{'), false, 'must not use universal * inside .ag-cs-crab');
  assert.equal(css.includes('&>*{display:none !important;}'), false, 'must not use universal >* inside new-conversation svg');

  // Verify flattenMainStyleSheet logic in ui-runtime.js expands nested & and :is(...) idempotently
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  const fnMatch = uiSrc.match(/function flattenMainStyleSheet\(\)[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'flattenMainStyleSheet must exist in ui-runtime.js');
  const attrs = new Map([['data-ag-cs-css-hash', 'h1']]);
  const fakeStyle = {
    textContent: 'orig',
    getAttribute: (k) => attrs.get(k) || null,
    setAttribute: (k, v) => attrs.set(k, String(v)),
    sheet: {
      cssRules: [
        {
          type: 1,
          selectorText: 'html[data-ag-cs-style]',
          style: { cssText: '--x: 1;' },
          cssRules: [
            {
              type: 1,
              selectorText: '& :is(.a, [data-b="1"])',
              style: { cssText: 'color: red;' },
              cssRules: [],
            },
          ],
        },
        { type: 7, cssText: '@keyframes k{to{opacity:1}}' },
      ],
    },
  };
  const sb = {
    CODE_HASH: 'c1',
    runGuardedMut: (fn) => fn(),
    document: { getElementById: (id) => (id === 'ag-prism-css' ? fakeStyle : null) },
  };
  vm.runInNewContext(`${fnMatch[0]}; flattenMainStyleSheet();`, sb);
  assert.equal(attrs.get('data-ag-cs-flat'), `h1:${fakeStyle.textContent.length}`);
  assert.ok(fakeStyle.textContent.includes('html[data-ag-cs-style] .a,html[data-ag-cs-style] [data-b="1"]{color: red;}'));
  assert.ok(fakeStyle.textContent.includes('@keyframes k{to{opacity:1}}'));
  assert.equal(fakeStyle.textContent.includes(':is('), false);
  // If an older watcher overwrites textContent without clearing data-ag-cs-flat, length mismatch forces immediate re-flatten
  fakeStyle.textContent = '/* stale unflattened css */';
  vm.runInNewContext(`${fnMatch[0]}; flattenMainStyleSheet();`, sb);
  assert.equal(attrs.get('data-ag-cs-flat'), `h1:${fakeStyle.textContent.length}`);
  assert.ok(fakeStyle.textContent.includes('html[data-ag-cs-style] .a,html[data-ag-cs-style] [data-b="1"]{color: red;}'));
});

test('perf guard 12: prism-rim-canvas skips canvas resize when inactive and stream-choreography avoids hover getBoundingClientRect reflows', () => {
  const rimSrc = fs.readFileSync(path.join(ROOT, 'prism-rim-canvas.js'), 'utf8');
  let widthWrites = 0;
  let clearCalls = 0;
  const fakeCv = {
    _w: 100, _h: 40, isConnected: true,
    classList: { contains: (c) => c === 'ag-cs-prism-rim-cv' },
    get width() { return this._w; },
    set width(v) { widthWrites++; this._w = v; },
    get height() { return this._h; },
    set height(v) { widthWrites++; this._h = v; },
    getContext: () => ({ clearRect() { clearCalls++; }, createRadialGradient: () => ({ addColorStop() {} }) }),
    setAttribute() {}, remove() {},
  };
  const fakeBox = {
    isConnected: true, firstElementChild: fakeCv,
    getAttribute: (k) => (k === 'data-ag-cs-prism-box' ? '1' : null),
    getBoundingClientRect: () => ({ left: 600, top: 600, right: 900, bottom: 680, width: 300, height: 80 }),
    appendChild() {}, style: { setProperty() {} },
  };
  fakeCv.parentElement = fakeBox;
  let rafCb = null;
  const sb = {
    window: { devicePixelRatio: 2 },
    performance: { now: () => 5000 },
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ borderTopLeftRadius: '10px' }),
    document: {
      documentElement: { getAttribute: () => 'standard' },
      querySelectorAll: (s) => (s.includes('data-ag-cs-prism-box') ? [fakeBox] : []),
    },
    Set, Map, Array, Math, Number, String, Boolean,
  };
  sb.globalThis = sb;
  vm.runInNewContext(rimSrc, sb);
  const ctl = sb.__agPrismRimCanvas.createPrismRimCanvasController({
    isDestroyed: () => false,
    isDarkTheme: () => true,
    motionReduced: () => false,
    getMinFrameGapMs: () => 0,
    getAmbientIntensity: () => 1,
    getAccentTone: () => 'follow',
    canMountRealCanvas: () => true,
    setAttrIfChanged() {},
    runGuardedMut: (fn) => fn(),
  });
  // Pointer hovering far left sidebar (x=40, y=120) — far outside box [600..900, 600..680]
  ctl.onPointerMove({ clientX: 40, clientY: 120 });
  rafCb(5000);
  assert.equal(widthWrites, 0, 'inactive off-range pointer must not mutate canvas width/height attributes');
  assert.equal(clearCalls, 1, 'inactive canvas clears once then becomes idempotent');
  ctl.onPointerMove({ clientX: 42, clientY: 140 });
  rafCb(5020);
  assert.equal(widthWrites, 0);
  assert.equal(clearCalls, 1, 'subsequent sidebar mousemoves must do 0 clearRect and 0 attribute writes');

  // stream-choreography measureNewLensOverlays skips rectOf when trigger is stale (>900ms)
  const choreoSrc = fs.readFileSync(path.join(ROOT, 'stream-choreography.js'), 'utf8');
  let rectCalls = 0;
  const fakeOv = {
    getBoundingClientRect() { rectCalls++; return { left: 0, top: 0, width: 100, height: 50 }; },
    querySelectorAll: () => [],
    style: { setProperty() {} },
  };
  let nowT = 5000;
  const sb2 = {
    performance: { now: () => nowT },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    document: {
      documentElement: { getAttribute: () => 'ultra' },
      querySelectorAll: (s) => (s.includes('.agy-overlay') ? [fakeOv] : []),
    },
    Set, Map, WeakSet, WeakMap, Array, Math, Number, String, Boolean,
  };
  sb2.globalThis = sb2;
  vm.runInNewContext(choreoSrc, sb2);
  const sc = sb2.__agPrismStreamChoreography.createStreamChoreographyController({
    isDestroyed: () => false,
    isMotionStandardOrUltra: () => true,
    isMotionUltra: () => true,
    isConvRunning: () => false,
    setAttrIfChanged() {},
  });
  // Stale click (> 900ms ago) — pure sidebar hover overlay must NOT call getBoundingClientRect()
  sc.heroState.lastTriggerOrigin = { x: 10, y: 10, at: 1000 };
  const resStale = sc.measureNewLensOverlays();
  assert.equal(resStale.length, 1);
  assert.equal(resStale[0].rect, null);
  assert.equal(rectCalls, 0, 'stale trigger must not call getBoundingClientRect() on hover overlays');
  // Fresh click (within 900ms) — DOES measure rect for lens origin
  sc.heroState.lastTriggerOrigin = { x: 10, y: 10, at: 4800 };
  const resFresh = sc.measureNewLensOverlays();
  assert.equal(rectCalls, 1, 'fresh click must still measure overlay rect for lens origin');
  assert.ok(resFresh[0].rect);
});

test('perf guard 13: thought-client skips checkVisibility on unchanged translated/streaming panels & upstream-client filters streaming/sidebar mutations', () => {
  const thSrc = fs.readFileSync(path.join(ROOT, 'vendor/thought-translator/thought-client.js'), 'utf8');
  // Verify scanNow checks cache hit & streaming pending BEFORE calling isHiddenByAncestor
  const scanIdx = thSrc.indexOf('function scanNow()');
  const scanSlice = thSrc.slice(scanIdx, scanIdx + 1600);
  const idxReady = scanSlice.indexOf("ga(panel, A_RDY) === '1'");
  const idxHidden = scanSlice.indexOf('isHiddenByAncestor(btn, panel)');
  assert.ok(idxReady > 0 && idxHidden > 0 && idxReady < idxHidden, 'scanNow must short-circuit translated unchanged panels BEFORE isHiddenByAncestor (checkVisibility)');

  // Verify upstream-client Antigravity MutationObserver ignores autoscroll-viewport & non-selector characterData
  const upSrc = fs.readFileSync(path.join(ROOT, 'vendor/effort-slider/upstream-client.js'), 'utf8');
  let moCb = null;
  let queryCalls = 0;
  const fakeDoc = {
    body: {
      nodeType: 1,
      querySelector: () => { queryCalls++; return null; },
      querySelectorAll: () => [],
      appendChild() {},
    },
    head: { appendChild() {} },
    documentElement: { getAttribute: () => null },
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '', style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }),
    querySelector: () => { queryCalls++; return null; },
    querySelectorAll: () => [],
  };
  const sb = {
    window: null,
    document: fakeDoc,
    __agCodexEffortSliderDisableAutoBoot: true,
    MutationObserver: class {
      constructor(cb) { moCb = cb; }
      observe() {}
      disconnect() {}
    },
    Set, Map, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(upSrc, sb);
  const obs = sb.AntigravityCodexEffortSlider.installAntigravityObserver({ document: fakeDoc, window: sb, MutationObserver: sb.MutationObserver });
  const baselineQueries = queryCalls;
  // Simulate streaming characterData inside conversation and childList inside autoscroll-viewport & sidebar
  const convNode = { nodeType: 1, closest: (sel) => (sel.includes('autoscroll-viewport') ? {} : null) };
  const textNode = { nodeType: 3, parentElement: convNode };
  moCb([
    { type: 'characterData', target: textNode },
    { type: 'childList', target: convNode },
  ]);
  assert.equal(queryCalls, baselineQueries, 'streaming characterData and autoscroll-viewport mutations must perform 0 scan() queries');
  obs.stop();
});

test('perf guard 14: flattenMainStyleSheet preserves :not(:is(...)), prefix &, and minifyCss keeps quoted strings/URLs/IDs intact', () => {
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  const fnMatch = uiSrc.match(/function flattenMainStyleSheet\(\)[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'flattenMainStyleSheet must exist in ui-runtime.js');
  const attrs = new Map([['data-ag-cs-css-hash', 'h2']]);
  const fakeStyle = {
    textContent: 'orig',
    getAttribute: (k) => attrs.get(k) || null,
    setAttribute: (k, v) => attrs.set(k, String(v)),
    sheet: {
      cssRules: [
        {
          type: 1,
          selectorText: 'html[x] .card',
          style: { cssText: '' },
          cssRules: [
            { type: 1, selectorText: '.dark &', style: { cssText: 'opacity: 1;' }, cssRules: [] },
            { type: 1, selectorText: '&:not(:is(.a,.b))', style: { cssText: 'display: block;' }, cssRules: [] },
            { type: 1, selectorText: '& [data-x=":is(p,q)"]', style: { cssText: 'color: blue;' }, cssRules: [] },
          ],
        },
      ],
    },
  };
  const sb = {
    CODE_HASH: 'c2',
    runGuardedMut: (fn) => fn(),
    document: { getElementById: (id) => (id === 'ag-prism-css' ? fakeStyle : null) },
  };
  vm.runInNewContext(`${fnMatch[0]}; flattenMainStyleSheet();`, sb);
  assert.ok(fakeStyle.textContent.includes('.dark :is(html[x] .card){opacity: 1;}'), 'prefix & with ancestor combinator must preserve :is(...)');
  assert.ok(fakeStyle.textContent.includes('html[x] .card:not(:is(.a,.b)){display: block;}'), 'must never expand :is() inside :not()');
  assert.ok(fakeStyle.textContent.includes('html[x] .card [data-x=":is(p,q)"]{color: blue;}'), 'must never expand :is() inside quoted attribute values');

  const cdpSrc = fs.readFileSync(path.join(ROOT, 'cdp.js'), 'utf8');
  const minMatch = cdpSrc.match(/function minifyCss\(css\)[\s\S]*?\n\}/);
  assert.ok(minMatch, 'minifyCss must exist in cdp.js');
  const sbCss = { Set };
  vm.runInNewContext(`${minMatch[0]}; globalThis.minifyCss = minifyCss;`, sbCss);
  const sample = '#aabbcc-box { content: "v: 0.5 #aabbcc !important"; background: url(/files/0.5.png); color: red !important; }';
  const out = sbCss.minifyCss(sample);
  assert.ok(out.includes('#aabbcc-box{'), 'must preserve ID selectors');
  assert.ok(out.includes('content:"v: 0.5 #aabbcc !important"'), 'must preserve quoted string contents verbatim');
  assert.ok(out.includes('url(/files/0.5.png)'), 'must preserve url() decimals');
  assert.ok(out.includes('color:red!important'), 'must still minify safe colons and !important');
});

test('perf guard 15: conv-aura prime+sync(true) avoids post-write checkVisibility thrash, stream-choreography guards convEntrySeq reentrancy, and upstream-client whitelists fallback trigger & attrs', () => {
  // 1) conv-aura prime() + sync(true) reuses pre-measured indicator without re-invoking checkVisibility in Phase 2
  const auraSrc = fs.readFileSync(path.join(ROOT, 'conv-aura.js'), 'utf8');
  let checkVisCalls = 0;
  const stopBtn = {
    nodeType: 1,
    isConnected: true,
    style: {},
    matches: (sel) => sel.includes('stop-button'),
    closest: () => null,
    checkVisibility: () => { checkVisCalls++; return true; },
  };
  const convHost = {
    nodeType: 1, isConnected: true, parentElement: null,
    insertBefore() {}, firstChild: null,
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
    querySelectorAll: () => [],
  };
  convHost.parentElement = {
    nodeType: 1, isConnected: true, firstChild: convHost,
    insertBefore() {}, getBoundingClientRect: () => ({ width: 800, height: 600 }),
  };
  const fakeDoc = {
    hidden: false,
    documentElement: { getAttribute: () => 'standard' },
    querySelector: (s) => (s.includes('conversation-view') ? convHost : null),
    querySelectorAll: (s) => (s.includes('conversation-view') ? [convHost] : s.includes('stop-button') ? [stopBtn] : []),
    createElement: () => ({
      className: '', isConnected: true,
      style: { setProperty() {} },
      setAttribute() {}, getAttribute: () => null, hasAttribute: () => false, removeAttribute() {},
      appendChild() {}, remove() {},
    }),
    addEventListener() {}, removeEventListener() {},
  };
  let tNow = 1000;
  const sbAura = {
    window: null, document: fakeDoc, performance: { now: () => tNow },
    WeakSet, Set, Map, Array, Object, Math, Number, String, Boolean,
    setTimeout: () => 1, clearTimeout() {},
  };
  sbAura.window = sbAura; sbAura.globalThis = sbAura;
  vm.runInNewContext(auraSrc, sbAura);
  const ctl = sbAura.__agPrismConvAura.createConvAuraController({
    isDestroyed: () => false,
    isHomeRippleEnabled: () => true,
    isDarkTheme: () => true,
    isMotionStandardOrUltra: () => true,
    getAmbientIntensity: () => 1,
    getSpectrumMode: () => 'prism',
    setAttrIfChanged() {},
    runGuardedMut: (fn) => fn(),
  });
  ctl.prime();
  assert.equal(checkVisCalls, 1, 'prime() measures visibility once before DOM writes');
  ctl.sync(true);
  assert.equal(checkVisCalls, 1, 'sync(true) must reuse primed cache without redundant checkVisibility reflow');
  tNow += 300;
  ctl.advancePhase(tNow, true);
  assert.equal(checkVisCalls, 1, 'drawNow anim loop must skip synchronous checkVisibility within 2000ms while indicator matches');
  tNow += 2100;
  ctl.advancePhase(tNow, true);
  assert.equal(checkVisCalls, 2, 'drawNow anim loop performs full checkVisibility safety check after 2000ms');

  // 2) stream-choreography convEntrySeq cancels stale frame2Fn when fn() synchronously calls cancelDeferredHydration
  const scSrc = fs.readFileSync(path.join(ROOT, 'stream-choreography.js'), 'utf8');
  let timerCb = null;
  let rafCb = null;
  let t2 = 5000;
  const sbSc = {
    performance: { now: () => t2 },
    setTimeout: (cb) => { timerCb = cb; return 1; },
    clearTimeout() { timerCb = null; },
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    cancelAnimationFrame() { rafCb = null; },
    document: { documentElement: { getAttribute: () => 'ultra' }, querySelectorAll: () => [] },
    Set, Map, WeakSet, WeakMap, Array, Math, Number, String, Boolean,
  };
  sbSc.globalThis = sbSc;
  vm.runInNewContext(scSrc, sbSc);
  const sc = sbSc.__agPrismStreamChoreography.createStreamChoreographyController({
    isDestroyed: () => false,
    isMotionStandardOrUltra: () => true,
    isMotionUltra: () => true,
    isConvRunning: () => false,
    setAttrIfChanged() {},
  });
  let frame2Ran = 0;
  sc.scheduleDeferredConvEntry(
    () => { sc.cancelDeferredHydration(); return true; },
    50,
    () => { frame2Ran++; }
  );
  timerCb();
  if (rafCb) rafCb();
  assert.equal(frame2Ran, 0, 'frame2Fn must never fire if fn() synchronously cancels deferred hydration');

  // 3) upstream-client MutationObserver allows fallback button[aria-label^="Select model"] characterData & attributes
  const upSrc = fs.readFileSync(path.join(ROOT, 'vendor/effort-slider/upstream-client.js'), 'utf8');
  let moCb = null;
  let obsOpts = null;
  let qCount = 0;
  const docUp = {
    body: { nodeType: 1, querySelector: () => { qCount++; return null; }, querySelectorAll: () => [], appendChild() {} },
    head: { appendChild() {} },
    documentElement: { getAttribute: () => null },
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '', style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }),
    querySelector: () => { qCount++; return null; },
    querySelectorAll: () => [],
  };
  const sbUp = {
    window: null, document: docUp, __agCodexEffortSliderDisableAutoBoot: true,
    MutationObserver: class {
      constructor(cb) { moCb = cb; }
      observe(_t, o) { obsOpts = o; }
      disconnect() {}
    },
    Set, Map, Array, Object, Math, Number, String, Boolean, Date, RegExp, JSON,
  };
  sbUp.window = sbUp; sbUp.globalThis = sbUp;
  vm.runInNewContext(upSrc, sbUp);
  const obs = sbUp.AntigravityCodexEffortSlider.installAntigravityObserver({ document: docUp, window: sbUp, MutationObserver: sbUp.MutationObserver });
  assert.equal(obsOpts.attributes, true, 'must observe whitelisted menu state attributes');
  const q0 = qCount;
  const fallbackBtn = { nodeType: 1, closest: (sel) => (sel.includes('Select model') ? {} : null) };
  moCb([{ type: 'attributes', target: fallbackBtn }]);
  assert.ok(qCount > q0, 'whitelisted attributes on fallback Select model trigger must trigger scan()');
  const q1 = qCount;
  const sidebarNode = { nodeType: 1, closest: (sel) => (sel.includes('sidebar-split') ? {} : null) };
  moCb([{ type: 'attributes', target: sidebarNode }]);
  assert.equal(qCount, q1, 'attributes on sidebar nodes must be ignored with 0 scan() queries');
  obs.stop();
});

test('perf guard 16: smooth-caret avoids sel.isCollapsed forced layout, prism-rim-canvas skips rAF when pointer is far idle, and hover-card-popup is excluded from lens-in & composer/settings sync', () => {
  // 1) smooth-caret reads Range.collapsed/endContainer/endOffset without touching Selection.isCollapsed/focusNode
  const caretSrc = fs.readFileSync(path.join(ROOT, 'smooth-caret.js'), 'utf8');
  let selPropReads = 0;
  const textNode = { nodeType: 3, nodeValue: 'hi' };
  const fakeEd = {
    isConnected: true, isContentEditable: true,
    childNodes: [textNode], firstChild: textNode, textContent: 'hi',
    scrollLeft: 0, scrollTop: 0, scrollHeight: 20, clientHeight: 20,
    parentElement: {
      isConnected: true, clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0,
      hasAttribute: () => true, querySelector: () => null,
      getBoundingClientRect: () => ({ left: 10, top: 10, width: 300, height: 40 }),
    },
    contains: () => true,
    hasAttribute: () => true,
    getAttribute: () => 'true',
    getBoundingClientRect: () => ({ left: 10, top: 10, width: 300, height: 40 }),
    querySelectorAll: () => [],
  };
  const fakeSel = {
    rangeCount: 1,
    get isCollapsed() { selPropReads++; return true; },
    get focusNode() { selPropReads++; return textNode; },
    get focusOffset() { selPropReads++; return 2; },
    getRangeAt: () => ({
      collapsed: true,
      startContainer: textNode, startOffset: 2,
      endContainer: textNode, endOffset: 2,
      getClientRects: () => [{ left: 25, top: 14, height: 18 }],
    }),
  };
  const sbCaret = {
    window: { devicePixelRatio: 1 },
    document: {
      activeElement: fakeEd,
      getSelection: () => fakeSel,
      querySelectorAll: () => [fakeEd],
    },
    getComputedStyle: () => ({ paddingLeft: '8', paddingTop: '8', fontSize: '14', lineHeight: '22' }),
    WeakMap, Set, Map, Array, Math, Number, String, Boolean, Date,
  };
  sbCaret.globalThis = sbCaret;
  vm.runInNewContext(caretSrc, sbCaret);
  const caretCtl = sbCaret.__agPrismSmoothCaret.createSmoothCaretController({
    isDestroyed: () => false, isEnabled: () => true, setAttrIfChanged() {}, runGuardedMut: (fn) => fn(),
  });
  const snap = caretCtl.measureSnapshot(false, false);
  assert.equal(snap.length, 1);
  assert.equal(selPropReads, 0, 'smooth-caret must read pure-DOM Range properties instead of forced-layout Selection.isCollapsed/focusNode');

  // 2) prism-rim-canvas skips scheduling rAF on subsequent far-idle sidebar pointer moves
  const rimSrc = fs.readFileSync(path.join(ROOT, 'prism-rim-canvas.js'), 'utf8');
  let rafScheduled = 0;
  let lastRaf = null;
  let nowT = 5000;
  const fakeCv = {
    width: 100, height: 40, isConnected: true,
    classList: { contains: (c) => c === 'ag-cs-prism-rim-cv' },
    getContext: () => ({ clearRect() {}, createRadialGradient: () => ({ addColorStop() {} }) }),
    setAttribute() {}, remove() {},
  };
  const fakeBox = {
    isConnected: true, firstElementChild: fakeCv,
    getAttribute: (k) => (k === 'data-ag-cs-prism-box' ? '1' : null),
    getBoundingClientRect: () => ({ left: 600, top: 600, right: 900, bottom: 680, width: 300, height: 80 }),
    appendChild() {}, style: { setProperty() {} },
  };
  fakeCv.parentElement = fakeBox;
  const sbRim = {
    window: { devicePixelRatio: 1 },
    performance: { now: () => nowT },
    requestAnimationFrame: (cb) => { rafScheduled++; lastRaf = cb; return rafScheduled; },
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ borderTopLeftRadius: '10px' }),
    document: {
      documentElement: { getAttribute: () => 'ultra' },
      querySelectorAll: (s) => (s.includes('data-ag-cs-prism-box') ? [fakeBox] : []),
    },
    Set, Map, Array, Math, Number, String, Boolean,
  };
  sbRim.globalThis = sbRim;
  vm.runInNewContext(rimSrc, sbRim);
  const rimCtl = sbRim.__agPrismRimCanvas.createPrismRimCanvasController({
    isDestroyed: () => false, isDarkTheme: () => true, motionReduced: () => false,
    getMinFrameGapMs: () => 0, getAmbientIntensity: () => 1, getAccentTone: () => 'follow',
    canMountRealCanvas: () => true, setAttrIfChanged() {}, runGuardedMut: (fn) => fn(),
  });
  rimCtl.onPointerMove({ clientX: 40, clientY: 120 });
  assert.equal(rafScheduled, 1);
  lastRaf(nowT);
  nowT += 40;
  rimCtl.onPointerMove({ clientX: 45, clientY: 160 });
  assert.equal(rafScheduled, 1, 'far-idle sidebar pointer moves must schedule 0 rAFs once canvases are cleared');

  // 3) style.css, stream-choreography, and ui-runtime all exclude ephemeral [data-hover-card-popup]
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const uiSrc = fs.readFileSync(path.join(ROOT, 'ui-runtime.js'), 'utf8');
  const scSrc = fs.readFileSync(path.join(ROOT, 'stream-choreography.js'), 'utf8');
  assert.ok(css.includes('.agy-overlay:not([data-hover-card-popup])'), 'style.css must exclude hover cards from ag-cs-lens-in animation');
  assert.ok(scSrc.includes("ha(ov, 'data-hover-card-popup')"), 'stream-choreography must skip hover cards in measureNewLensOverlays');
  assert.ok(uiSrc.includes("'data-hover-card-popup'"), 'ui-runtime must short-circuit hover cards in classifyDirtySubtree');
});
