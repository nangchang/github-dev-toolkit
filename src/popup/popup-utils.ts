export type BasePathValidationError = "empty" | "must-start-with-slash";

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:\//;

function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, "/");
}

/** 저장 시 사용할 basePath를 정규화합니다. */
export function normalizeBasePath(basePath: string): string {
  const normalized = normalizePathSeparators(basePath.trim());

  if (normalized === "/" || WINDOWS_ABSOLUTE_PATH_REGEX.test(normalized) && normalized.length === 3) {
    return normalized;
  }

  return normalized.replace(/\/$/, "");
}

/** basePath 입력값 유효성을 검사합니다. */
export function validateBasePath(basePath: string): BasePathValidationError | null {
  const normalized = basePath.trim();
  if (!normalized) {
    return "empty";
  }

  const normalizedPath = normalizePathSeparators(normalized);
  const isUnixAbsolute = normalizedPath.startsWith("/");
  const isWindowsAbsolute = WINDOWS_ABSOLUTE_PATH_REGEX.test(normalizedPath);

  if (!isUnixAbsolute && !isWindowsAbsolute) {
    return "must-start-with-slash";
  }

  return null;
}
