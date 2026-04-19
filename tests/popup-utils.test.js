const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeBasePath,
  validateBasePath,
} = require("../.test-dist/popup/popup-utils.js");

const {
  parseTranslationTargetLanguage,
} = require("../.test-dist/types.js");

test("validateBasePath: 공백/상대경로/절대경로 판별", () => {
  assert.equal(validateBasePath("   "), "empty");
  assert.equal(validateBasePath("Users/me/Github"), "must-start-with-slash");
  assert.equal(validateBasePath("/Users/me/Github"), null);
});

test("normalizeBasePath: trim + trailing slash 제거", () => {
  assert.equal(normalizeBasePath(" /Users/me/Github/ "), "/Users/me/Github");
  assert.equal(normalizeBasePath("/Volumes/data/Github"), "/Volumes/data/Github");
});

test("parseTranslationTargetLanguage: 허용 언어만 유지", () => {
  assert.equal(parseTranslationTargetLanguage("ko"), "ko");
  assert.equal(parseTranslationTargetLanguage("en"), "en");
  assert.equal(parseTranslationTargetLanguage("browser"), "browser");
  assert.equal(parseTranslationTargetLanguage("jp"), "browser");
  assert.equal(parseTranslationTargetLanguage(undefined), "browser");
});
