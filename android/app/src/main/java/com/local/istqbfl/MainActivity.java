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
    configureSystemBars();
    super.onCreate(savedInstanceState);
    if (getBridge() != null && getBridge().getWebView() != null) {
      WebView webView = getBridge().getWebView();
      webView.addJavascriptInterface(new BackupBridge(this), "AndroidBackup");
      injectStatusBarHeight(webView);
    }
  }

  private void configureSystemBars() {
    Window window = getWindow();
    // 상태바·내비게이션 바 색상을 앱 배경색으로 통일
    window.setStatusBarColor(Color.rgb(245, 247, 242));
    window.setNavigationBarColor(Color.rgb(245, 247, 242));

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      // false: WebView가 상태바 뒤까지 그려짐(edge-to-edge)
      // CSS env(safe-area-inset-top)으로 내용을 피해서 그림
      window.setDecorFitsSystemWindows(false);
    }

    int flags = window.getDecorView().getSystemUiVisibility();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    }
    window.getDecorView().setSystemUiVisibility(flags);
  }

  /**
   * env(safe-area-inset-top)이 0을 리턴하는 일부 WebView 버전을 위한 안전망.
   * 실제 상태바 높이(dp → px 변환 후 CSS px 값)를 JS로 주입합니다.
   */
  private void injectStatusBarHeight(WebView webView) {
    int statusBarHeightPx = 0;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
      if (insets != null) {
        statusBarHeightPx = insets.getInsets(WindowInsets.Type.statusBars()).top;
      }
    } else {
      int resourceId = getResources().getIdentifier("status_bar_height", "dimen", "android");
      if (resourceId > 0) {
        statusBarHeightPx = getResources().getDimensionPixelSize(resourceId);
      }
    }
    // WebView 내부는 CSS px 단위를 사용하므로 devicePixelRatio로 나눔
    float density = getResources().getDisplayMetrics().density;
    float statusBarCssPx = statusBarHeightPx / density;
    final String js = String.format(
      "(function(){" +
      "  var h = %.1f;" +
      "  if (h > 0 && getComputedStyle(document.documentElement)" +
      "    .getPropertyValue('--safe-top').trim() === '0px') {" +
      "    document.documentElement.style.setProperty('--safe-top', h + 'px');" +
      "  }" +
      "})()",
      statusBarCssPx
    );
    webView.post(() -> webView.evaluateJavascript(js, null));
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
