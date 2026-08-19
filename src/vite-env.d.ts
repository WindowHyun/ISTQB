/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

// Android WebView(APK) 네이티브 백업 브리지 — MainActivity의 BackupBridge가
// addJavascriptInterface(..., "AndroidBackup")로 주입한다. 웹에서는 undefined.
interface AndroidBackupBridge {
  // JSON 문자열 반환: { ok, fileName, location, error }
  saveBackup(fileName: string, payload: string): string;
}

// APK 시스템 바(상태바·내비게이션 바) 색 브리지 — MainActivity의 ThemeBridge가
// addJavascriptInterface(..., "AndroidTheme")로 주입한다. 웹에서는 undefined.
interface AndroidThemeBridge {
  /** @param colorHex 바 배경색(#rrggbb) @param lightBar 배경이 밝은가(아이콘을 어둡게) */
  setSystemBars(colorHex: string, lightBar: boolean): void;
}
interface Window {
  AndroidBackup?: AndroidBackupBridge;
  AndroidTheme?: AndroidThemeBridge;
}
