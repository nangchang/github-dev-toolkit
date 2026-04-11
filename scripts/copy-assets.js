const fs = require("fs");
const path = require("path");

// build.js와 같은 정적 파일 복사만 따로 실행하고 싶을 때 쓰는 보조 스크립트입니다.
// 복사할 정적 파일 목록 정의 (원본 경로 → 대상 경로)
const filesToCopy = [
  { src: "manifest.json", dest: "dist/manifest.json" },
  { src: "src/popup/popup.html", dest: "dist/popup/popup.html" },
  { src: "src/popup/popup.css", dest: "dist/popup/popup.css" },
  { src: "src/content/content.css", dest: "dist/content/content.css" },
  { src: "public/icon16.png", dest: "dist/icons/icon16.png" },
  { src: "public/icon48.png", dest: "dist/icons/icon48.png" },
  { src: "public/icon128.png", dest: "dist/icons/icon128.png" },
];

console.log("📦 정적 파일 복사 중...");

for (const file of filesToCopy) {
  // nested destination이 있어도 copyFileSync가 실패하지 않도록 대상 폴더를 먼저 만듭니다.
  const destDir = path.dirname(file.dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  if (fs.existsSync(file.src)) {
    fs.copyFileSync(file.src, file.dest);
    console.log(`  ✅ ${file.src} → ${file.dest}`);
  } else {
    console.warn(`  ⚠️  파일 없음 (건너뜀): ${file.src}`);
  }
}

console.log("✨ 빌드 완료! dist/ 폴더를 Chrome에 로드하세요.");
