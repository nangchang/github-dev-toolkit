const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");

// ─── 1. dist 폴더 내 디렉토리 보장 ─────────────────────────────────
// Chrome은 dist/를 그대로 확장 프로그램 루트로 읽으므로 manifest 경로 구조와 맞춰 둡니다.
const dirs = [
  "dist/popup",
  "dist/content",
  "dist/background",
  "dist/icons",
];
for (const dir of dirs) {
  fs.mkdirSync(dir, { recursive: true });
}

// ─── 2. 정적 파일 복사 ───────────────────────────────────────────────
// esbuild가 처리하지 않는 manifest/html/css/icon 파일은 원본 경로를 유지해 복사합니다.
const staticFiles = [
  { src: "manifest.json",                dest: "dist/manifest.json" },
  { src: "src/popup/popup.html",         dest: "dist/popup/popup.html" },
  { src: "src/popup/popup.css",          dest: "dist/popup/popup.css" },
  { src: "src/content/content.css",      dest: "dist/content/content.css" },
  { src: "public/icon16.png",            dest: "dist/icons/icon16.png" },
  { src: "public/icon48.png",            dest: "dist/icons/icon48.png" },
  { src: "public/icon128.png",           dest: "dist/icons/icon128.png" },
];

function copyStatic() {
  console.log("📦 정적 파일 복사 중...");
  for (const file of staticFiles) {
    if (fs.existsSync(file.src)) {
      fs.copyFileSync(file.src, file.dest);
      console.log(`  ✅ ${file.src} → ${file.dest}`);
    } else {
      console.warn(`  ⚠️  파일 없음 (건너뜀): ${file.src}`);
    }
  }
}

copyStatic();

// ─── 3. esbuild로 TypeScript 번들링 ─────────────────────────────────
/** @type {import('esbuild').BuildOptions} */
const sharedOptions = {
  bundle: true,        // import/require를 하나의 파일로 묶음
  platform: "browser", // 브라우저 환경 대상
  target: "chrome100", // Chrome 100+ 지원
  format: "iife",      // 즉시 실행 함수: exports/require 없이 동작
  logLevel: "info",
};

const entryPoints = [
  { in: "src/popup/popup.ts",           out: "dist/popup/popup" },
  { in: "src/content/content.ts",       out: "dist/content/content" },
  { in: "src/background/background.ts", out: "dist/background/background" },
];

async function build() {
  if (isWatch) {
    // Watch 모드: 파일 변경 시 자동 재빌드
    // 정적 파일은 시작 시 한 번만 복사하므로, html/css/icon 변경 후에는 빌드를 다시 실행해야 합니다.
    const contexts = await Promise.all(
      entryPoints.map((ep) =>
        esbuild.context({
          ...sharedOptions,
          entryPoints: [ep.in],
          outfile: `${ep.out}.js`,
        })
      )
    );
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log("👀 파일 변경 감지 중... (Ctrl+C로 종료)");
  } else {
    // 단순 빌드
    await Promise.all(
      entryPoints.map((ep) =>
        esbuild.build({
          ...sharedOptions,
          entryPoints: [ep.in],
          outfile: `${ep.out}.js`,
        })
      )
    );
    console.log("✨ 빌드 완료! dist/ 폴더를 Chrome에 로드하세요.");
  }
}

build().catch((err) => {
  console.error("❌ 빌드 실패:", err.message);
  process.exit(1);
});
