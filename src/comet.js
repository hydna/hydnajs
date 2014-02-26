var CometTransport = {

  inititalized: false,

  sockets: {},
  socketCount: 0,

  idprefix: "__" + OBJECT_NAME.toLowerCase() + "__",

  idsuffix: "__bridge__",

  origin: global.location.origin || (function() {
    var l = global.location;
    return l.protocol == "file:" ?
            "file://" :
            l.protocol + "://" + l.hostname;
  }()),

  init: function() {
    if ("attachEvent" in global) {
      global.attachEvent("onmessage", CometTransport.messageHandler);
    } else {
      global.addEventListener("message", CometTransport.messageHandler, false);
    }
    CometTransport.inititalized = true;
  },

  destroy: function() {
    if ("detachEvent" in global) {
      global.detachEvent("onmessage", CometTransport.messageHandler);
    } else {
      global.removeEventListener("message", CometTransport.messageHandler, false);
    }
    CometTransport.inititalized = false;
  },

  // Global message handler for all incomming
  // messages. We filter out the underlying FlashSocket
  // by checking the origin.
  messageHandler: function(event) {
    var socket;
    var data;
    var id;
    var op;

    if (event.source == global ||
        typeof event.data != "string" ||
        event.data.length < 8) {
      return;
    }

    id = event.data.substr(0, 8);

    if (!(socket = CometTransport.sockets[id]) ||
        !socket.messageHandler) {
      return;
    }

    op = event.data.charCodeAt(8);
    data = event.data.length > 8 ? event.data.substr(9) : null;

    switch (op) {

      // Handshake
      case 0x01: return socket.openHandler();

      // Error
      case 0x02: return socket.errorHandler(data || "COMET_UNKNOWN_ERR");

      // Message
      case 0x03: return socket.messageHandler(data);

      default: return socket.errorHandler("COMET_ILLGEALOP_ERR");
    }
  }

};


function CometSocket(url) {
  var self = this;
  var elemid;
  var urlobj;
  var port;
  var src;
  var body;

  this.id = uniqueId(true);
  this.url = url;
  this.connected = false;
  this.bridge = null;

  elemid = CometTransport.idprefix + this.id + CometTransport.idsuffix;

  this.elem = document.createElement('iframe');
  this.elem.setAttribute("id", elemid);

  this.elem.style.width = "0px";
  this.elem.style.height = "0px";
  this.elem.style.visibility = "hidden";

  urlobj = parseUri(this.url);

  port = (urlobj.port?':' + urlobj.port:'');
  src = urlobj.protocol + "://" + urlobj.host + port + COMET_PATH;
  src = src + "?origin=" + CometTransport.origin;

  this.elem.src = src;

  function onload() {
    var b = document.getElementById(elemid);
    self.bridge = b.contentWindow;
    self.bridge.postMessage(String(self.id), "*");
  }

  if ('addEventListener' in this.elem) {
      this.elem.addEventListener("load", onload, false);
  } else if ('attachEvent' in this.elem) {
      this.elem.attachEvent("onload", onload);
  } else {
      this.elem.onload = onload;
  }

  body = document.getElementsByTagName('body')[0];
  body.appendChild(this.elem);

  this.initTimer = setTimeout(function () {
    self.errorHandler("COMET_INIT_TIMEOUT_ERR");
  }, 10000);
}

FlashSocket.prototype.bufferedAmount = 0;

CometSocket.prototype.fallbackTransport = null;

CometSocket.prototype.onmessage = sockMessageUtfImpl;
CometSocket.prototype.createFrame = createFrameUtf;
CometSocket.prototype.openHandler = bridgeOpenHandler;
CometSocket.prototype.closeHandler = bridgeCloseHandler;
CometSocket.prototype.errorHandler = bridgeErrorHandler;
CometSocket.prototype.messageHandler = bridgeMessageHandler;


CometSocket.prototype.send = function(data) {
  this.bridge.postMessage("\x03" + data, "*");
};


CometSocket.prototype.close = function(code, reason) {
  var bridge;
  var elem;

  if (!this.id) {
    return;
  }

  delete CometTransport.sockets[this.id];

  this.id = null;

  CometTransport.socketCount--;

  if (CometTransport.socketCount == 0) {
    CometTransport.destroy();
  }

  if (this.initTimer) {
    clearTimeout(this.initTimer);
    this.initTimer = null;
  }

  if ((bridge = this.bridge)) {
    this.connected = false;
    this.bridge = null;
    nextTick(function() {
      try {
        bridge.postMessage("\x02", "*");
      } catch (err) {
      }
    });
  }

  if ((elem = this.elem)) {
    this.elem = null;
    elem.onload = null;
    setTimeout(function () {
      var body = document.getElementsByTagName('body')[0];
      try { body.removeChild(elem); } catch (err) { }
    }, 1);
  }

  if (!this.onclose) {
    return;
  }

  this.onclose({
    type: "close",
    code: code || STATUS_NO_STATUS_RCVD,
    reason: reason || "COMET_UNKNOWN_ERR"
  });
};


function cometSocketInit(url) {
  var socket;

  socket = new CometSocket(url);

  CometTransport.sockets[socket.id] = socket;
  CometTransport.socketCount++;

  if (!CometTransport.inititalized) {
    CometTransport.init();
  }

  return socket;
}


if ((typeof DISABLE_COMET === "undefined" || DISABLE_COMET === false) &&
     typeof global.postMessage != "undefined") {
  AVAILABLE_TRANSPORTS["comet"] = cometSocketInit;
  DEFAULT_TRANSPORT = DEFAULT_TRANSPORT || "comet";
}
