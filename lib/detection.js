function hasFlashSupport() {
  var nav = global.navigator;
  var mkey = "application/x-shockwave-flash";
  var ActiveX;
  var mimes;
  var major;
  var plugin;

  if (!nav) {
    return false;
  }

  if (typeof nav.plugins != "undefined" &&
      (plugin = nav.plugins["Shockwave Flash"]) &&
      plugin.description &&
      ((mime = nav.mimeTypes) && mime[mkey] && mime[mkey].enabledPlugin)) {
    major = /\s(\d+)/.exec(plugin.description);
    return major[1] && (parseInt(major[1]) > 9);
  } else if ((ActiveX = global.ActiveXObject)) {
    try {
      if ((plugin = new ActiveX("ShockwaveFlash.ShockwaveFlash"))) {
        major = /\s(\d+)/.exec(plugin.GetVariable("$version"));
        return major[1] && (parseInt(major[1]) > 9);
      }
    } catch(e) {
      return false;
    }
  }

  return false;
}

// Check if the browser supports ArrayBuffers's. If not,
// use Arrays instead.
if (ArrayBuffer == undefined) {
  ArrayBuffer = function() {};
  atobin = atoarr;
} else {
  atobin = atoab;
}


// Use base64 lib if not natively supported
btoa = btoa || base64.encode;
atob = atob || base64.decode;


// Detect if we can use ArrayBuffers in transport
AB_TRANSPORT_SUPPORT = WebSocket && "binaryType" in WebSocket.prototype;

// Test if we support binary in Chrome. This is awful, but the only
// way that is working right now.
if (WebSocket && !AB_TRANSPORT_SUPPORT && /Chrome/.test(navigator.userAgent)) {
  (function() {
    var m = /Chrome\/(\d+)/.exec(navigator.userAgent);
    if (m && parseInt(m[1]) >= 15) AB_TRANSPORT_SUPPORT = true;
  })();
}


switch (global.__FORCE_TRANSPORT_SOCKET__) {
  case "websocket":
    SocketInterface = WebSocketInterface();
    TRANSPORT = "websocket";
    if (typeof WebSocket == "undefined") {
      SUPPORTED = false;
    }
    break;
  case "flash":
    SocketInterface = FlashSocketInterface();
    TRANSPORT = "flash";
    SUPPORTED = hasFlashSupport();
    AB_TRANSPORT_SUPPORT = false;
    break;
  case "comet":
    SocketInterface = CometSocketInterface();
    TRANSPORT = "comet";
    SUPPORTED = !(!global.postMessage);
    AB_TRANSPORT_SUPPORT = false;
    break;
  default:
    // Use the best suited transport socket 
    if (typeof WebSocket !== "undefined") {
      TRANSPORT = "websocket";
      SocketInterface = WebSocketInterface();
    } else if (hasFlashSupport()) {
      TRANSPORT = "flash";
      SocketInterface = FlashSocketInterface();
    } else if (global.postMessage) {
      TRANSPORT = "comet";
      SocketInterface = CometSocketInterface();
    } else {
      TRANSPORT = "none";
      SUPPORTED = false;
    }
    break;
}

// Set transport to `none` if not supported
TRANSPORT = SUPPORTED ? TRANSPORT : "none";

// Set createFrame to Binary if supported
createFrame = AB_TRANSPORT_SUPPORT ? createFrameBin
                                   : createFrameUtf;