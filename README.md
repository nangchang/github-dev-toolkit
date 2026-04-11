# GitHub Dev Toolkit

GitHub 페이지에서 파일을 로컬 IDE로 바로 열 수 있게 해주는 Chrome 확장 프로그램입니다.

## 기능

- GitHub 파일 뷰, PR Files Changed, PR Preview에서 "IDE에서 열기" 버튼 주입
- 특정 줄 번호 또는 범위로 이동 지원 (예: `#L42`, `#L10-L20`)
- 슬래시가 포함된 브랜치 이름 처리
- GitHub SPA 네비게이션 대응 (MutationObserver)

## 지원 IDE

| IDE | URI 스킴 |
|-----|----------|
| VS Code | `vscode://` |
| VS Code Insiders | `vscode-insiders://` |
| VSCodium | `vscodium://` |
| Cursor | `cursor://` |
| Windsurf | `windsurf://` |

## 설치

1. 저장소를 클론합니다.
2. 의존성을 설치하고 빌드합니다:

```bash
npm install
npm run build
```

3. Chrome에서 `chrome://extensions`를 열고 **개발자 모드**를 활성화합니다.
4. **압축해제된 확장 프로그램을 로드합니다**를 클릭하고 `dist/` 폴더를 선택합니다.

## 설정

확장 프로그램 아이콘을 클릭해 팝업을 열고 다음을 설정합니다:

- **Base Path**: 레포지토리들이 클론된 상위 디렉토리 경로 (예: `/Users/me/Github`)
- **IDE**: 사용할 에디터 선택

설정은 `chrome.storage.sync`에 저장되어 같은 Chrome 계정의 기기 간에 동기화됩니다.

## 개발

```bash
npm run watch   # 파일 변경 시 자동 빌드
npm run clean   # dist/ 삭제
```

빌드 후 `chrome://extensions`에서 확장 프로그램을 새로고침하면 변경사항이 반영됩니다.

## 동작 원리

1. 현재 GitHub URL을 파싱하여 레포 이름과 파일 경로를 추출
2. 로컬 절대 경로 구성: `{basePath}/{repo}/{filePath}`
3. IDE URI로 이동: `{scheme}://file/{absolutePath}:{lineNumber}`
