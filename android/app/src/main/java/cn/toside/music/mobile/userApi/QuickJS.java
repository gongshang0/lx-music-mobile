package com.gongshang.lxmusic.mobile.userApi;

import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Message;
import android.util.Base64;
import android.util.Log;
import com.gongshang.lxmusic.mobile.crypto.AES;
import com.gongshang.lxmusic.mobile.crypto.RSA;
import com.facebook.react.bridge.ReactApplicationContext;

import com.whl.quickjs.android.QuickJSLoader;
import com.whl.quickjs.wrapper.QuickJSContext;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

public class QuickJS {
  private final Handler eventHandler;
  private String key;
  private final ReactApplicationContext reactContext;
  private boolean isInited = false;
  private QuickJSContext jsContext = null;
  final Handler timeoutHandler = new Handler();
  private boolean inited = false;

  public QuickJS(ReactApplicationContext context, Handler eventHandler) {
    this.reactContext = context;
    this.eventHandler = eventHandler;
  }

  private void init() {
    if (this.isInited) return;
    QuickJSLoader.init();
    this.key = UUID.randomUUID().toString();
    this.isInited = true;
  }

  private String getPreloadScript() {
    try {
      InputStream inputStream = this.reactContext.getAssets().open("script/user-api-preload.js");
      byte[] buffer = new byte[inputStream.available()];
      inputStream.read(buffer);
      inputStream.close();
      return new String(buffer, StandardCharsets.UTF_8);
    } catch (Exception e) {
      return null;
    }
  }

  private void createEnvObj(QuickJSContext jsContext) {
    jsContext.getGlobalObject().setProperty("__lx_native_call__", args -> {
      if (this.key.equals(args[0])) {
        callNative((String) args[1], (String) args[2]);
        return null;
      }
      return null;
    });
    jsContext.getGlobalObject().setProperty("__lx_native_call__utils_str2b64", args -> {
      try {
        return new String(Base64.encode(((String) args[0]).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
      } catch (Exception e) {
        Log.e("UserApi [utils]", "utils_str2b64 error: " + e.getMessage());
        return "";
      }
    });
    jsContext.getGlobalObject().setProperty("__lx_native_call__utils_b642buf", args -> {
      try {
        byte[] byteArray = Base64.decode(((String) args[0]).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        StringBuilder jsonArrayString = new StringBuilder("[");
        for (int i = 0; i < byteArray.length; i++) {
          jsonArrayString.append((int) byteArray[i]);
          if (i < byteArray.length - 1) {
            jsonArrayString.append(",");
          }
        }
        jsonArrayString.append("]");
        return jsonArrayString.toString();
      } catch (Exception e) {
        Log.e("UserApi [utils]", "utils_b642buf error: " + e.getMessage());
        return "";
      }
    });
    jsContext.getGlobalObject().setProperty("__lx_native_call__utils_str2md5", args -> {
      try {
        // Log.d("UserApi [script call]", "utils_str2md5: " + args[0]);
        String str;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          str = URLDecoder.decode((String) args[0], StandardCharsets.UTF_8);
        } else {
          str = URLDecoder.decode((String) args[0], "UTF-8");
        }
        // Log.d("UserApi [script call]", "utils_str2md5: " + str);
        MessageDigest md = MessageDigest.getInstance("MD5");
        byte[] md5Bytes = md.digest(str.getBytes(StandardCharsets.UTF_8));
        StringBuilder md5String = new StringBuilder();
        for (byte b : md5Bytes) {
          md5String.append(String.format("%02x", b));
        }
        return md5String.toString();
      } catch (Exception e) {
        Log.e("UserApi [utils]", "utils_str2md5 error: " + e.getMessage());
        return "";
      }
    });
    jsContext.getGlobalObject().setProperty("__lx_native_call__utils_aes_encrypt", args -> {
      try {
        return AES.encrypt((String) args[0], (String) args[1], (String) args[2], (String) args[3]);
      } catch (Exception e) {
        Log.e("UserApi [utils]", "utils_aes_encrypt error: " + e.getMessage());
        return "";
      }
    });
    jsContext.getGlobalObject().setProperty("__lx_native_call__utils_rsa_encrypt", args -> {
      try {
        return RSA.encryptRSAToString((String) args[0], (String) args[1], (String) args[2]);
      } catch (Exception e) {
        Log.e("UserApi [utils]", "utils_rsa_encrypt error: " + e.getMessage());
        return "";
      }
    });
    jsContext.getGlobalObject().setProperty("__lx_native_call__set_timeout", args -> {
      this.timeoutHandler.postDelayed(() -> {
        callJS("__set_timeout__", args[0]);
      }, (int) args[1]);
      return null;
    });
  }

  private boolean createJSEnv(String id, String name, String desc, String version, String author, String homepage, String rawScript) {
    init();
    QuickJSContext quickJSContext = this.jsContext;
    if (quickJSContext != null) quickJSContext.destroy();
    this.jsContext = QuickJSContext.create();
    this.jsContext.setConsole(new Console(this.eventHandler));
    String preloadScript = getPreloadScript();
    if (preloadScript == null) return false;
    createEnvObj(this.jsContext);
    this.jsContext.evaluate(preloadScript);
    this.jsContext.getGlobalObject
