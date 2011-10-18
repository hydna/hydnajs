function hasFlashSupport() {
  var nav = global.navigator;
  var mkey = "application/x-shockwave-flash";
  var ActiveX;
  var mimes;
  var major;
  var plugin;

  if (typeof FlashSocketInterface == "undefined" || !nav) {
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

function hasWSSupport() {
  return typeof WebSocketInterface != "undefined" &&
         typeof WebSocket != "undefined"
}


function hasCometSupport() {
  return typeof CometSocketInterface != "undefined" &&
         typeof global.postMessage != "undefined";
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
    hasWSSupport() && (SocketInterface = WebSocketInterface());
    break;
  case "flash":
    hasFlashSupport() && (SocketInterface = FlashSocketInterface());
    AB_TRANSPORT_SUPPORT = false;
    break;
  case "comet":
    hasCometSupport() && (SocketInterface = CometSocketInterface());
    AB_TRANSPORT_SUPPORT = false;
    break;
  default:
    // Use the best suited transport socket 
    if (hasWSSupport()) {
      SocketInterface = WebSocketInterface();
    } else if (hasFlashSupport()) {
      SocketInterface = FlashSocketInterface();
      AB_TRANSPORT_SUPPORT = false;
    } else if (hasCometSupport()) {
      SocketInterface = CometSocketInterface();
      AB_TRANSPORT_SUPPORT = false;
    }
    break;
}

// Set transport to `none` if not supported
SUPPORTED = !(!SocketInterface);

// Set createFrame to Binary if supported
createFrame = AB_TRANSPORT_SUPPORT ? createFrameBin
                                   : createFrameUtf;