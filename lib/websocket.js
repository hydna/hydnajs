
function webSocketInit(url) {
  var WebSocket = global.WebSocket;
  var protocol = 'https:' == location.protocol ? 'wss' : 'ws';
  var agent = navigator.userAgent;
  var binarySupport = false;
  var urlobj;
  var wsurl;
  var m;

  urlobj = parseUri(url);

  if (global.MozWebSocket) {
    WebSocket = global.MozWebSocket;
  } else if ((binarySupport = ("binaryType" in WebSocket.prototype)) == false) {
    // Detect if we can use ArrayBuffers in transport
    switch (true) {

      case (!!(m = /Chrome\/(\d+)/.exec(agent))) && (parseInt(m[1]) >= 15):
      case (!!(m = /Firefox\/(\d+)/.exec(agent))) && (parseInt(m[1]) >= 11):
      case (!!(m = /MSIE\s(\d+)/.exec(agent))) && (parseInt(m[1]) >= 10):
      binarySupport = true;
      break;

      default:
        // TODO: todo
      try {
        return !!(new WebSocket(protocol+'://.').binaryType);
      } catch (e){}

      break;
    }
  }

  try {
    wsurl = (urlobj.protocol == 'http' ? 'ws://' : 'wss://') + urlobj.host;
    if (urlobj.port) {
      wsurl += ':' + port;
    }
    socket = new WebSocket(wsurl, ["wsutf.winkprotocol.org"].concat(
                                    binarySupport ? ["wsbin.winkprotocol.org"]
                                                  : []));
  } catch (initError) {
    return nextTick(function () {
      socket.onclose({
        code: STATUS_TRANSPORT_FAILURE,
        message: initError.message || "Failed to connect to remote"
      });
    });
  }

  if (binarySupport) {
    socket.binaryType = "arraybuffer";
    socket.onmessage = sockMessageBinImpl;
    socket.createFrame = createFrameBin;
  } else {
    socket.onmessage = sockMessageUtfImpl;
    socket.createFrame = createFrameUtf;
  }

  return socket;
}

if ((typeof DISABLE_WEBSOCKET == "undefined" || DISABLE_WEBSOCKET == false) &&
    (global.WebSocket || global.MozWebSocket)) {
  AVAILABLE_TRANSPORTS["websocket"] = webSocketInit;
  DEFAULT_TRANSPORT = "websocket";
}