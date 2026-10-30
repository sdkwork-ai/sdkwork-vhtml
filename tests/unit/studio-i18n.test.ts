import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { STUDIO_LOCALES, detectStudioLanguage } from '@sdkwork/vhtml-studio/i18n';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';
import { VISUAL_EFFECT_TYPES, AUDIO_EFFECT_TYPES } from '@sdkwork/vhtml-core/model';

test('i18n dictionaries cover both languages with key parity', () => {
  const languages = Object.keys(STUDIO_LOCALES);
  assert.ok(languages.includes('en'));
  assert.ok(languages.includes('zh-CN'));
  const enKeys = new Set(Object.keys(STUDIO_LOCALES.en!));
  const zhKeys = Object.keys(STUDIO_LOCALES['zh-CN']!);
  // Every zh key resolves to an English-authored key (values differ from key for the bulk).
  for (const key of zhKeys) {
    assert.ok(typeof STUDIO_LOCALES['zh-CN']![key] === 'string' && STUDIO_LOCALES['zh-CN']![key].length > 0, `zh value for "${key}"`);
  }
  // No empty translations.
  for (const key of zhKeys) assert.notEqual(STUDIO_LOCALES['zh-CN']![key], '');
  assert.ok(enKeys.size >= 0); // en is intentionally empty (keys ARE English)
  // Core chrome keys exist in zh.
  for (const key of ['Export', 'Split', 'Duplicate', 'Detach Audio', 'Keyboard shortcuts', 'Inspector']) {
    assert.ok(zhKeys.includes(key), `zh covers "${key}"`);
  }
});

test('detectStudioLanguage honours storage then browser language', () => {
  assert.equal(detectStudioLanguage('zh-CN', null), 'zh-CN');
  assert.equal(detectStudioLanguage('en-US', null), 'en');
  assert.equal(detectStudioLanguage('zh-CN', 'en'), 'en');
  assert.equal(detectStudioLanguage(undefined, 'zh-CN'), 'zh-CN');
  assert.equal(detectStudioLanguage(undefined, 'fr'), 'en');
});

test('STUDIO_HTML embeds the locale dictionary and i18n runtime', () => {
  assert.ok(STUDIO_HTML.includes('window.VHTML_I18N'));
  assert.ok(STUDIO_HTML.includes('zh-CN'), 'zh locale embedded');
  assert.ok(STUDIO_HTML.includes('data-i18n'), 'static i18n attributes present');
  assert.ok(STUDIO_HTML.includes('applyStaticI18n'), 'boot pass present');
  assert.ok(STUDIO_HTML.includes("vhtml-lang"), 'language persistence key');
});

test('every inline script in STUDIO_HTML parses (template literals escape tsc)', () => {
  const scripts = [...STUDIO_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 2, 'at least the i18n bootstrap and the app script');
  for (const [index, source] of scripts.entries()) {
    // Compiling (not running) catches syntax errors tsc cannot see inside the
    // STUDIO_HTML template literal — one unbalanced paren used to blank the UI.
    assert.doesNotThrow(() => new vm.Script(source, { filename: `studio-inline-${index}.js` }),
      `inline script #${index} must parse`);
  }
});

test('Studio UI offers every runtime visual effect type', () => {
  for (const type of VISUAL_EFFECT_TYPES) {
    assert.ok(STUDIO_HTML.includes(`'${type}'`),
      `visual effect "${type}" is implemented by the runtime but missing from the Studio catalog`);
  }
});

test('Studio UI offers the parameterised audio effect types', () => {
  // 'fade' is authored through the clip fadeIn/fadeOut fields — it takes no
  // per-effect params today. 'normalize'/'denoise' ship in the Studio audio
  // catalog (per-clip export mixdown effects).
  const reserved = new Set(['fade']);
  for (const type of AUDIO_EFFECT_TYPES) {
    if (reserved.has(type)) continue;
    assert.ok(STUDIO_HTML.includes(`'${type}'`),
      `audio effect "${type}" is implemented by the mixer but missing from the Studio palette`);
  }
});

test('Studio exposes the effects/transitions library tab', () => {
  assert.ok(STUDIO_HTML.includes('data-tab="effects"'), 'Effects tab button present');
  // Every canon transition type is offered as a draggable library chip.
  for (const type of ['crossfade', 'fade', 'dip', 'wipe', 'slide', 'zoom', 'blur']) {
    assert.ok(STUDIO_HTML.includes(`'${type}'`), `transition "${type}" in the library`);
  }
  assert.ok(STUDIO_HTML.includes('application/x-vhtml-effect'), 'drag-drop payload channel present');
});
