import { SupportedIDE, UserSettings, IDE_URI_SCHEMES } from "../types";

// --- DOM 요소 참조 ---
// popup.html 하단에서 스크립트를 로드하므로 여기서는 요소가 이미 존재한다고 가정합니다.
const ideSelect = document.getElementById("ide-select") as HTMLSelectElement;
const basePathInput = document.getElementById("base-path-input") as HTMLInputElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const saveBtnText = document.getElementById("save-btn-text") as HTMLSpanElement;
const statusMsg = document.getElementById("status-msg") as HTMLDivElement;

let statusTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * [data-i18n] 속성을 가진 모든 요소에 chrome.i18n.getMessage()로 텍스트를 채웁니다.
 * SVG 등 자식 요소가 있는 경우 textContent 대신 텍스트 노드를 append합니다.
 */
function applyI18n(): void {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n")!;
    const message = chrome.i18n.getMessage(key);
    if (!message) return;
    if (el.children.length > 0) {
      // SVG 등 자식 요소 보존, 기존 텍스트 노드만 교체
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .forEach((n) => n.parentNode?.removeChild(n));
      el.appendChild(document.createTextNode(` ${message}`));
    } else {
      el.textContent = message;
    }
  });
}

/**
 * chrome.storage.sync에서 사용자 설정을 불러와 UI에 반영합니다.
 * sync storage를 사용해 같은 Chrome 프로필의 여러 브라우저에서 설정을 공유합니다.
 */
async function loadSettings(): Promise<void> {
  const result = await chrome.storage.sync.get(["ide", "basePath"]);
  if (result.ide) {
    ideSelect.value = result.ide as SupportedIDE;
  }
  if (result.basePath) {
    basePathInput.value = result.basePath as string;
  }
}

/**
 * 현재 UI 입력값을 chrome.storage.sync에 저장합니다.
 * content script는 이 값을 기준으로 `{basePath}/{repo}/{filePath}` 형태의 로컬 경로를 만듭니다.
 */
async function saveSettings(): Promise<void> {
  const basePath = basePathInput.value.trim();

  // 기본 경로 유효성 검사
  if (!basePath) {
    showStatus(chrome.i18n.getMessage("errorEmptyPath"), "error");
    basePathInput.focus();
    return;
  }

  if (!basePath.startsWith("/")) {
    showStatus(chrome.i18n.getMessage("errorInvalidPath"), "error");
    basePathInput.focus();
    return;
  }

  const settings: UserSettings = {
    ide: ideSelect.value as SupportedIDE,
    // content script에서 repo/filePath를 이어 붙일 때 중복 slash가 생기지 않게 정규화합니다.
    basePath: basePath.replace(/\/$/, ""),
  };

  await chrome.storage.sync.set(settings);

  // 버튼 성공 상태 피드백
  saveBtn.classList.add("success");
  saveBtnText.textContent = chrome.i18n.getMessage("btnSaved");
  showStatus(chrome.i18n.getMessage("statusSaved", [IDE_URI_SCHEMES[settings.ide]]), "success");

  setTimeout(() => {
    saveBtn.classList.remove("success");
    saveBtnText.textContent = chrome.i18n.getMessage("btnSave");
  }, 2000);
}

/**
 * 상태 메시지를 일정 시간 표시 후 숨깁니다.
 * 이전 타이머를 지워 빠르게 여러 번 저장해도 마지막 메시지 기준으로 사라지게 합니다.
 */
function showStatus(message: string, type: "success" | "error"): void {
  if (statusTimer) clearTimeout(statusTimer);

  statusMsg.textContent = message;
  statusMsg.className = `status-msg visible is-${type}`;

  statusTimer = setTimeout(() => {
    statusMsg.classList.remove("visible");
  }, 3000);
}

// --- 이벤트 리스너 ---
saveBtn.addEventListener("click", saveSettings);

// Enter 키로 저장 지원
basePathInput.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Enter") saveSettings();
});

// 초기 로드
document.addEventListener("DOMContentLoaded", () => {
  applyI18n();
  loadSettings();
});
