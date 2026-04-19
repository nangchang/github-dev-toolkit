const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildIdeUri,
  decodePathSegment,
  detectFilePath,
  getDecodedPathSegments,
  inferCommentLanguage,
  isTailFilePath,
  normalizeDetectedLanguageCode,
  normalizeFilePathCandidate,
  normalizeLanguageCode,
  parseGitHubPrUrl,
  parseGitHubRepoUrl,
  parseLineFromDiffAnchor,
  parseLineNumber,
  splitFilePath,
} = require("../.test-dist/content/content-utils.js");

test("decodePathSegment: 퍼센트 인코딩 디코딩 및 실패 fallback", () => {
  assert.equal(decodePathSegment("foo%20bar"), "foo bar");
  assert.equal(decodePathSegment("%E0%A4%A"), "%E0%A4%A");
});

test("getDecodedPathSegments / splitFilePath", () => {
  assert.deepEqual(getDecodedPathSegments("/owner/repo%20name/blob/main"), [
    "owner",
    "repo name",
    "blob",
    "main",
  ]);
  assert.deepEqual(splitFilePath("/src//app/index.ts"), ["src", "app", "index.ts"]);
});

test("normalizeFilePathCandidate: 유효한 파일 경로만 정규화", () => {
  assert.equal(normalizeFilePathCandidate(" /src/foo%20bar.ts "), "src/foo bar.ts");
  assert.equal(normalizeFilePathCandidate("https://example.com/a.ts"), null);
  assert.equal(normalizeFilePathCandidate("src/foo.ts\nsrc/bar.ts"), null);
});

test("isTailFilePath: tail 파일 경로 매칭", () => {
  const tail = ["feature", "with-slash", "src", "feature.ts"];
  assert.equal(isTailFilePath(tail, "src/feature.ts"), true);
  assert.equal(isTailFilePath(tail, "feature/with-slash/src/feature.ts"), false);
  assert.equal(isTailFilePath(tail, "src/other.ts"), false);
});

test("detectFilePath: 파일 경로 후보 감지", () => {
  assert.equal(detectFilePath("src/content/content.ts"), "src/content/content.ts");
  assert.equal(detectFilePath("package.json"), "package.json");
  assert.equal(detectFilePath("README"), null);
  assert.equal(detectFilePath("https://github.com"), null);
  assert.equal(detectFilePath("@types/node"), null);
  assert.equal(detectFilePath("src/has space.ts"), null);
});

test("parseGitHubRepoUrl: root/tree만 허용", () => {
  assert.deepEqual(parseGitHubRepoUrl("https://github.com/openai/codex"), {
    owner: "openai",
    repo: "codex",
  });
  assert.deepEqual(
    parseGitHubRepoUrl("https://github.com/openai/codex/tree/main/src"),
    { owner: "openai", repo: "codex" }
  );
  assert.equal(parseGitHubRepoUrl("https://github.com/openai/codex/blob/main/README.md"), null);
});

test("parseGitHubPrUrl: PR URL에서 owner/repo 추출", () => {
  assert.deepEqual(
    parseGitHubPrUrl("https://github.com/openai/codex/pull/123/files"),
    { owner: "openai", repo: "codex" }
  );
  assert.equal(parseGitHubPrUrl("https://github.com/openai/codex/issues/1"), null);
});

test("parseLineNumber: #L 형식 파싱", () => {
  assert.equal(parseLineNumber("#L42"), 42);
  assert.equal(parseLineNumber("#L10-L20"), 10);
  assert.equal(parseLineNumber("#discussion_r123"), null);
});

test("parseLineFromDiffAnchor: diff hash에서 라인 번호 추출", () => {
  const baseUrl = "https://github.com/openai/codex/pull/123/files";

  assert.equal(
    parseLineFromDiffAnchor("#diff-abcdR24", baseUrl),
    24
  );
  assert.equal(
    parseLineFromDiffAnchor("#diff-abcdL11", baseUrl),
    11
  );
  assert.equal(
    parseLineFromDiffAnchor("#discussion_r100", baseUrl),
    null
  );
  assert.equal(
    parseLineFromDiffAnchor("::bad-url::", baseUrl),
    null
  );
});

test("buildIdeUri: 경로 인코딩과 라인 번호 포함", () => {
  assert.equal(
    buildIdeUri("cursor", "/Users/me/My Repo/src/a+b.ts", 7),
    "cursor://file//Users/me/My%20Repo/src/a%2Bb.ts:7"
  );
  assert.equal(
    buildIdeUri("vscode", "/Users/me/repo/README.md", null),
    "vscode://file//Users/me/repo/README.md"
  );
});

test("normalizeLanguageCode / normalizeDetectedLanguageCode", () => {
  assert.equal(normalizeLanguageCode("ko-KR"), "ko");
  assert.equal(normalizeLanguageCode(undefined), null);
  assert.equal(normalizeDetectedLanguageCode("und"), null);
  assert.equal(normalizeDetectedLanguageCode("unknown"), null);
  assert.equal(normalizeDetectedLanguageCode("fr-CA"), "fr");
});

test("inferCommentLanguage: 한글 우선 + detector fallback", () => {
  assert.equal(inferCommentLanguage("한글 댓글입니다", "en"), "ko");
  assert.equal(inferCommentLanguage("Needs update", "de-DE"), "de");
  assert.equal(inferCommentLanguage("Needs update", "unknown"), "en");
});
