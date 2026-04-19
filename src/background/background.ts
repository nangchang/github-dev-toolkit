/**
 * GitHub Dev Toolkit - 백그라운드 서비스 워커
 * 확장 프로그램 생명주기 및 메시지 처리를 담당합니다.
 */
import {
  getInstallLogMessage,
  isOpenPopupRequest,
  shouldOpenPopupOnInstall,
} from "./background-utils";

/** 확장 프로그램 설치/업데이트 시 실행 */
chrome.runtime.onInstalled.addListener((details) => {
  const logMessage = getInstallLogMessage(details.reason, chrome.runtime.getManifest().version);
  if (logMessage) {
    console.log(logMessage);
  }

  if (shouldOpenPopupOnInstall(details.reason)) {
    // 첫 설치 시 설정을 유도하되, 브라우저 정책상 popup 열기가 막힐 수 있어 실패는 조용히 무시합니다.
    chrome.action.openPopup().catch(() => {
      // openPopup은 일부 환경에서 지원하지 않을 수 있음
    });
  }
});

/** 콘텐츠 스크립트로부터 메시지를 수신합니다 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isOpenPopupRequest(message)) {
    // GitHub 페이지 안의 "IDE 설정하기" 버튼은 popup DOM에 직접 접근할 수 없어 background를 경유합니다.
    chrome.action.openPopup().catch(console.error);
    sendResponse({ success: true });
  }
  return true;
});
