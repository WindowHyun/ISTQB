package com.local.istqbfl;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // 반드시 super.onCreate() 뒤에 시스템 바를 만진다 — 먼저 getDecorView()를 부르면
    // 테마(windowNoTitle) 적용 전에 데코 뷰가 생성돼 네이티브 타이틀바("앱 이름")가
    // 화면 상단에 나타나 웹 상단바(☰ 포함)를 가린다.
    super.onCreate(savedInstanceState);
    configureSystemBars();
    if (getSupportActionBar() != null) {
      getSupportActionBar().hide();
    }
    if (getBridge() != null && getBridge().getWebView() != null) {
      WebView webView = getBridge().getWebView();
      webView.addJavascriptInterface(new BackupBridge(this), "AndroidBackup");
      webView.addJavascriptInterface(new ThemeBridge(), "AndroidTheme");
      injectSafeAreaInsets(webView);
    }
  }

  private void configureSystemBars() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      // false: WebView가 상태바 뒤까지 그려짐(edge-to-edge)
      // CSS env(safe-area-inset-top)으로 내용을 피해서 그림
      getWindow().setDecorFitsSystemWindows(false);
    }
    // 시작 색은 라이트 테마의 표면색(--surface: #ffffff)이다 — 상단바(.mobile-topbar)와
    // 하단 액션바가 모두 이 색이라 경계가 보이지 않는다. 다크 테마이면 웹이 뜨자마자
    // AndroidTheme.setSystemBars()로 덮어쓴다(아래 ThemeBridge).
    // 종전 값(#f5f7f2)은 폐기된 틸 브랜드 팔레트 잔재로, 실제 배경(--bg: #eef2f7)과도
    // 달라 상태바만 미묘하게 초록빛으로 떴다.
    applySystemBars(Color.rgb(255, 255, 255), true);
  }

  /**
   * 시스템 바를 앱 표면색에 맞춘다.
   *
   * @param color   바 배경색
   * @param lightBar 배경이 밝은가. 밝으면 아이콘을 어둡게(LIGHT_*_BAR 플래그) 그려야 보인다 —
   *                 플래그 이름의 'LIGHT'는 아이콘이 아니라 **배경**을 가리킨다.
   */
  private void applySystemBars(int color, boolean lightBar) {
    Window window = getWindow();
    window.setStatusBarColor(color);
    window.setNavigationBarColor(color);

    int flags = window.getDecorView().getSystemUiVisibility();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      // 반드시 켜고 끄기를 모두 한다. 켜기만 하면 다크로 갔다가 라이트로 돌아올 때
      // 플래그가 남아 흰 바탕에 흰 아이콘이 되어 시계·배터리가 사라진다.
      if (lightBar) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
      else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      if (lightBar) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
      else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    }
    window.getDecorView().setSystemUiVisibility(flags);
  }

  /**
   * 웹의 테마를 네이티브 시스템 바에 잇는다.
   *
   * 종전에는 바 색이 onCreate에서 흰색으로 한 번 박히고 끝이었다. 그래서 다크 테마에서는
   * 어두운 앱 위아래에 **흰 띠 두 줄**이 남았다(edge-to-edge라 앱이 그 뒤까지 그리는데
   * 바 배경만 흰색이었다). 웹에서는 시스템 바가 없어 드러나지 않고 APK에서만 나타났다.
   *
   * 색을 네이티브가 정하지 않고 웹이 넘겨주는 이유: 진실의 출처를 CSS 토큰(--surface)
   * 하나로 둔다. 여기서 팔레트를 복제하면 토큰이 바뀔 때 조용히 어긋난다.
   */
  public class ThemeBridge {
    @JavascriptInterface
    public void setSystemBars(String colorHex, boolean lightBar) {
      final int color;
      try {
        color = Color.parseColor(String.valueOf(colorHex).trim());
      } catch (Exception ignored) {
        return; // 파싱 못 하는 값이면 이전 색을 유지한다(검은 바보다 낫다).
      }
      // @JavascriptInterface는 WebView의 JS 스레드에서 불린다 — 윈도우는 UI 스레드에서만 만진다.
      runOnUiThread(() -> applySystemBars(color, lightBar));
    }
  }

  /**
   * Android WebView는 edge-to-edge에서도 env(safe-area-inset-*)이 0을 리턴한다.
   * 실측 상태바/내비게이션바 높이를 CSS 변수(--safe-top/--safe-bottom)로 주입해
   * globals.css의 안전영역 패딩이 동작하게 하는 안전망.
   */
  private void injectSafeAreaInsets(WebView webView) {
    // 초기 페이지 로드와의 경합(about:blank에 주입돼 유실) 대비 재시도 +
    // 인셋 확정 시점(onApplyWindowInsets)에도 주입해 회전·바 변화를 따라간다.
    webView.setOnApplyWindowInsetsListener((view, insets) -> {
      evaluateSafeAreaJs(webView);
      return view.onApplyWindowInsets(insets);
    });
    webView.post(() -> evaluateSafeAreaJs(webView));
    webView.postDelayed(() -> evaluateSafeAreaJs(webView), 700);
    webView.postDelayed(() -> evaluateSafeAreaJs(webView), 2000);
  }

  private void evaluateSafeAreaJs(WebView webView) {
    // edge-to-edge(setDecorFitsSystemWindows(false))는 API 30+에서만 켠다 —
    // 그 미만은 콘텐츠가 이미 시스템 바를 피하므로 주입하면 이중 여백이 된다.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return;
    int topPx = 0;
    int bottomPx = 0;
    WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
    if (insets != null) {
      topPx = insets.getInsets(WindowInsets.Type.statusBars()).top;
      bottomPx = insets.getInsets(WindowInsets.Type.navigationBars()).bottom;
    }
    // WebView 내부는 CSS px 단위를 사용하므로 devicePixelRatio로 나눔
    float density = getResources().getDisplayMetrics().density;
    final String js = String.format(
      java.util.Locale.US,
      "(function(){" +
      "  var r = document.documentElement.style;" +
      "  r.setProperty('--safe-top', '%.1fpx');" +
      "  r.setProperty('--safe-bottom', '%.1fpx');" +
      "})()",
      topPx / density,
      bottomPx / density
    );
    webView.evaluateJavascript(js, null);
  }

  public static class BackupBridge {
    private final Context context;

    BackupBridge(Context context) {
      this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public String saveBackup(String requestedFileName, String payload) {
      String fileName = sanitizeFileName(requestedFileName);
      byte[] bytes = String.valueOf(payload).getBytes(StandardCharsets.UTF_8);

      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          return saveToPublicDownloads(fileName, bytes);
        }
        return saveToAppDownloads(fileName, bytes);
      } catch (Exception error) {
        return result(false, fileName, "", error.getMessage());
      }
    }

    private String saveToPublicDownloads(String fileName, byte[] bytes) throws Exception {
      ContentResolver resolver = context.getContentResolver();
      ContentValues values = new ContentValues();
      values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
      values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
      values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
      values.put(MediaStore.MediaColumns.IS_PENDING, 1);

      Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
      if (uri == null) throw new IllegalStateException("Downloads 폴더를 열 수 없습니다.");

      try (OutputStream stream = resolver.openOutputStream(uri)) {
        if (stream == null) throw new IllegalStateException("백업 파일을 쓸 수 없습니다.");
        stream.write(bytes);
      }

      values.clear();
      values.put(MediaStore.MediaColumns.IS_PENDING, 0);
      resolver.update(uri, values, null, null);

      return result(true, fileName, "Android 파일 앱 > 다운로드(Download) 폴더", "");
    }

    private String saveToAppDownloads(String fileName, byte[] bytes) throws Exception {
      File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
      if (dir == null) throw new IllegalStateException("앱 다운로드 폴더를 열 수 없습니다.");
      if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("앱 다운로드 폴더를 만들 수 없습니다.");

      File file = new File(dir, fileName);
      try (FileOutputStream stream = new FileOutputStream(file)) {
        stream.write(bytes);
      }

      return result(true, fileName, file.getAbsolutePath(), "");
    }

    private static String sanitizeFileName(String value) {
      String name = String.valueOf(value).replaceAll("[\\\\/:*?\"<>|]", "-").trim();
      if (name.isEmpty()) name = "istqb-fl-backup.json";
      if (!name.endsWith(".json")) name = name + ".json";
      return name;
    }

    private static String result(boolean ok, String fileName, String location, String error) {
      try {
        JSONObject object = new JSONObject();
        object.put("ok", ok);
        object.put("fileName", fileName);
        object.put("location", location);
        object.put("error", error == null ? "" : error);
        return object.toString();
      } catch (Exception ignored) {
        return "{\"ok\":false,\"error\":\"백업 결과를 만들 수 없습니다.\"}";
      }
    }
  }
}
