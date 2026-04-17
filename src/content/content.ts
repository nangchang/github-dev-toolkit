import { SupportedIDE, UserSettings, IDE_URI_SCHEMES, IDE_DISPLAY_NAMES } from "../types";

// ============================================================
// 상수 및 타입
// ============================================================

/** 버튼이 이미 삽입됐음을 표시하는 CSS 클래스 */
const INJECTED_MARKER = "gdt-injected";

/** 레포지토리 뷰 버튼이 이미 삽입됐음을 표시하는 CSS 클래스 */
const REPO_INJECTED_MARKER = "gdt-repo-btn";

/** 파일 트리 행(row) 버튼이 이미 삽입됐음을 표시하는 CSS 클래스 */
const TREE_ROW_INJECTED_MARKER = "gdt-tree-row-btn";

/** 선택된 라인 번호를 URL에서 파싱하는 정규식 (예: #L42 또는 #L10-L20) */
const LINE_NUMBER_REGEX = /#L(\d+)(?:-L(\d+))?$/;

/** 화면에 표시된 라인 배지를 GitHub의 현재 URL hash와 동기화하는 콜백 목록 */
const lineBadgeUpdaters = new Set<() => void>();

/** GitHub SPA 내에서 hash/DOM 상태가 바뀔 때 모든 라인 배지를 갱신합니다. */
function syncLineBadges(): void {
  lineBadgeUpdaters.forEach((updateLineBadge) => updateLineBadge());
}

/** GitHub URL 경로 segment를 안전하게 디코딩합니다. */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** URL pathname을 segment 단위로 나눠 이후 ref/file 경로 비교에 사용할 수 있게 만듭니다. */
function getDecodedPathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map(decodePathSegment);
}

/** 파일 경로 비교용으로 빈 segment를 제거합니다. */
function splitFilePath(filePath: string): string[] {
  return filePath.split("/").filter(Boolean);
}

/**
 * DOM/JSON에서 추출한 path 후보를 로컬 파일 경로 후보로 정규화합니다.
 * URL이나 여러 줄 문자열은 GitHub 데이터 안의 파일 경로가 아니므로 제외합니다.
 */
function normalizeFilePathCandidate(value: string): string | null {
  const trimmed = value.trim().replace(/^\/+/, "");
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.includes("\n")) {
    return null;
  }

  return splitFilePath(trimmed).map(decodePathSegment).join("/");
}

/**
 * GitHub blob URL의 ref+file tail에서 주어진 파일 경로가 끝부분과 일치하는지 확인합니다.
 * 브랜치명에 slash가 들어가도 파일 경로 tail은 보통 안정적으로 비교할 수 있습니다.
 */
function isTailFilePath(tailSegments: string[], filePath: string): boolean {
  const fileSegments = splitFilePath(filePath);
  if (fileSegments.length === 0 || fileSegments.length >= tailSegments.length) {
    return false;
  }

  const tailFileSegments = tailSegments.slice(-fileSegments.length);
  return fileSegments.every((segment, index) => segment === tailFileSegments[index]);
}

/**
 * GitHub 문서 제목에서 파일 경로를 추출합니다.
 * 예: `repo/src/file.ts at feature/foo · owner/repo`
 */
function getFilePathFromDocumentTitle(
  owner: string,
  repo: string,
  tailSegments: string[]
): string | null {
  let title = document.title;
  if (title.endsWith(" · GitHub")) {
    title = title.slice(0, -" · GitHub".length);
  }

  const titleSuffix = ` · ${owner}/${repo}`;
  if (!title.endsWith(titleSuffix)) return null;

  const titleBody = title.slice(0, -titleSuffix.length);
  const refSeparatorIndex = titleBody.lastIndexOf(" at ");
  if (refSeparatorIndex === -1) return null;

  const pathWithRepo = titleBody.slice(0, refSeparatorIndex);
  const repoPrefix = `${repo}/`;
  if (!pathWithRepo.startsWith(repoPrefix)) return null;

  const filePath = pathWithRepo.slice(repoPrefix.length);
  return isTailFilePath(tailSegments, filePath) ? filePath : null;
}

/**
 * GitHub가 렌더링한 DOM 속성에서 파일 경로 후보를 수집합니다.
 * PR diff와 blob 화면 모두 data-path 계열 속성을 자주 사용합니다.
 */
function collectDomPathCandidates(tailSegments: string[]): string[] {
  const candidates: string[] = [];
  const elements = document.querySelectorAll<HTMLElement>("[data-path], [data-file-path]");

  elements.forEach((element) => {
    const rawPath = element.getAttribute("data-file-path") ?? element.getAttribute("data-path");
    if (!rawPath) return;

    const filePath = normalizeFilePathCandidate(rawPath);
    if (filePath && isTailFilePath(tailSegments, filePath)) {
      candidates.push(filePath);
    }
  });

  return candidates;
}

/**
 * GitHub embedded JSON을 재귀적으로 훑어 파일 경로 후보를 찾습니다.
 * 깊이 제한을 둬서 예기치 않은 큰 데이터 구조에서도 콘텐츠 스크립트가 과하게 돌지 않게 합니다.
 */
function collectJsonPathCandidates(
  value: unknown,
  tailSegments: string[],
  candidates: string[],
  depth: number = 0
): void {
  if (depth > 8 || value === null) return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonPathCandidates(item, tailSegments, candidates, depth + 1));
    return;
  }

  if (typeof value !== "object") return;

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (typeof child === "string" && /path/i.test(key) && !/(url|href|route|avatar|image)/i.test(key)) {
      const filePath = normalizeFilePathCandidate(child);
      if (filePath && isTailFilePath(tailSegments, filePath)) {
        candidates.push(filePath);
      }
    } else {
      collectJsonPathCandidates(child, tailSegments, candidates, depth + 1);
    }
  });
}

/**
 * GitHub React 앱이 심어둔 embedded data script에서 파일 경로 후보를 수집합니다.
 * URL만으로는 slash가 있는 브랜치와 파일 경로를 구분하기 어려워 이 데이터를 보조 신호로 씁니다.
 */
function collectEmbeddedDataPathCandidates(tailSegments: string[]): string[] {
  const candidates: string[] = [];
  const embeddedDataScripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/json"][data-target$=".embeddedData"]'
  );

  embeddedDataScripts.forEach((script) => {
    if (!script.textContent) return;

    try {
      collectJsonPathCandidates(JSON.parse(script.textContent), tailSegments, candidates);
    } catch {
      // GitHub의 embedded data가 아니거나 파싱할 수 없는 script는 무시합니다.
    }
  });

  return candidates;
}

/** 후보가 여러 개면 가장 구체적인, 즉 segment 수가 가장 많은 파일 경로를 선택합니다. */
function pickLongestFilePath(candidates: string[]): string | null {
  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => splitFilePath(b).length - splitFilePath(a).length)[0];
}

/**
 * 현재 선택된 branch/tag 이름을 GitHub UI에서 읽습니다.
 * DOM/embedded data에서 파일 경로를 못 찾은 경우 ref 길이를 계산하는 마지막 보조 수단입니다.
 */
function getCurrentRefName(tailSegments: string[]): string | null {
  const selectors = [
    ".js-branch-name",
    "[data-testid='branch-name']",
    "button[aria-label^='Branch:']",
    "button[aria-label^='Tag:']",
  ];

  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    const rawText =
      element?.getAttribute("title") ??
      element?.getAttribute("aria-label") ??
      element?.textContent;
    const refName = rawText?.replace(/^(Branch|Tag):\s*/i, "").trim();
    if (!refName) continue;

    const refSegments = splitFilePath(refName);
    const matchesTail = refSegments.every((segment, index) => tailSegments[index] === segment);
    if (matchesTail && refSegments.length < tailSegments.length) {
      return refName;
    }
  }

  return null;
}

/**
 * blob/raw URL의 ref+file tail에서 실제 파일 경로를 복원합니다.
 * 정확도가 높은 단서부터 순서대로 시도하고, 마지막에만 단일 segment ref fallback을 사용합니다.
 */
function resolveBlobFilePath(owner: string, repo: string, tailSegments: string[]): string | null {
  const titleFilePath = getFilePathFromDocumentTitle(owner, repo, tailSegments);
  if (titleFilePath) return titleFilePath;

  const domFilePath = pickLongestFilePath(collectDomPathCandidates(tailSegments));
  if (domFilePath) return domFilePath;

  const embeddedDataFilePath = pickLongestFilePath(collectEmbeddedDataPathCandidates(tailSegments));
  if (embeddedDataFilePath) return embeddedDataFilePath;

  const currentRefName = getCurrentRefName(tailSegments);
  if (currentRefName) {
    return tailSegments.slice(splitFilePath(currentRefName).length).join("/");
  }

  // DOM 기반 단서가 없을 때만 사용하는 fallback: 단일 segment 브랜치/태그만 정확합니다.
  return tailSegments.length >= 2 ? tailSegments.slice(1).join("/") : null;
}

// ============================================================
// URL 분석 유틸리티
// ============================================================

/**
 * 텍스트가 파일 경로처럼 보이는지 검사합니다.
 * 허용 조건: 공백·URL·특수문자 없음, 파일 확장자 보유
 *   - 슬래시 포함 → 하위 경로 파일 (예: src/foo.ts)
 *   - 슬래시 없음 + 확장자 있음 → 루트 파일 (예: package.json, tsconfig.json)
 * @returns 정규화된 파일 경로 또는 null
 */
function detectFilePath(text: string): string | null {
  if (!text || text.length > 300 || text.includes("\n") || /\s/.test(text)) return null;
  // URL 및 npm 스코프 패키지 제외
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.startsWith("@")) return null;
  // 슬래시도 없고 점도 없으면 파일 경로로 보기 어려움
  if (!text.includes("/") && !text.includes(".")) return null;
  // 허용 문자: 영숫자, 점, 하이픈, 언더스코어, 슬래시
  if (!/^[a-zA-Z0-9._\-/]+$/.test(text)) return null;
  // 마지막 segment에 파일 확장자 필수
  const lastSegment = text.split("/").filter(Boolean).pop() ?? "";
  if (!/\.[a-zA-Z0-9]{1,10}$/.test(lastSegment)) return null;

  return normalizeFilePathCandidate(text);
}

/**
 * 현재 GitHub URL에서 오너(owner), 레포지토리(repo), 파일 경로(filePath)를 파싱합니다.
 * blob, raw, tree(폴더) 모두 지원합니다. root 레포 경로인 경우 filePath는 부재(빈 문자열)합니다.
 * 예: https://github.com/user/my-repo/blob/main/src/index.ts
 *     → { owner: "user", repo: "my-repo", filePath: "src/index.ts" }
 */
function parseGitHubUrl(url: string): { owner: string; repo: string; filePath?: string } | null {
  try {
    const urlObj = new URL(url);
    const segments = getDecodedPathSegments(urlObj.pathname);
    const [owner, repo, kind, ...tailSegments] = segments;
    
    if (!owner || !repo) return null;
    
    // 루트 경로인 경우
    if (segments.length === 2) {
      return { owner, repo, filePath: "" };
    }

    if (!["blob", "raw", "tree"].includes(kind)) {
      return null;
    }

    // /tree/{branch} 등 파일/폴더 경로가 비어있는 루트의 특정 브랜치인 경우
    const filePath = resolveBlobFilePath(owner, repo, tailSegments);
    return {
      owner,
      repo,
      filePath: filePath || "",
    };
  } catch {
    return null;
  }
}

/**
 * GitHub 레포지토리 메인 페이지(루트) 또는 트리 뷰 URL을 파싱합니다.
 * 대상: github.com/{owner}/{repo}  또는  github.com/{owner}/{repo}/tree/...
 * 비대상: blob, pull, issues, commits 등 세부 경로는 null 반환.
 * 예: https://github.com/user/my-repo        → { owner: "user", repo: "my-repo" }
 *     https://github.com/user/my-repo/tree/main/src → { owner: "user", repo: "my-repo" }
 */
function parseGitHubRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const { pathname } = new URL(url);
    const segments = getDecodedPathSegments(pathname);
    if (segments.length < 2) return null;

    const [owner, repo, kind] = segments;
    // 레포 루트(세그먼트 2개) 또는 트리 뷰(/tree/...)만 대상으로 합니다.
    if (segments.length === 2 || kind === "tree") {
      return { owner, repo };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * PR URL에서 오너(owner), 레포지토리(repo)를 파싱합니다.
 * 예: https://github.com/user/my-repo/pull/123/files
 *     → { owner: "user", repo: "my-repo" }
 */
function parseGitHubPrUrl(url: string): { owner: string; repo: string } | null {
  try {
    const urlObj = new URL(url);
    const match = urlObj.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/\d+/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  } catch {
    return null;
  }
}

/**
 * URL 해시(#L10, #L10-L20)에서 라인 번호를 파싱합니다.
 * @returns 시작 라인 번호 (없으면 null)
 */
function parseLineNumber(hash: string): number | null {
  const match = hash.match(LINE_NUMBER_REGEX);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * IDE URI를 구성합니다.
 * 형태: {scheme}://file/{absoluteFilePath}:{lineNumber}
 */
function buildIdeUri(
  ide: SupportedIDE,
  absolutePath: string,
  lineNumber: number | null
): string {
  const scheme = IDE_URI_SCHEMES[ide];
  const encodedPath = absolutePath.split("/").map(encodeURIComponent).join("/");
  const lineFragment = lineNumber ? `:${lineNumber}` : "";
  return `${scheme}://file/${encodedPath}${lineFragment}`;
}

// ============================================================
// 버튼 생성
// ============================================================

/**
 * GitHub PR diff 앵커(#diff-{hash}[LR]{line})에서 라인 번호를 파싱합니다.
 * R(신규 파일 기준)을 우선하고, 없으면 L(원본 기준)을 사용합니다.
 */
function parseLineFromDiffAnchor(href: string): number | null {
  try {
    const hash = new URL(href, window.location.href).hash;
    if (!hash.includes("diff-")) return null;
    const r = hash.match(/R(\d+)/);
    if (r) return parseInt(r[1], 10);
    const l = hash.match(/L(\d+)/);
    if (l) return parseInt(l[1], 10);
    return null;
  } catch {
    return null;
  }
}

/**
 * 리뷰 스레드 또는 파일 헤더 주변 DOM에서 관련 라인 번호를 탐색합니다.
 *
 * 파일 경로 링크의 href는 라인 번호 없이 #diff-{hash} 만 포함하는 경우가 많습니다.
 * 실제 라인 정보는 같은 스레드 내 다른 요소에 있으므로, 링크의 조상을 타고 올라가며
 * 형제 요소들에서 다음 세 가지 방법으로 라인 번호를 탐색합니다.
 *
 *   1. diff 셀 id — id="diff-{hash}R{line}" 또는 "L{line}"
 *   2. data-line-number 속성 — <td data-line-number="240">
 *   3. "Comment on lines N" 텍스트 — GitHub이 스레드에 표시하는 코드 범위 안내 문구
 *   4. 다른 diff anchor 링크의 href — "Comment on lines" 요소가 링크인 경우
 */
function findReviewLineNumber(link: HTMLElement, maxAncestorDepth: number = 12): number | null {
  // 링크 href에 라인 번호가 직접 포함된 경우 (가장 빠른 경로)
  if (link instanceof HTMLAnchorElement) {
    const fromHref = parseLineFromDiffAnchor(link.href);
    if (fromHref !== null) return fromHref;
  }

  // 링크의 조상을 타고 올라가며 형제 서브트리에서 탐색
  let el: Element | null = link.parentElement;
  for (let depth = 0; depth < maxAncestorDepth && el; depth++, el = el.parentElement) {
    for (let i = 0; i < el.children.length; i++) {
      const sibling = el.children[i];
      // 링크 자신을 포함하는 요소는 제외
      if (sibling.contains(link)) continue;

      // 전략 1: id="diff-...R{n}" or "diff-...L{n}" 형태의 요소
      const diffCells = sibling.querySelectorAll<HTMLElement>('[id^="diff-"]');
      for (let j = 0; j < diffCells.length; j++) {
        const cell = diffCells[j];
        const r = cell.id.match(/R(\d+)/);
        if (r) return parseInt(r[1], 10);
        const l = cell.id.match(/L(\d+)/);
        if (l) return parseInt(l[1], 10);
      }

      // 전략 2: data-line-number 속성
      const lineElements = sibling.querySelectorAll<HTMLElement>("[data-line-number]");
      let firstContextLine = 0;
      for (const lineEl of lineElements) {
        const n = parseInt(lineEl.dataset.lineNumber ?? "", 10);
        if (isNaN(n) || n <= 0) continue;

        if (!firstContextLine && !lineEl.classList.contains("empty-diff-line")) {
          firstContextLine = n;
        }

        if ((lineEl.classList.contains("blob-num-addition") ||
          lineEl.classList.contains("blob-num-deletion")) ||
          // PR Preview UX
          (lineEl.classList.contains("new-diff-line-number") &&
            !lineEl.classList.contains("diff-line-number-neutral") &&
            !lineEl.classList.contains("empty-diff-line"))) {
          return n;
        }
      }
      // 변경 라인이 없으면 첫번째 context 라인 반환
      if (firstContextLine > 0) {
        return firstContextLine;
      }

      // 전략 3: "Comment on lines N" / "Comment on line N" 텍스트
      const sibText = sibling.textContent ?? "";
      const textMatch = sibText.match(/[Cc]omment on lines?\s+[+-]?(\d+)/);
      if (textMatch) return parseInt(textMatch[1], 10);

      // 전략 4: 형제 안의 diff anchor 링크 href
      const diffAnchors = sibling.querySelectorAll<HTMLAnchorElement>('a[href*="#diff-"]');
      for (let j = 0; j < diffAnchors.length; j++) {
        const a = diffAnchors[j];
        const line = parseLineFromDiffAnchor(a.href);
        if (line !== null) return line;
      }
    }
  }

  return null;
}

/**
 * "Open in IDE" 버튼 엘리먼트를 생성합니다.
 * @param compact - true이면 아이콘만 표시 (PR diff 뷰용)
 */
function createOpenButton(
  settings: UserSettings,
  absolutePath: string,
  lineNumber: number | null,
  compact: boolean = false
): HTMLAnchorElement {
  const btn = document.createElement("a");
  btn.className = "flex-self-center gdt-open-btn" + (compact ? " gdt-open-btn--compact" : "");
  btn.setAttribute("role", "button");
  btn.setAttribute("aria-label", chrome.i18n.getMessage("btnOpenInIde", [IDE_DISPLAY_NAMES[settings.ide]]));
  btn.setAttribute("title", chrome.i18n.getMessage("tooltipOpenInIde", [IDE_DISPLAY_NAMES[settings.ide], absolutePath]));

  // VS Code 아이콘 (SVG)
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.classList.add("gdt-open-btn-icon");
  icon.innerHTML = `<path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a1 1 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a1 1 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 19.86V4.14a1.5 1.5 0 0 0-.85-1.553zM16.003 16.725 7.55 12l8.453-4.725v9.45z"/>`;

  btn.appendChild(icon);

  // compact 모드가 아닐 때만 텍스트 레이블 표시
  if (!compact) {
    const label = document.createTextNode(chrome.i18n.getMessage("btnOpenInIde", [IDE_DISPLAY_NAMES[settings.ide]]));
    btn.appendChild(label);
  }

  // 라인 번호 배지는 non-compact 모드에서만 표시하며, hash에 라인이 없으면 숨깁니다.
  if (!compact) {
    const badge = document.createElement("span");
    badge.className = "gdt-line-badge";
    btn.appendChild(badge);

    // GitHub 라인 선택은 hash만 바꾸는 경우가 많아 버튼 생성 후에도 배지를 별도로 갱신합니다.
    const applyLineBadge = (nextLineNumber: number | null) => {
      if (nextLineNumber) {
        badge.textContent = `L${nextLineNumber}`;
        badge.hidden = false;
      } else {
        badge.textContent = "";
        badge.hidden = true;
      }
    };

    // 버튼이 GitHub SPA 전환으로 제거되면 콜백도 같이 정리합니다.
    const updateLineBadge = () => {
      if (!btn.isConnected) {
        lineBadgeUpdaters.delete(updateLineBadge);
        return;
      }

      applyLineBadge(parseLineNumber(window.location.hash));
    };

    applyLineBadge(lineNumber);
    lineBadgeUpdaters.add(updateLineBadge);
  }

  // 클릭 이벤트
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    // compact 모드(PR diff 헤더, 코멘트 버튼): 전달받은 lineNumber를 고정 사용
    //   → blob URL에 포함된 #L123 등이 현재 페이지 hash에 덮어써지는 것을 방지
    // 파일 뷰 (non-compact): 현재 URL hash에서 최신 라인 번호를 동적으로 읽음
    const currentLineNumber = compact ? lineNumber : parseLineNumber(window.location.hash);
    const uri = buildIdeUri(settings.ide, absolutePath, currentLineNumber);
    window.location.href = uri;
  });

  return btn;
}

/**
 * 설정이 없을 때 표시하는 경고 버튼을 생성합니다.
 */
function createUnconfiguredButton(compact: boolean = false): HTMLAnchorElement {
  const btn = document.createElement("a");
  btn.className = "gdt-open-btn gdt-unconfigured" + (compact ? " gdt-open-btn--compact" : "");
  btn.setAttribute("role", "button");
  btn.setAttribute("title", chrome.i18n.getMessage("tooltipUnconfigured"));

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.classList.add("gdt-open-btn-icon");
  icon.innerHTML = `<path fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm6.5-.25A.75.75 0 017.25 7h1a.75.75 0 01.75.75v2.75h.25a.75.75 0 010 1.5h-2a.75.75 0 010-1.5h.25v-2h-.25a.75.75 0 01-.75-.75zM8 6a1 1 0 100-2 1 1 0 000 2z"/>`;

  btn.appendChild(icon);
  if (!compact) {
    btn.appendChild(document.createTextNode(chrome.i18n.getMessage("btnConfigureIde")));
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ action: "openPopup" });
  });

  return btn;
}

// ============================================================
// 버튼 삽입 로직
// ============================================================

/**
 * GitHub 파일 뷰의 헤더 액션 바에 버튼을 삽입합니다.
 * 지원: 단일 파일 뷰(blob), Pull Request Files Changed 뷰
 */
async function injectButtons(): Promise<void> {
  const settings = await loadSettings();

  // 0. 레포지토리 메인 / 트리 뷰 상단 - 레포 전체를 IDE에서 열기
  injectIntoRepoView(settings);

  // 1. 트리 뷰(목록) - 각 파일/폴더 행마다 버튼 삽입
  injectIntoFileTreeRows(settings);

  // 2. 일반 파일 뷰 (github.com/user/repo/blob/...) 처리
  injectIntoFileView(settings);

  // 3. PR Files Changed 뷰 - 기존 UX (github.com/.../pull/.../files)
  injectIntoPrFilesView(settings);

  // 4. PR Files Changed 뷰 - Preview UX (Try new experience, /changes)
  injectIntoPrPreviewUx(settings);

  // 5. PR 인라인 리뷰 코멘트 스레드 헤더의 파일 경로 옆에 버튼 삽입
  injectIntoPrReviewThreadHeaders(settings);

}

/**
 * GitHub 레포지토리 메인 페이지(루트) 및 트리 뷰에 "IDE에서 열기" 버튼을 삽입합니다.
 *
 * GitHub 레포 메인 DOM 구조 (현재 React 기반):
 * - 루트(/): <button><span>Code</span></button>
 * - 트리(/tree): <button><span>Add file</span></button>
 *
 * 전략: 내부에 "Code" 또는 "Add file" 텍스트를 가진 버튼을 찾아 바로 앞에 삽입합니다.
 * 클릭 시 열리는 경로: {basePath}/{repo} (레포 전체)
 */
function injectIntoRepoView(settings: UserSettings | null): void {
  // 이미 삽입된 경우 스킵
  if (document.querySelector(`.${REPO_INJECTED_MARKER}`)) return;

  // 레포 루트 또는 트리 뷰인지 확인
  const repoInfo = parseGitHubRepoUrl(window.location.href);
  if (!repoInfo) return;

  // GitHub의 "Code" 버튼 탐색 — 언어 중립 속성 기반 우선, 텍스트 기반 fallback
  // data-testid / data-get-repo-select-menu 는 GitHub 로컬라이제이션과 무관하게 안정적입니다.
  let codeBtn: HTMLElement | null =
    document.querySelector<HTMLElement>(
      '[data-testid="get-repo-button"], [data-get-repo-select-menu]'
    );

  if (!codeBtn) {
    codeBtn =
      Array.from(document.querySelectorAll<HTMLElement>("button, summary")).find(
        (el) => el.textContent?.trim() === "Code"
      ) ?? null;
  }

  if (!codeBtn) return;

  // summary 요소이면 부모 <details> 기준으로 삽입 위치 결정
  const insertTarget = codeBtn.tagName === "SUMMARY"
    ? (codeBtn.closest("details") ?? codeBtn)
    : codeBtn;
  if (!insertTarget.parentElement) return;

  let btn: HTMLAnchorElement;
  if (settings && settings.basePath) {
    const absolutePath = `${settings.basePath}/${repoInfo.repo}`;
    btn = createOpenButton(settings, absolutePath, null, true);
  } else {
    btn = createUnconfiguredButton(true);
  }

  btn.classList.add(REPO_INJECTED_MARKER);

  // "Code" 버튼 바로 앞에 삽입 → [Add file] [우리 버튼] [Code] 순서 유지
  insertTarget.parentElement.insertBefore(btn, insertTarget);
}

/**
 * 트리 뷰의 파일 목록(목록 뷰)에서 각 파일/폴더 행 우측이나 파일명 옆에 IDE 열기 버튼을 삽입합니다.
 *
 * 클래스명 기반 셀렉터 대신 href 기반으로 파일/폴더 링크를 직접 탐색하여
 * GitHub UI 변경에 강인하게 동작합니다.
 */
function injectIntoFileTreeRows(settings: UserSettings | null): void {
  // 트리/루트 뷰에서만 실행 — blob, PR, issues 등 다른 페이지에서는 스킵
  // blob 페이지의 README나 사이드바 링크가 잘못 매칭되는 것을 방지합니다.
  if (!parseGitHubRepoUrl(window.location.href)) return;

  const pageInfo = parseGitHubUrl(window.location.href);
  if (!pageInfo) return;

  // 현재 레포의 파일/폴더 링크를 href 기반으로 탐색 (클래스명 불필요)
  const ownerRepo = `/${pageInfo.owner}/${pageInfo.repo}/`;
  // 파일(blob)만 대상 — 폴더(tree)는 제외
  const fileLinks = document.querySelectorAll<HTMLAnchorElement>(
    `a[href^="${ownerRepo}blob/"]`
  );

  fileLinks.forEach((titleLink) => {
    // 이미 버튼이 삽입됐으면 스킵
    if (titleLink.nextElementSibling?.classList.contains(TREE_ROW_INJECTED_MARKER)) return;

    const itemName = titleLink.getAttribute("title") || titleLink.textContent?.trim();
    if (!itemName || itemName === "Go to parent directory" || itemName === "..") return;

    // <tr> 조상이 없으면 파일 트리 행이 아님 (breadcrumb, README 내 링크 등 제외)
    if (!titleLink.closest("tr, [role='row']")) return;

    const rowFilePath = pageInfo.filePath ? `${pageInfo.filePath}/${itemName}` : itemName;
    const absolutePath = settings?.basePath ? `${settings.basePath}/${pageInfo.repo}/${rowFilePath}` : "";

    let btn: HTMLAnchorElement;
    if (settings && settings.basePath) {
      btn = createOpenButton(settings, absolutePath, null, true);
    } else {
      btn = createUnconfiguredButton(true);
    }

    btn.classList.add(TREE_ROW_INJECTED_MARKER);
    titleLink.insertAdjacentElement("afterend", btn);
  });
}

/**
 * 일반 파일 뷰 (`/blob/...`)에 버튼을 삽입하는 함수.
 *
 * GitHub 현재 blob 뷰 DOM 구조 (BlobViewHeader React 모듈 기반):
 * <div class="BlobViewHeader-module__headerWrapper__*">
 *   <div class="d-flex flex-justify-between">
 *     <div> ... 파일 경로 breadcrumb ... </div>
 *     <div> ... (중앙) ... </div>
 *     <div class="d-flex flex-items-center">  ← 우측 버튼 그룹
 *       <div class="d-flex flex-items-center">  ← Raw/Copy 버튼 묶음
 *         <a href=".../raw/...">Raw</a>       ← 이 기준으로 삽입 위치 결정
 *         <button>Copy</button>
 *       </div>
 *       <a>Edit</a>
 *       ...
 *     </div>
 *   </div>
 * </div>
 *
 * 전략: `a[href*="/raw/"]` 링크를 찾아 그 부모 그룹(Raw+Copy 묶음) 앞에 삽입.
 */
function injectIntoFileView(settings: UserSettings | null): void {
  // 이미 삽입된 경우 스킵
  if (document.querySelector(`.${INJECTED_MARKER}`)) return;

  // blob 페이지가 아니면 종료
  const urlInfo = parseGitHubUrl(window.location.href);
  // tree, raw 등은 제외하고 오직 blob일 때만 진행
  if (!urlInfo || !urlInfo.filePath || !window.location.pathname.includes('/blob/')) return;

  // Raw 링크를 기준으로 삽입 위치 결정 (구버전/신버전 모두 href에 /raw/ 포함)
  const rawLink = document.querySelector<HTMLElement>('a[href*="/raw/"]');
  if (!rawLink) return;

  const lineNumber = parseLineNumber(window.location.hash);

  let btn: HTMLAnchorElement;
  if (settings && settings.basePath) {
    const absolutePath = `${settings.basePath}/${urlInfo.repo}/${urlInfo.filePath}`;
    btn = createOpenButton(settings, absolutePath, lineNumber);
  } else {
    btn = createUnconfiguredButton();
  }

  btn.classList.add(INJECTED_MARKER);

  // 확장 기능 버튼이 GitHub 네이티브 Raw/Copy 그룹과 섞이지 않도록 액션 영역 앞쪽에 분리 삽입합니다.
  const rawGroup = rawLink.parentElement;      // Raw+Copy 묶음 div
  const buttonsContainer = rawGroup?.parentElement; // GitHub 네이티브 버튼 컨테이너
  const actions = buttonsContainer?.parentElement; // blob 헤더 액션 영역

  if (actions && buttonsContainer) {
    actions.insertBefore(btn, buttonsContainer);
  } else if (rawGroup) {
    rawGroup.insertBefore(btn, rawLink);
  }
}


/**
 * PR Files Changed 뷰 (`/pull/.../files` 또는 `/pull/.../changes`)에서
 * 각 파일 헤더마다 버튼을 삽입합니다.
 *
 * GitHub PR diff 파일 헤더 구조:
 * <div class="file-header" data-path="src/foo.ts">
 *   <div class="file-info"> ← 파일명/경로 표시 영역
 *     <span class="filename">...</span>
 *   </div>
 *   <div class="file-actions"> ← 우측 액션 버튼 영역
 *     <span class="show-file-notes-count">...</span>
 *     <a href="...">View file</a>   ← 이 앞에 버튼 삽입
 *     <label>Viewed</label>
 *     <details class="dropdown">...</details>  ← ... 메뉴
 *   </div>
 * </div>
 */
function injectIntoPrFilesView(settings: UserSettings | null): void {
  // PR Files Changed 페이지인지 확인
  const isPrFilesPage = /\/pull\/\d+\/(files|changes)/.test(window.location.pathname);
  if (!isPrFilesPage) return;

  const prInfo = parseGitHubPrUrl(window.location.href);
  if (!prInfo) return;

  // data-path 속성을 가진 모든 파일 헤더 탐색
  const fileHeaders = document.querySelectorAll<HTMLElement>(
    ".file-header[data-path], .js-file-header[data-path]"
  );

  fileHeaders.forEach((header) => {
    // 이미 이 헤더에 버튼이 삽입된 경우 건너뜀 (헤더 자체에서 확인)
    if (header.querySelector(`.${INJECTED_MARKER}`)) return;

    // .file-actions: 우측 버튼 영역
    const fileActions = header.querySelector<HTMLElement>(".file-actions");
    if (!fileActions) return;

    // data-path에서 파일 경로 추출
    const filePath = header.getAttribute("data-path");
    if (!filePath) return;

    let btn: HTMLAnchorElement;
    if (settings && settings.basePath) {
      const absolutePath = `${settings.basePath}/${prInfo.repo}/${filePath}`;
      btn = createOpenButton(settings, absolutePath, null, true);
    } else {
      btn = createUnconfiguredButton(true);
    }

    btn.classList.add(INJECTED_MARKER);

    // GitHub의 .file-actions 구조 (로그인 시):
    // <div class="file-actions ...">
    //   <div class="d-flex flex-justify-end">   ← 실제 버튼들이 있는 내부 래퍼
    //     <a href="...">View file</a>
    //     <label>Viewed</label>
    //     <button> 댓글 </button>
    //     <details> ... 메뉴 </details>
    //   </div>
    // </div>
    //
    // 버튼을 .file-actions에 직접 넣으면 래퍼 밖으로 나와 레이아웃이 깨집니다.
    // 내부 flex 컨테이너를 찾아서 그 안의 첫 번째 자식 앞에 삽입합니다.

    // 내부 flex 래퍼 탐색 우선순위:
    // 1. .d-flex 자식 div (GitHub의 버튼 그룹)
    // 2. fileActions 직접 자식 div
    // 3. fileActions 자체 (fallback)
    const innerContainer: HTMLElement =
      fileActions.querySelector<HTMLElement>(":scope > div") ??
      fileActions;

    // insertBefore 기준 노드: innerContainer의 첫 번째 직접 자식
    const firstChild = innerContainer.firstElementChild as HTMLElement | null;
    if (firstChild) {
      innerContainer.insertBefore(btn, firstChild);
    } else {
      innerContainer.appendChild(btn);
    }
  });
}

/**
 * GitHub Preview UX (신 경험 / "Try new experience" React 기반 UI) 지원.
 * `/pull/.../changes` 또는 신규 UX로 설정된 `/pull/.../files` 페이지 대응.
 *
 * Preview UX 헤더 DOM 구조:
 * <div class="DiffFileHeader-module__header-row__*">   ← 전체 헤더 행
 *   <div>  ← 좌측: expand 버튼 그룹
 *     <button aria-label="Expand all lines: src/foo.ts">...</button>
 *   </div>
 *   <div>  ← 중앙: 파일명/경로
 *   </div>
 *   <div>  ← 우측: 액션 버튼 그룹 (마지막 자식)
 *     <span> diff stats </span>
 *     <button> Viewed </button>
 *     <button> Comment </button>
 *     <details> ... 메뉴 </details>
 *   </div>
 * </div>
 *
 * 전략: expandBtn → 부모 체인을 타고 헤더 행 root를 찾은 뒤,
 *       그 lastElementChild (우측 액션 그룹)의 첫 번째 자식 앞에 삽입.
 */
function injectIntoPrPreviewUx(settings: UserSettings | null): void {
  // PR 페이지인지 확인
  const isPrPage = /\/pull\/\d+/.test(window.location.pathname);
  if (!isPrPage) return;

  const prInfo = parseGitHubPrUrl(window.location.href);
  if (!prInfo) return;

  // 헤더 탐색: expand 버튼 경유 + 클래스 직접 탐색 (하이픈/언더스코어 두 형태 모두 지원)
  const headerRowSet = new Set<HTMLElement>();
  const HEADER_SELECTOR =
    '[class*="diff-file-header"], [class*="diff_file_header"], [class*="DiffFileHeader"]';

  document.querySelectorAll<HTMLElement>(
    'button[aria-label^="Expand all lines:"], button[aria-label^="Collapse all lines:"]'
  ).forEach((btn) => {
    const h = btn.closest<HTMLElement>(HEADER_SELECTOR);
    if (h) headerRowSet.add(h);
  });

  document.querySelectorAll<HTMLElement>(HEADER_SELECTOR).forEach((el) => {
    // 같은 패턴의 조상이 없는 최상위 헤더만 수집
    if (!el.parentElement?.closest(HEADER_SELECTOR)) {
      headerRowSet.add(el);
    }
  });

  if (headerRowSet.size === 0) return;

  headerRowSet.forEach((headerRow) => {
    if (headerRow.querySelector(`.${INJECTED_MARKER}`)) return;

    // 파일 경로 추출 전략:
    // 1순위: expand/collapse 버튼 aria-label
    // 2순위: 헤더 내 Link--primary 앵커 텍스트 (파일명 전체 경로 포함)
    let filePath: string | null = null;

    const expandBtn = headerRow.querySelector<HTMLElement>(
      'button[aria-label^="Expand all lines:"], button[aria-label^="Collapse all lines:"]'
    );
    if (expandBtn) {
      const ariaLabel = expandBtn.getAttribute("aria-label") ?? "";
      filePath = ariaLabel.replace(/^(?:Expand|Collapse) all lines:\s*/, "").trim() || null;
    }

    if (!filePath) {
      // a.Link--primary 텍스트에 전체 파일 경로가 담겨 있음
      const fileLink = headerRow.querySelector<HTMLAnchorElement>("a.Link--primary");
      const text = fileLink?.textContent?.trim();
      if (text && (text.includes("/") || /\.\w+$/.test(text))) {
        filePath = text;
      }
    }

    if (!filePath) return;

    const actionsGroup = headerRow.lastElementChild as HTMLElement | null;
    if (!actionsGroup) return;

    // Preview UX 파일 헤더에서는 현재 파일 컨테이너 범위까지만 탐색해
    // 인접 파일의 라인 번호를 잘못 가져오지 않도록 제한합니다.
    const lineNumber = findReviewLineNumber(headerRow, 1);

    let btn: HTMLAnchorElement;
    if (settings && settings.basePath) {
      const absolutePath = `${settings.basePath}/${prInfo.repo}/${filePath}`;
      btn = createOpenButton(settings, absolutePath, lineNumber, true);
    } else {
      btn = createUnconfiguredButton(true);
    }

    btn.classList.add(INJECTED_MARKER);

    const firstActionChild = actionsGroup.firstElementChild as HTMLElement | null;
    if (firstActionChild) {
      actionsGroup.insertBefore(btn, firstActionChild);
    } else {
      actionsGroup.appendChild(btn);
    }
  });
}

/**
 * PR 인라인 리뷰 코멘트 스레드 헤더의 파일 경로 옆에 "IDE에서 열기" 버튼을 삽입합니다.
 *
 * GitHub 리뷰 스레드 헤더 링크의 특징:
 *   - href에 #diff- 앵커 포함 (PR diff 위치 지시자)
 *   - 텍스트 내용이 파일 경로 형태 (슬래시 포함, 공백 없음)
 *   - 코멘트 본문 / 파일 헤더 내부가 아닌 위치
 *
 * GitHub는 UI 버전에 따라 다른 클래스명을 사용하므로 클래스 대신
 * href 패턴과 텍스트 내용으로 파일 경로 링크를 식별합니다.
 *
 * 탐색 전략 (우선순위 순):
 *   1. summary div span a[href*="#diff-"] — PR diff anchor 링크 (가장 신뢰성 높음)
 *   2. .review-thread-header a          — 구버전 클래식 UI
 *   3. [class*="review-thread"] a       — CSS 모듈 변형 클래스
 *   4. .js-resolvable-thread-contents a — 클래식 UI 스레드 컨테이너
 */
function injectIntoPrReviewThreadHeaders(settings: UserSettings | null): void {
  if (!/\/pull\/\d+/.test(window.location.pathname)) return;

  const prInfo = parseGitHubPrUrl(window.location.href);
  if (!prInfo) return;

  // 여러 선택자 전략을 한 번에 병합해 후보 링크 수집
  const candidateLinks = document.querySelectorAll<HTMLAnchorElement>(
    [
      'summary div span a[href*="#diff-"]',
      ".review-thread-header a",
      "[class*='review-thread'] a",
      ".js-resolvable-thread-contents > * > a",
      ".js-resolvable-thread-contents > * > * > a",
    ].join(", ")
  );

  // 버튼을 삽입하면 안 되는 영역 (코멘트 본문, 기존 파일 헤더 등)
  const excludeSelector = [
    ".comment-body", ".js-comment-body",
    ".markdown-body", "[class*='markdown-body']",
    ".file-header", ".js-file-header", "[class*='diff-file-header']", "[class*='diff_file_header']", "[class*='DiffFileHeader']",
    "nav", ".breadcrumb", "#repository-container-header",
  ].join(", ");

  candidateLinks.forEach((link) => {
    const text = detectFilePath(link.textContent?.trim() ?? "");

    // 파일 경로가 아니면 건너뜀
    if (!text) return;

    // 제외 영역 안이면 건너뜀
    if (link.closest(excludeSelector)) return;

    // 이미 처리된 링크 건너뜀
    if (link.dataset.gdtProcessed) return;
    link.dataset.gdtProcessed = "true";

    // 코멘트가 달린 라인 번호 탐색 (링크 href → DOM 상향 순회 순서로 시도)
    const lineNumber = findReviewLineNumber(link);

    let btn: HTMLAnchorElement;
    if (settings && settings.basePath) {
      const absolutePath = `${settings.basePath}/${prInfo.repo}/${text}`;
      btn = createOpenButton(settings, absolutePath, lineNumber, true);
    } else {
      btn = createUnconfiguredButton(true);
    }
    btn.classList.add(INJECTED_MARKER, "gdt-comment-btn");

    // 삽입 위치 결정:
    // - 링크 다음 형제가 "Outdated" 뱃지면 그 뒤에 삽입 (뱃지와 버튼이 붙어 있게)
    // - 없으면 링크 바로 뒤에 삽입
    let anchor: Element = link;
    const nextEl = link.nextElementSibling;
    if (nextEl && /^outdated$/i.test(nextEl.textContent?.trim() ?? "")) {
      anchor = nextEl;
    }
    anchor.insertAdjacentElement("afterend", btn);
  });
}

// ============================================================
// 설정 조회
// ============================================================

/**
 * chrome.storage.sync에서 사용자 설정을 불러옵니다.
 */
async function loadSettings(): Promise<UserSettings | null> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["ide", "basePath"], (result) => {
      if (result.ide && result.basePath) {
        resolve({
          ide: result.ide as SupportedIDE,
          basePath: result.basePath as string,
        });
      } else {
        resolve(null);
      }
    });
  });
}

// ============================================================
// MutationObserver: GitHub SPA 및 지연 로딩 대응
// ============================================================

/** GitHub의 동적 페이지 전환을 감지하기 위한 옵저버 */
let observer: MutationObserver | null = null;

/**
 * DOM 변경을 감지하여 새로운 파일 뷰/diff를 감지하면 버튼을 삽입합니다.
 * PR Files Changed 페이지는 스크롤 시 파일을 지연 로딩(lazy loading)하므로
 * MutationObserver가 핵심 역할을 합니다.
 */
function startObserver(): void {
  if (observer) observer.disconnect();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      syncLineBadges();
      injectButtons();
    }, 300);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ============================================================
// 초기화
// ============================================================

/**
 * 확장 프로그램 콘텐츠 스크립트 진입점
 */
function init(): void {
  // 초기 로드 시 삽입 시도
  injectButtons();

  window.addEventListener("hashchange", syncLineBadges);
  window.addEventListener("popstate", syncLineBadges);

  // GitHub SPA 네비게이션 대응을 위한 MutationObserver 시작
  startObserver();

  // GitHub의 Turbo 내비게이션 이벤트 대응
  document.addEventListener("turbo:load", () => {
    syncLineBadges();
    injectButtons();
  });
}

init();
