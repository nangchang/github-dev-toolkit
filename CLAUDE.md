# CLAUDE.md

Claude Code(claude.ai/code) 전용 가이드. 프로젝트 전체 문서는 `AGENTS.md` 참조.

## 빌드 / 테스트

```bash
npm run build        # TypeScript 컴파일 + 정적 파일 복사
npm run watch        # 파일 변경 감지 자동 재빌드
npm run test         # 유닛 테스트 (content-utils, popup-utils, background-utils)
npm run clean        # dist/ 삭제
```

## 코딩 규칙

- `content.ts`의 import는 `content-utils.ts`에서 직접 가져올 것 — `as xxxFromUtils` alias + wrapper 함수 패턴 사용 금지.
- selector 배열을 함수 내에서 `.join(", ")` 호출하지 말고 모듈 상단 상수로 선언.
- `${settings.basePath}/${repo}/${filePath}` 패턴은 `resolveButton()` 헬퍼를 사용.
- 새 유틸 함수는 해당 `*-utils.ts` 파일에 추가하고 `tests/` 에 테스트도 함께 작성.

## 테스트 범위

유틸 함수(`content-utils.ts`, `popup-utils.ts`, `background-utils.ts`)는 단위 테스트로 커버됨 — 변경 후 `npm run test` 실행 필수.

DOM 조작 함수(`content.ts` injection 계열)는 브라우저 없이 테스트 불가. 변경 시 Chrome에서 직접 확장을 로드해 검증할 것.
