/** background 메시지 라우팅에서 사용하는 popup 오픈 액션 식별자 */
export const OPEN_POPUP_ACTION = "openPopup";

/** 설치/업데이트 이벤트 reason에 따라 남길 로그 메시지를 반환합니다. */
export function getInstallLogMessage(
  reason: chrome.runtime.OnInstalledReason,
  version: string
): string | null {
  if (reason === "install") {
    return "[GitHub Dev Toolkit] 확장 프로그램이 설치되었습니다. 팝업에서 설정을 완료해주세요.";
  }

  if (reason === "update") {
    return `[GitHub Dev Toolkit] v${version}으로 업데이트되었습니다.`;
  }

  return null;
}

/** 첫 설치 시에만 설정 유도를 위해 popup 오픈을 시도합니다. */
export function shouldOpenPopupOnInstall(
  reason: chrome.runtime.OnInstalledReason
): boolean {
  return reason === "install";
}

/** runtime 메시지가 popup 오픈 요청인지 안전하게 판별합니다. */
export function isOpenPopupRequest(message: unknown): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }

  const action = (message as { action?: unknown }).action;
  return action === OPEN_POPUP_ACTION;
}
