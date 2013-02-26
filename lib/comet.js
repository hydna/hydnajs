function CometSocketInterface() {
  var idprefix = "__" + OBJECT_NAME.toLowerCase() + "__"
  var idsuffix = "__bridge__";
  var origin = global.location.origin;
  var ret;

  origin = origin || (function() {
    var l = global.location;
    return l.protocol == "file:" ?
            "file://" :
            l.protocol + "://" + l.hostname;
  })();

  // Global message handler for all incomming
  // messages. We filter out the underlying FlashSocket
  // by checking the origin.
  function messageHandler(event) {
    var id;
    var sock;

    if (event.source == global ||
        typeof event.data != "string" ||
        event.data.length < 8) {
      return;
    }

    id = event.data.substr(0, 8);

    if (!(sock = CometSocket.all[id]) ||
        !sock.messageHandler) {
      return;
    }

    sock.messageHandler(event);
  }


  function CometSocket(url) {
    var self = this;
    var body = document.getElementsByTagName('body')[0];
    var token;
    var id;
    var src;
    var target;

    id = (CometSocket.incr++).toString(16);
    while (id.length < 8) id = 0 + id;

    this.id = id;

    token = url.query || "";

    src = url.protocol +
          "://" +
          url.authority +
          COMET_PATH +
          "?origin=" + origin;

    this.elem = document.createElement('iframe');
    this.elem.setAttribute("id", idprefix + this.id + idsuffix);

    this.elem.style.width = "0px";
    this.elem.style.height = "0px";
    this.elem.style.visibility = "hidden";

    this.elem.src = src;

    function onload() {
      var b = document.getElementById(idprefix + id + idsuffix);
      self.bridge = b.contentWindow;
      self.bridge.postMessage(id + token, "*");
    }

    if ('addEventListener' in this.elem) {
        this.elem.addEventListener("load", onload, false);
    } else if ('attachEvent' in this.elem) {
        this.elem.attachEvent("onload", onload);
    } else {
        this.elem.onload = onload;
    }

    this.connected = false;
    this.bridge = null;

    function ontimeout() {
      self.destroy(new Error("ERR_HANDSHAKE_TIMEOUT"));
    }

    this.handshakeTimeout = setTimeout(ontimeout, 5000);

    CometSocket.all[this.id] = this;
    CometSocket.count++;

    // Initialize the global message handler if this is the
    // first Socket that is being added.
    if (CometSocket.count == 1) {
      if ("attachEvent" in global) {
        global.attachEvent("onmessage", messageHandler);
      } else {
        global.addEventListener("message", messageHandler, false);
      }
    }

    body.appendChild(this.elem);
  }


  CometSocket.all = {};
  CometSocket.incr = 1;
  CometSocket.count = 0;


  CometSocket.prototype.messageHandler = function(event) {
    var op = event.data.charCodeAt(8);
    var payload = event.data.length > 8 ? event.data.substr(9) : null;

    switch (op) {

      case 0x01: // Handshake
        clearTimeout(this.handshakeTimeout);
        this.handshakeTimeout = null;
        this.connected = true;
        this.onopen();
        break;

      case 0x02: // Error
        this.destroy(new Error(payload || "BRIDGE_COMM_ERROR"));
        break;

      case 0x03:
        this.onmessage({ data: payload });
        break;

      default:
        this.destroy(new Error("BAD_OP(" + op + ")"));
        break;
    }
  };


  CometSocket.prototype.onmessage = sockMessageUtfImpl;


  CometSocket.prototype.send = function(data) {
    this.bridge.postMessage("\x03" + data, "*");
  };


  CometSocket.prototype.close = function() {
    this.destroy();
  };


  CometSocket.prototype.destroy = function(err) {
    var elem;

    if (!this.id) return;

    if (this.handshakeTimeout) {
      clearTimeout(this.handshakeTimeout);
      this.handshakeTimeout = null;
    }

    if (this.bridge) {
      this.bridge.postMessage("\x02", "*");
      this.bridge = null;
    }

    if ((elem = this.elem)) {
      this.elem = null;
      elem.onload = null;
      setTimeout(function () {
        var body = document.getElementsByTagName('body')[0];
        try { body.removeChild(elem); } catch (err) { }
      }, 1);
    }

    this.messageHandler = null;

    delete CometSocket.all[this.id];
    CometSocket.count--;

    if (CometSocket.count == 0) {
      if ("detachEvent" in global) {
        global.detachEvent("onmessage", messageHandler);
      } else {
        global.removeEventListener("message", messageHandler, false);
      }
    }

    this.id = null;

    if (err) {
      this.onerror && this.onerror({
        type: "error",
        message: "COMET_" + (err.message || err),
        target: this
      });
    }

    this.onclose && this.onclose();
  };

  ret = function(url, C) {
    var sock = new CometSocket(url);

    sock.onopen = function() {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(null, sock);
    };

    sock.onclose = function() {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(new Error("Failed to connect to remote"));
    };

    sock.onerror = function(err) {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(err);
    };
  };
  ret.NAME = "comet";
  return ret;
}
