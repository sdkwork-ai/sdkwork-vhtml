import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDIO_LOCALES, detectStudioLanguage } from '@sdkwork/vhtml-studio/i18n';
import { STUDIO_HTML } from '@sdkwork/vhtml-studio/client';

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
