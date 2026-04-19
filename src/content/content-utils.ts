import { IDE_URI_SCHEMES, SupportedIDE } from "../types";

/** URL 경로 세그먼트를 디코딩합니다. 잘못된 퍼센트 인코딩은 원문을 유지합니다. */
export function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** pathname을 디코딩된 세그먼트 배열로 변환합니다. */
export function getDecodedPathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map(decodePathSegment);
}

/** 빈 세그먼트를 제거한 파일 경로 배열로 변환합니다. */
export function splitFilePath(filePath: string): string[] {
  return filePath.split("/").filter(Boolean);
}

/**
 * DOM/JSON에서 읽은 파일 경로 후보를 정규화합니다.
 * URL, 개행 문자열, 빈 문자열은 파일 경로로 취급하지 않습니다.
 */
export function normalizeFilePathCandidate(value: string): string | null {
  const trimmed = value.trim().replace(/^\/+/, "");
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.includes("\n")) {
    return null;
  }

  return splitFilePath(trimmed).map(decodePathSegment).join("/");
}

/** tail 세그먼트 끝부분이 filePath와 동일한지 확인합니다. */
export function isTailFilePath(tailSegments: string[], filePath: string): boolean {
  const fileSegments = splitFilePath(filePath);
  if (fileSegments.length === 0 || fileSegments.length >= tailSegments.length) {
    return false;
  }

  const tailFileSegments = tailSegments.slice(-fileSegments.length);
  return fileSegments.every((segment, index) => segment === tailFileSegments[index]);
}

/**
 * 텍스트가 파일 경로처럼 보이는지 판별합니다.
 * 단일 파일명(package.json)과 하위 경로(src/app.ts)를 모두 허용합니다.
 */
export function detectFilePath(text: string): string | null {
  if (!text || text.length > 300 || text.includes("\n") || /\s/.test(text)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.startsWith("@")) return null;
  if (!text.includes("/") && !text.includes(".")) return null;
  if (!/^[a-zA-Z0-9._\-/]+$/.test(text)) return null;

  const lastSegment = text.split("/").filter(Boolean).pop() ?? "";
  if (!/\.[a-zA-Z0-9]{1,10}$/.test(lastSegment)) return null;

  return normalizeFilePathCandidate(text);
}

/** 레포 루트 또는 tree URL에서 owner/repo를 추출합니다. */
export function parseGitHubRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const { pathname } = new URL(url);
    const segments = getDecodedPathSegments(pathname);
    if (segments.length < 2) return null;

    const [owner, repo, kind] = segments;
    if (segments.length === 2 || kind === "tree") {
      return { owner, repo };
    }
    return null;
  } catch {
    return null;
  }
}

/** PR URL에서 owner/repo를 추출합니다. */
export function parseGitHubPrUrl(url: string): { owner: string; repo: string } | null {
  try {
    const urlObj = new URL(url);
    const match = urlObj.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/\d+/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  } catch {
    return null;
  }
}

const LINE_NUMBER_REGEX = /#L(\d+)(?:-L(\d+))?$/;

/** hash(#L10, #L10-L20)에서 시작 라인 번호를 추출합니다. */
export function parseLineNumber(hash: string): number | null {
  const match = hash.match(LINE_NUMBER_REGEX);
  return match ? parseInt(match[1], 10) : null;
}

/** IDE deep link URI를 생성합니다. */
export function buildIdeUri(
  ide: SupportedIDE,
  absolutePath: string,
  lineNumber: number | null
): string {
  const scheme = IDE_URI_SCHEMES[ide];
  const encodedPath = absolutePath.split("/").map(encodeURIComponent).join("/");
  const lineFragment = lineNumber ? `:${lineNumber}` : "";
  return `${scheme}://file/${encodedPath}${lineFragment}`;
}

/** BCP-47 언어 태그를 기본 언어 코드로 정규화합니다. */
export function normalizeLanguageCode(language: string | undefined): string | null {
  if (!language) return null;

  const normalized = language.toLowerCase().split("-")[0];
  return normalized || null;
}

const UNKNOWN_LANGUAGE_CODES = new Set(["und", "unknown"]);
const DEFAULT_SOURCE_LANGUAGE = "en";

/** detector 결과에서 신뢰 가능한 소스 언어 코드만 반환합니다. */
export function normalizeDetectedLanguageCode(language: string | undefined): string | null {
  const normalized = normalizeLanguageCode(language);
  if (!normalized || UNKNOWN_LANGUAGE_CODES.has(normalized)) return null;

  return normalized;
}

/** 한글 패턴을 우선 사용해 리뷰 댓글 소스 언어를 보정합니다. */
export function inferCommentLanguage(
  text: string,
  detectedLanguage: string | undefined
): string {
  const detected = normalizeDetectedLanguageCode(detectedLanguage);
  const hangulCount = (text.match(/[\uac00-\ud7af]/g) ?? []).length;

  if (hangulCount >= 2) return "ko";
  return detected ?? DEFAULT_SOURCE_LANGUAGE;
}
