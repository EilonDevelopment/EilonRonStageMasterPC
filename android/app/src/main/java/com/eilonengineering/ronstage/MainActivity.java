/*package com.eilonengineering.ronstage;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}*/

/*-
package com.eilonengineering.ronstage;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.os.Bundle;
import android.os.Process;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.webkit.WebViewCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "EILON_WEBVIEW";
    private boolean webViewPatched = false;

    @Override
    public void onStart() {
        super.onStart();

        if (webViewPatched) {
            return;
        }

        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }

        try {
            PackageInfo pkg = WebViewCompat.getCurrentWebViewPackage(this);
            if (pkg != null) {
                Log.i(TAG, "WebView provider: " + pkg.packageName + " " + pkg.versionName);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not read WebView provider", e);
        }

        bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                boolean didCrash = false;
                try {
                    didCrash = detail != null && detail.didCrash();
                } catch (Exception ignored) {
                }

                Log.e(TAG, "WebView renderer gone. didCrash=" + didCrash);

                try {
                    if (view != null) {
                        view.stopLoading();
                        view.loadUrl("about:blank");
                        view.clearHistory();

                        if (view.getParent() instanceof ViewGroup) {
                            ((ViewGroup) view.getParent()).removeView(view);
                        }

                        view.removeAllViews();
                        view.destroy();
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error destroying crashed WebView", e);
                }

                restartApp();
                return true;
            }
        });

        webViewPatched = true;
    }

    private void restartApp() {
        try {
            Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to restart app after WebView crash", e);
        }

        finish();
        Process.killProcess(Process.myPid());
    }
}



*/

/*
package com.eilonengineering.ronstage;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.os.Process;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.webkit.WebViewCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "EILON_WEBVIEW";
    private static final String NATIVE_LOG_FILE = "native_crash_markers.txt";
    private boolean webViewPatched = false;

    @Override
    public void onStart() {
        super.onStart();

        if (webViewPatched) {
            return;
        }

        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }

        String webViewPackageName = "";
        String webViewVersion = "";

        try {
            PackageInfo pkg = WebViewCompat.getCurrentWebViewPackage(this);
            if (pkg != null) {
                webViewPackageName = pkg.packageName;
                webViewVersion = pkg.versionName;
                Log.i(TAG, "WebView provider: " + webViewPackageName + " " + webViewVersion);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not read WebView provider", e);
        }

        final String finalWebViewPackageName = webViewPackageName;
        final String finalWebViewVersion = webViewVersion;

        bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                boolean didCrash = false;
                int rendererPriority = -1;

                try {
                    didCrash = detail != null && detail.didCrash();
                } catch (Exception ignored) {
                }

                try {
                    if (detail != null) {
                        rendererPriority = detail.rendererPriorityAtExit();
                    }
                } catch (Exception ignored) {
                }

                Log.e(TAG, "WebView renderer gone. didCrash=" + didCrash + ", rendererPriority=" + rendererPriority);

                writeNativeCrashMarker(
                        "EVENT=onRenderProcessGone\n" +
                        "TIMESTAMP=" + isoNow() + "\n" +
                        "DID_CRASH=" + didCrash + "\n" +
                        "RENDERER_PRIORITY_AT_EXIT=" + rendererPriority + "\n" +
                        "WEBVIEW_PACKAGE=" + finalWebViewPackageName + "\n" +
                        "WEBVIEW_VERSION=" + finalWebViewVersion + "\n" +
                        "APP_PACKAGE=" + getPackageName() + "\n" +
                        "DEVICE_MANUFACTURER=" + android.os.Build.MANUFACTURER + "\n" +
                        "DEVICE_MODEL=" + android.os.Build.MODEL + "\n" +
                        "ANDROID_VERSION=" + android.os.Build.VERSION.RELEASE + "\n" +
                        "SDK_INT=" + android.os.Build.VERSION.SDK_INT + "\n" +
                        "------------------------------\n"
                );

                try {
                    if (view != null) {
                        view.stopLoading();
                        view.loadUrl("about:blank");
                        view.clearHistory();

                        if (view.getParent() instanceof ViewGroup) {
                            ((ViewGroup) view.getParent()).removeView(view);
                        }

                        view.removeAllViews();
                        view.destroy();
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error destroying crashed WebView", e);
                }

                restartApp();
                return true;
            }
        });

        webViewPatched = true;
    }

    private void writeNativeCrashMarker(String text) {
        FileOutputStream fos = null;
        try {
            File file = new File(getFilesDir(), NATIVE_LOG_FILE);
            fos = new FileOutputStream(file, true);
            fos.write(text.getBytes(StandardCharsets.UTF_8));
            fos.flush();
        } catch (Exception e) {
            Log.e(TAG, "Failed to write native crash marker", e);
        } finally {
            try {
                if (fos != null) {
                    fos.close();
                }
            } catch (Exception ignored) {
            }
        }
    }

    private String isoNow() {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US).format(new Date());
    }

    private void restartApp() {
        try {
            Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to restart app after WebView crash", e);
        }

        finish();
        Process.killProcess(Process.myPid());
    }
}

*/



package com.eilonengineering.ronstage;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.os.Process;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.webkit.WebViewCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "EILON_WEBVIEW";
    private static final String NATIVE_LOG_FILE = "native_crash_markers.txt";
    private boolean webViewPatched = false;

    @Override
    public void onStart() {
        super.onStart();

        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }

        String webViewPackageName = "";
        String webViewVersion = "";

        try {
            PackageInfo pkg = WebViewCompat.getCurrentWebViewPackage(this);
            if (pkg != null) {
                webViewPackageName = pkg.packageName;
                webViewVersion = pkg.versionName;
                Log.i(TAG, "WebView provider: " + webViewPackageName + " " + webViewVersion);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not read WebView provider", e);
        }

        writeNativeEvent(
                "EVENT=app_start\n" +
                "TIMESTAMP=" + isoNow() + "\n" +
                "WEBVIEW_PACKAGE=" + webViewPackageName + "\n" +
                "WEBVIEW_VERSION=" + webViewVersion + "\n" +
                "APP_PACKAGE=" + getPackageName() + "\n" +
                "DEVICE_MANUFACTURER=" + android.os.Build.MANUFACTURER + "\n" +
                "DEVICE_MODEL=" + android.os.Build.MODEL + "\n" +
                "ANDROID_VERSION=" + android.os.Build.VERSION.RELEASE + "\n" +
                "SDK_INT=" + android.os.Build.VERSION.SDK_INT + "\n" +
                "------------------------------\n"
        );

        if (webViewPatched) {
            return;
        }

        final String finalWebViewPackageName = webViewPackageName;
        final String finalWebViewVersion = webViewVersion;

        bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                boolean didCrash = false;
                int rendererPriority = -1;

                try {
                    didCrash = detail != null && detail.didCrash();
                } catch (Exception ignored) {
                }

                try {
                    if (detail != null) {
                        rendererPriority = detail.rendererPriorityAtExit();
                    }
                } catch (Exception ignored) {
                }

                Log.e(TAG, "WebView renderer gone. didCrash=" + didCrash + ", rendererPriority=" + rendererPriority);

                writeNativeEvent(
                        "EVENT=onRenderProcessGone\n" +
                        "TIMESTAMP=" + isoNow() + "\n" +
                        "DID_CRASH=" + didCrash + "\n" +
                        "RENDERER_PRIORITY_AT_EXIT=" + rendererPriority + "\n" +
                        "WEBVIEW_PACKAGE=" + finalWebViewPackageName + "\n" +
                        "WEBVIEW_VERSION=" + finalWebViewVersion + "\n" +
                        "APP_PACKAGE=" + getPackageName() + "\n" +
                        "DEVICE_MANUFACTURER=" + android.os.Build.MANUFACTURER + "\n" +
                        "DEVICE_MODEL=" + android.os.Build.MODEL + "\n" +
                        "ANDROID_VERSION=" + android.os.Build.VERSION.RELEASE + "\n" +
                        "SDK_INT=" + android.os.Build.VERSION.SDK_INT + "\n" +
                        "------------------------------\n"
                );

                try {
                    if (view != null) {
                        view.stopLoading();
                        view.loadUrl("about:blank");
                        view.clearHistory();

                        if (view.getParent() instanceof ViewGroup) {
                            ((ViewGroup) view.getParent()).removeView(view);
                        }

                        view.removeAllViews();
                        view.destroy();
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error destroying crashed WebView", e);
                }

                restartApp();
                return true;
            }
        });

        webViewPatched = true;
    }

    private void writeNativeEvent(String text) {
        FileOutputStream fos = null;
        try {
            File file = new File(getFilesDir(), NATIVE_LOG_FILE);
            fos = new FileOutputStream(file, true);
            fos.write(text.getBytes(StandardCharsets.UTF_8));
            fos.flush();
        } catch (Exception e) {
            Log.e(TAG, "Failed to write native event", e);
        } finally {
            try {
                if (fos != null) {
                    fos.close();
                }
            } catch (Exception ignored) {
            }
        }
    }

    private String isoNow() {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US).format(new Date());
    }

    private void restartApp() {
        try {
            Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to restart app after WebView crash", e);
        }

        finish();
        Process.killProcess(Process.myPid());
    }
}