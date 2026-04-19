/** 지원하는 IDE 및 해당 URI 스킴 정의 */
export type SupportedIDE =
  | "vscode"
  | "vscode-insiders"
  | "vscodium"
  | "cursor"
  | "windsurf";

/** 댓글 번역 대상 언어 설정 */
export const TRANSLATION_TARGET_LANGUAGES = ["browser", "ko", "en"] as const;
export type TranslationTargetLanguage = typeof TRANSLATION_TARGET_LANGUAGES[number];

/** chrome.storage 등 외부 입력값이 지원하는 번역 대상 언어인지 확인합니다. */
export function isTranslationTargetLanguage(value: string): value is TranslationTargetLanguage {
  return (TRANSLATION_TARGET_LANGUAGES as readonly string[]).includes(value);
}

/** popup에서 chrome.storage에 저장/조회하는 사용자 설정 */
export interface UserSettings {
  /** 사용자가 선택한 IDE */
  ide: SupportedIDE;
  /** 레포지토리들이 클론된 부모 폴더 경로 (예: /Volumes/data/Github 또는 /Users/me/Github) */
  basePath: string;
  /** GitHub 댓글 번역 대상 언어 */
  targetLanguage?: TranslationTargetLanguage;
}

/** IDE에 대응하는 URI 스킴 맵. buildIdeUri에서 `{scheme}://file/...` 형태로 사용합니다. */
export const IDE_URI_SCHEMES: Record<SupportedIDE, string> = {
  vscode: "vscode",
  "vscode-insiders": "vscode-insiders",
  vscodium: "vscodium",
  cursor: "cursor",
  windsurf: "windsurf",
};

/** IDE 표시 이름 맵 */
export const IDE_DISPLAY_NAMES: Record<SupportedIDE, string> = {
  vscode: "VS Code",
  "vscode-insiders": "VS Code Insiders",
  vscodium: "VSCodium",
  cursor: "Cursor",
  windsurf: "Windsurf",
};
