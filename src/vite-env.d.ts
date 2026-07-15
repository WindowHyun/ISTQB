/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

// Android WebView(APK) 네이티브 백업 브리지 — MainActivity의 BackupBridge가
// addJavascriptInterface(..., "AndroidBackup")로 주입한다. 웹에서는 undefined.
interface AndroidBackupBridge {
  // JSON 문자열 반환: { ok, fileName, location, error }
  saveBackup(fileName: string, payload: string): string;
}
interface Window {
  AndroidBackup?: AndroidBackupBridge;
}
