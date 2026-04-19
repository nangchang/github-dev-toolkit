const test = require("node:test");
const assert = require("node:assert/strict");

const {
  OPEN_POPUP_ACTION,
  getInstallLogMessage,
  isOpenPopupRequest,
  shouldOpenPopupOnInstall,
} = require("../.test-dist/background/background-utils.js");

test("getInstallLogMessage: install/update만 메시지 반환", () => {
  assert.equal(
    getInstallLogMessage("install", "0.5.1"),
    "[GitHub Dev Toolkit] 확장 프로그램이 설치되었습니다. 팝업에서 설정을 완료해주세요."
  );
  assert.equal(
    getInstallLogMessage("update", "0.5.1"),
    "[GitHub Dev Toolkit] v0.5.1으로 업데이트되었습니다."
  );
  assert.equal(getInstallLogMessage("chrome_update", "0.5.1"), null);
});

test("shouldOpenPopupOnInstall: install에서만 true", () => {
  assert.equal(shouldOpenPopupOnInstall("install"), true);
  assert.equal(shouldOpenPopupOnInstall("update"), false);
  assert.equal(shouldOpenPopupOnInstall("shared_module_update"), false);
});

test("isOpenPopupRequest: 런타임 메시지 형태 확인", () => {
  assert.equal(isOpenPopupRequest({ action: OPEN_POPUP_ACTION }), true);
  assert.equal(isOpenPopupRequest({ action: "noop" }), false);
  assert.equal(isOpenPopupRequest({}), false);
  assert.equal(isOpenPopupRequest(null), false);
  assert.equal(isOpenPopupRequest("openPopup"), false);
});
