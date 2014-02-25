var WebSocketTransport = {

  WebSocket: null,
  binarySupport: false,

  init: function(wsurl) {
    var WebSocket = global.WebSocket;
    var agent;
    var tmpsock;
    var m;

    if (global.MozWebSocket) {
      WebSocket = global.MozWebSocket;
    } else if ((binarySupport = ("binaryType" in WebSocket.prototype)) == false) {
      agent = navigator.userAgent;
      // Detect if we can use ArrayBuffers in transport
      switch (true) {

        case (!!(m = /Chrome\/(\d+)/.exec(agent))) && (parseInt(m[1]) >= 15):
        case (!!(m = /Firefox\/(\d+)/.exec(agent))) && (parseInt(m[1]) >= 11):
        case (!!(m = /MSIE\s(\d+)/.exec(agent))) && (parseInt(m[1]) >= 10):
        WebSocketTransport.binarySupport = true;
        break;

        default:
        try {
          tmpsock = new WebSocket(wsurl);
          WebSocketTransport.binarySupport = !!(tmpsock.binaryType);
          tmpsock.close();
        } catch (e) {
        }
        break;
      }
    }

    WebSocketTransport.WebSocket = WebSocket;
  }
};


function webSocketInit(url) {
  var urlobj;
  var wsurl;

  urlobj = parseUri(url);

  wsurl = (urlobj.protocol == 'http' ? 'ws://' : 'wss://') + urlobj.host;
  if (urlobj.port) {
    wsurl += ':' + urlobj.port;
  }

  if (!WebSocketTransport.WebSocket) {
    WebSocketTransport.init(wsurl);
  }

  try {
    socket = new WebSocketTransport.WebSocket(wsurl,
                                      ["wsutf.winkprotocol.org"].concat(
                                          WebSocketTransport.binarySupport ?
                                          ["wsbin.winkprotocol.org"] : []));
  } catch (initError) {
    return nextTick(function () {
      socket.onclose({
        code: STATUS_TRANSPORT_FAILURE,
        message: initError.message || "Failed to connect to remote"
      });
    });
  }

  if (WebSocketTransport.binarySupport) {
    socket.binaryType = "arraybuffer";
    socket.onmessage = sockMessageBinImpl;
    socket.createFrame = createFrameBin;
  } else {
    socket.onmessage = sockMessageUtfImpl;
    socket.createFrame = createFrameUtf;
  }

  if ("bufferedAmount" in socket == false) {
    socket.bufferedAmount = 0;
  }

  return socket;
}

if ((typeof DISABLE_WEBSOCKET == "undefined" || DISABLE_WEBSOCKET == false) &&
    (global.WebSocket || global.MozWebSocket)) {
  AVAILABLE_TRANSPORTS["websocket"] = webSocketInit;
  DEFAULT_TRANSPORT = "websocket";
}
