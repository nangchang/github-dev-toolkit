# AGENTS.md

AI 에이전트 공용 프로젝트 가이드. Claude Code 전용 설정은 `CLAUDE.md` 참조.

## 명령어

```bash
npm run build        # TypeScript 컴파일 + 정적 파일 복사 → dist/
npm run watch        # 파일 변경 감지 자동 재빌드
npm run test         # 유닛 테스트 (Node.js test runner)
npm run test:build   # 테스트 파일만 컴파일 (실행 없음)
npm run clean        # dist/ 삭제
npm run pack         # 빌드 후 배포용 .zip 생성
```

## 아키텍처

**Chrome Extension (Manifest V3)** — GitHub 페이지에 "IDE에서 열기" 버튼을 삽입해 로컬 IDE로 파일을 바로 열 수 있게 해주는 확장. TypeScript + esbuild로 빌드.

### 컴포넌트

**`src/types.ts`** — 공유 타입: `SupportedIDE`, `UserSettings`, `TranslationTargetLanguage`, IDE URI 스킴 매핑.

**`src/background/background.ts`** — 서비스 워커. 설치/업데이트 이벤트 처리, content script의 팝업 열기 요청 라우팅.  
**`src/background/background-utils.ts`** — 백그라운드 유틸: 설치 로그 메시지, 팝업 열기 요청 판별.

**`src/content/content.ts`** (~2015줄) — 핵심 로직. GitHub 페이지에 주입되어 페이지 종류를 감지하고 버튼을 삽입. `MutationObserver`와 300ms 디바운스로 GitHub SPA 내비게이션에 대응.  
**`src/content/content-utils.ts`** — URL 파싱, 경로 정규화, 언어 감지 등 순수 유틸 함수 (단위 테스트 커버됨).

**`src/popup/popup.ts` + `popup.html`** — 설정 UI. 사용자가 로컬 basePath와 IDE를 선택하며 `chrome.storage.sync`에 저장.  
**`src/popup/popup-utils.ts`** — 경로 유효성 검사, 정규화 유틸.

### 데이터 플로우

1. Content script가 GitHub 로드 시 `chrome.storage.sync`에서 사용자 설정 조회
2. 현재 URL에서 owner, repo, 파일 경로 파싱
3. 절대 로컬 경로 조합: `{basePath}/{repo}/{filePath}`
4. IDE URI로 이동하는 버튼 삽입 (예: `vscode://file/{path}:{line}`)

### 버튼 삽입 전략 (6가지)

| 함수 | 대상 페이지 | 버튼 위치 |
|------|------------|----------|
| `injectIntoRepoView()` | 레포 루트/트리 (`/`, `/tree/...`) | "Code" 버튼 앞 |
| `injectIntoFileTreeRows()` | 파일 트리 목록 행 | 파일명 링크 뒤 |
| `injectIntoFileView()` | 파일 blob 뷰 (`/blob/...`) | Raw/Copy 버튼 그룹 앞 |
| `injectIntoPrFilesView()` | PR Files Changed (`/pull/.../files`) | 파일 헤더 액션 영역 |
| `injectIntoPrPreviewUx()` | PR preview UX (`/pull/.../changes`) | 우측 액션 그룹 |
| `injectIntoPrReviewThreadHeaders()` | PR 인라인 리뷰 스레드 헤더 | 파일 경로 링크 옆 |

### 파일 경로 분해 복잡도

브랜치명에 슬래시가 포함되면 (`feature/foo-bar`) GitHub URL이 모호해집니다.  
`resolveBlobFilePath()`가 다음 순서로 실제 브랜치/경로 분기를 탐색합니다:

1. 문서 제목 파싱 (`repo/src/file.ts at feature/foo · owner/repo`)
2. DOM `data-path` 속성
3. GitHub React 앱 내장 JSON
4. UI ref name 탐지
5. Fallback: 단일 세그먼트 브랜치명 가정

### 빌드 시스템

`scripts/build.js`가 esbuild를 오케스트레이션:
- `content.ts`, `background.ts`, `popup.ts` 각각 번들링 (IIFE, Chrome 100+)
- CSS, HTML, 아이콘, `manifest.json`, `_locales/` → `dist/` 복사
- `--watch` 플래그로 파일 변경 자동 재빌드 (정적 파일은 시작 시 1회만 복사)
- 개발: `dist/` 폴더를 Chrome 확장 개발자 모드에서 로드

### 테스트

```
tests/
  content-utils.test.js    # URL 파싱, 경로 정규화, IDE URI 생성, 언어 감지
  popup-utils.test.js      # 경로 유효성 검사 및 정규화
  background-utils.test.js # 설치 메시지, 팝업 요청 판별
```

- Node.js 내장 `test`/`assert/strict` 모듈 사용
- `tsconfig.test.json`으로 `.test-dist/`에 컴파일 후 실행
- DOM 조작 함수(`content.ts` injection 계열)는 브라우저 없이 테스트 불가 — Chrome에서 직접 검증 필요
