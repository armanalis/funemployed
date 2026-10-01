import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// i18n.js is a browser module that fetches the deck; hand it the file instead.
globalThis.fetch = async () => ({ json: async () => JSON.parse(readFileSync('public/shared/cards.json', 'utf8')) });
const { STRINGS, LANGS, trGenitive } = await import('../public/js/i18n.js');

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every interface string exists in every language with the same placeholders', () => {
  const keys = Object.keys(STRINGS.en);
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(), [...keys].sort(), `${lang} has missing or extra keys`);
    for (const key of keys) {
      // Turkish names take a suffix, so myJobTitle uses {gen} there instead of {name}.
      if (key === 'myJobTitle') continue;
      assert.deepEqual(placeholders(STRINGS[lang][key]), placeholders(STRINGS.en[key]), `${lang}.${key}`);
    }
  }
});

test('Turkish possessive follows vowel harmony', () => {
  assert.equal(trGenitive('Ali'), "Ali'nin");
  assert.equal(trGenitive('Mert'), "Mert'in");
  assert.equal(trGenitive('Oğuz'), "Oğuz'un");
  assert.equal(trGenitive('Gül'), "Gül'ün");
  assert.equal(trGenitive('Burak'), "Burak'ın");
});
