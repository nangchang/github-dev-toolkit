/**
 * GitHub Dev Toolkit - 백그라운드 서비스 워커
 * 확장 프로그램 생명주기 및 메시지 처리를 담당합니다.
 */

/** 확장 프로그램 설치/업데이트 시 실행 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("[GitHub Dev Toolkit] 확장 프로그램이 설치되었습니다. 팝업에서 설정을 완료해주세요.");
    // 첫 설치 시 설정을 유도하되, 브라우저 정책상 popup 열기가 막힐 수 있어 실패는 조용히 무시합니다.
    chrome.action.openPopup().catch(() => {
      // openPopup은 일부 환경에서 지원하지 않을 수 있음
    });
  } else if (details.reason === "update") {
    console.log(`[GitHub Dev Toolkit] v${chrome.runtime.getManifest().version}으로 업데이트되었습니다.`);
  }
});

/** 콘텐츠 스크립트로부터 메시지를 수신합니다 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "openPopup") {
    // GitHub 페이지 안의 "IDE 설정하기" 버튼은 popup DOM에 직접 접근할 수 없어 background를 경유합니다.
    chrome.action.openPopup().catch(console.error);
    sendResponse({ success: true });
  }
  return true;
});
