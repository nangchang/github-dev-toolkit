export type BasePathValidationError = "empty" | "must-start-with-slash";

/** 저장 시 사용할 basePath를 정규화합니다. */
export function normalizeBasePath(basePath: string): string {
  return basePath.trim().replace(/\/$/, "");
}

/** basePath 입력값 유효성을 검사합니다. */
export function validateBasePath(basePath: string): BasePathValidationError | null {
  const normalized = basePath.trim();
  if (!normalized) {
    return "empty";
  }

  if (!normalized.startsWith("/")) {
    return "must-start-with-slash";
  }

  return null;
}
