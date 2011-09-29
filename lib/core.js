(function(global) {

var TARGET_NAME = typeof BUILD_TARGET !== "undefined" ? BUILD_TARGET
                                                      : "HydnaChannel";
var FORCE_TRANSPORT = "flash";

var COMET_HANDSHAKE_PATH = "/api/comet_handshake/";

if (TARGET_NAME in global) {
  throw new Error("Target name already taken, or library already loaded");
}


// parserUri
// Based on Steve Levithan's parseUri
// (c) Steven Levithan <stevenlevithan.com>
// MIT License
var parseUri = (function() {
  var PARSE_RE = /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;
  var KEYS = ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"];

  return function(str) {
  	var m = PARSE_RE.exec(str);
    var uri = {};
  	var i = 14;
  	var authority;

  	while (i--) m[i] && (uri[KEYS[i]] = m[i]);

    if ((authority = uri.authority) && (i = authority.indexOf("@")) !== -1) {
      uri.authority = authority.substr(i + 1);
    }

    uri.addr = uri.authority + "/";

    if (uri.userInfo) {
      uri.addr += encodeURIComponent(uri.userInfo);
    }

  	return uri;
  };
})();


var nextTick = null;
if (typeof setImmediate != "undefined") {
  nextTick = setImmediate;
} else if (typeof postMessage != "undefined") {
	nextTick = (function() {
	  var TOKEN = "nextTick." + (Math.random() * 0xFFFF) & 0xFFFF;
    var callbacks = [];
    var incr = 1;

  	function message(event) {
  	  var C;
  		if (event.source === global && event.data === TOKEN) {
  		  (C = callbacks.shift()) && C();
  		}
  	}

  	if (global.addEventListener) {
  		global.addEventListener("message", message, false);
  	} else if (global.attachEvent) {
  		global.attachEvent("message", message);
  	} else {
  	  global.onmessage = message;
  	}

	  return function(C) {
	    callbacks.push(C);
	    global.postMessage(TOKEN, "*");
	    return incr++;
	  }
	})();
} else {
  nextTick = function(C) { setTimeout(C, 0); };
}

var btoa = window.btoa || base64.encode;
var atob = window.atob || base64.decode;


function abtoutf(ab, offset) {
	var result = [];

  for (var i = offset, l = ab.byteLength; i < l; i++) {
		result.push(String.fromCharCode(ab[i]));
  }

	return decodeURIComponent(escape(result.join("")));
}



// Converts a base64-string to an array with number.
function atoarr(a) {
  var arr = [];
  for (var i = 0, l = a.length; i < l; i++) {
    arr[i] = a.charCodeAt(i);
  }
  return arr;
}


// Converts a string to a ArrayBuffer
function atoab(a) {
  var ab;
  ab = new Uint8Array(a.length);
  for (var i = 0, l = a.length; i < l; i++) {
    ab[i] = a.charCodeAt(i);
  }
  return ab.buffer;
}


var VERSION = "1.0rc";

var READ = 0x01;
var WRITE = 0x02;
var READWRITE = 0x03;
var EMIT = 0x04;


// Signal flags
var FLAG_EMIT = 0x0;
var FLAG_END = 0x1;
var FLAG_ERROR = 0x7;

var ALL_CHANNELS = 0;

var MODE_RE = /^(r|read){0,1}(w|write){0,1}(?:\+){0,1}(e|emit){0,1}$/i;

var SocketInterface = null;

// Check if the browser supports ArrayBuffers's. If not,
// use Arrays instead.
var ArrayBuffer = global.ArrayBuffer;
var atobin = atoab;

if (typeof ArrayBuffer == "undefined") {
  ArrayBuffer = function() {};
  atobin = atoarr;
}

var PAYLOAD_MAX_BIN = 0xfff8;
var PAYLOAD_MAX_UTF = 0x1554c;

var WebSocket = global.WebSocket;

// Mozilla-based browsers prefixed the WebSocket object. Map
// it to a local instead

if (typeof MozWebSocket !== "undefined") {
  WebSocket = MozWebSocket;
}

var AB_TRANSPORT_SUPPORT = WebSocket && "binaryType" in WebSocket.prototype;
var createFrame = null;

// Test if we support binary in Chrome. This is awful, but the only
// way that is working right now.
if (WebSocket && !AB_TRANSPORT_SUPPORT && /Chrome/.test(navigator.userAgent)) {
  (function() {
    var m = /Chrome\/(\d+)/.exec(navigator.userAgent);
    if (m && parseInt(m[1]) >= 15) AB_TRANSPORT_SUPPORT = true;
  })();
}

AB_TRANSPORT_SUPPORT = false;


function createFrameBin(id, op, flag, data) {
  var poff = 0;
  var plen = 0;
  var chars;
  var payload;
  var view;
  var frame;
  var b;

  if (data) {
    if (typeof data == "string") {
      chars = unescape(encodeURIComponent(data));
      view = new Uint8Array(chars.length);
    	for (var i = 0, l = chars.length; i < l; i++) {
    		view[i] = chars.charCodeAt(i);
      }
      paylaod = view.buffer;
      plen = payload.byteLength;
    } else if (data instanceof ArrayBuffer) {
      payload = data;
      plen = data.byteLength;
    } else if (data.buffer instanceof ArrayBuffer) {
      payload = data.buffer;
      poff = data.byteOffset;
      plen = data.byteLength;
    } else if (data.length) {
      view = new Uint8Array(data.length);
      for (var i = 0, l = data.length; i < l; i++) {
        view[i] = parseInt(data[i]);
      }
      payload = view.buffer;
      plen = this.data.byteLength;
    } else {
      throw new Error("UNSUPPORTED_TYPE_ERR");
    }

    if (payload.length > PAYLOAD_MAX_BIN) {
      throw new Error("OVERFLOW_ERR");
    }
  }

  frame = new ArrayBuffer(5 + plen);

  view = new Uint8Array(frame)
  view[0] = id >>> 24 & 0xff;
  view[1] = id >>> 16 & 0xff;
  view[2] = id >>> 8 & 0xff;
  view[3] = id % 256;
  view[4] = op << 3 | flag;

  if (plen > 5) {
    view.set(new Uint8Array(payload, poff, plen), 5);
  }

  return frame;
}


function createFrameUtf(id, op, flag, data) {
  var buffer;
  var frame;
  var view;
  var payload;
  var b;

  if (data) {
    if (typeof data == "string") {
      payload = unescape(encodeURIComponent(data));
    } else if (data instanceof ArrayBuffer ||
               data.buffer instanceof ArrayBuffer) {
      buffer = data.buffer || data;
      view = new Uint8Array(buffer, data.byteOffset || 0, data.byteLength);
      payload = [];
      for (var i = 0, l = view.byteLength; i < l; i++) {
        payload[i] = String.fromCharCode(view[i]);
      }
    } else if (data.length) {
      payload = [];
      for (var i = 0, l = data.length; i < l; i++) {
        b = (parseInt(data[i]) % 256 + 256) % 256;
        payload[i] = String.fromCharCode(b);
      }
    } else {
      throw new Error("UNSUPPORTED_TYPE_ERR");
    }

    if (payload.length > PAYLOAD_MAX_UTF) {
      throw new Error("OVERFLOW_ERR");
    }
  }

  frame = new Array();
  frame[0] = String.fromCharCode((id >>> 24) & 0xff);
  frame[1] = String.fromCharCode((id >>> 16) & 0xff);
  frame[2] = String.fromCharCode((id >>> 8) & 0xff);
  frame[3] = String.fromCharCode(id & 0xff);
  frame[4] = String.fromCharCode(op << 3 | flag);

  if (payload) {
    frame = frame.concat(payload);
  }

  return btoa(frame.join(""));
}


createFrame = AB_TRANSPORT_SUPPORT ? createFrameBin
                                   : createFrameUtf;


function OpenEvent(target, message, newid, oldid) {
  this.message = message;
  this.newid = newid;
  this.wasRedirected = newid != oldid;
}

OpenEvent.prototype.type = "open";


function MessageEvent(target, flag, data) {
  this.target = target;
  this.dataType = flag & 1 ? "text" : "binary";
  this.priority = (flag >> 1) + 1;
  this.data = data;
}

MessageEvent.prototype.type = "message";


function SignalEvent(target, message) {
  this.target = target;
  this.message = message;
}

SignalEvent.prototype.type = "signal";


function ErrorEvent(target, message) {
  this.target = target;
  this.message = message || "UNKNOWN_ERR";
}

ErrorEvent.prototype.type = "error";



function CloseEvent(target) {
  this.target = target;
}

CloseEvent.prototype.type = "close";


function Channel(url, mode) {
  this.id = null;

  this._connecting = false;
  this._opening = false;
  this._closing = false;
  this._connection = null;
  this._request = null;
  this._mode = null;

  this.url = null;
  this.readyState = 0;

  this.readable = false;
  this.writable = false;
  this.emitable = false;

  this.connect(url, mode);
}


Channel.sizeOf = function() {
  if (AB_TRANSPORT_SUPPORT) {
    
  } else {
    
  }
};


Channel.VERSION = VERSION;


Channel.CONNECTING = Channel.prototype.CONNECTING = 0;
Channel.OPEN = Channel.prototype.OPEN = 1;
Channel.CLOSING = Channel.prototype.CLOSING = 2;
Channel.CLOSED = Channel.prototype.CLOSED = 3;


Channel.prototype.connect = function(url, mode) {
  var parse;
  var self = this;
  var packet;
  var messagesize;
  var request;
  var channel;
  var uri;
  var id;
  var host;
  var mode;
  var token;

  if (this._connecting) {
    throw new Error("ALREADY_CONNECTING_ERR");
  }

  if (typeof url !== "string") {
    throw new Error("bad argument, `url`, expected String");
  }

  if (/^http:\/\/|^https:\/\//.test(url) == false) {
    url = "http://" + url;
  }

  url = parseUri(url);

  if (url.protocol !== "https" && url.protocol !== "http") {
    throw new Error("bad protocol, expected `http` or `https`");
  }

  if ((channel = url.directory) && channel.length != 1) {
    if (channel.substr(0, 2) == "/x") {
      id = parseInt("0" + channel.substr(1));
    } else {
      id = parseInt(channel.substr(1));
    }
    if (isNaN(id)) {
      throw new Error("Invalid channel");
    }
  } else {
    id = 1;
  }

  if (id > 0xFFFFFFFF) {
    throw new Error("Invalid channel expected no between x0 and xFFFFFFFF");
  }

  mode = getBinMode(mode);

  if (typeof mode !== "number") {
    throw new Error("Invalid mode");
  }

  if (url.query) {
    token = decodeURIComponent(url.query);
  }

  this.id = id;
  this._mode = mode;
  this._connecting = true;
  this.url = url.href;

  this.readable = ((this._mode & READ) == READ);
  this.writable = ((this._mode & WRITE) == WRITE);
  this.emitable = ((this._mode & EMIT) == EMIT);

  this.readyState = Channel.CONNECTING;

  this._connection = Connection.getConnection(url, false);
  this._request = this._connection.open(this, id, mode, token);
};


Channel.prototype.send = function(data, priority) {
  var flag = (arguments[1] || 1) - 1;
  var frame;

  if (this.readyState !== Channel.OPEN) {
    throw new Error("INVALID_STATE_ERR");
  }

  if (!this.writable) {
    throw new Error("NOT_WRITABLE_ERR");
  }

  if (flag < 0 || flag > 3 || isNaN(flag)) {
    throw new Error("Bad priority, expected Number between 1-4");
  }

  if (!data || (!data.length && !data.byteLength)) {
    throw new Error("Expected `data`");
  }

  if (typeof data == "string") {
    flag = flag << 1 | 1;
  }

  frame = createFrame(this.id, 0x2, flag, data);

  return this._connection.send(frame);
};


Channel.prototype.emit = function(data) {
  var frame;
  var flushed;

  if (this.readyState !== Channel.OPEN) {
    throw new Error("INVALID_STATE_ERR");
  }

  if (!this.emitable) {
    throw new Error("NOT_EMITABLE_ERR");
  }

  if (typeof data !== "string" || data.length == 0) {
    throw new Error("bad argument, `data`, expected String");
  }

  frame = createFrame(this.id, 0x3, FLAG_EMIT, data);

  return this._connection.send(frame);
};


Channel.prototype.close = function(data) {
  var frame;

  if (this.destroyed || this._closing) {
    return;
  }

  if (data) {
    if (typeof data !== "string" || data.length == 0) {
      throw new Error("bad argument, `data`, expected String");
    }
    this._endsig = data;
  }

  this._destroy();
};


Channel.prototype._destroy = function(err) {
  var frame;

  if (this.destroyed || this._closing || !this.id) {
    return;
  }

  if (!this._connection) {
    finalizeDestroyChannel(this);
    return;
  }

  this.readyState = Channel.CLOSING;

  this.readable = false;
  this.writable = false;
  this.emitable = false;
  this._closing = true;

  // Do not send ENDSIG if _request is present. We need to wait for
  // the OPENSIG before we can close it.
  if (this._request && !this._endsig &&
      this._request.cancel()) {
    this._request = null;
    finalizeDestroyChannel(this, err);
    return;
  }

  // Channel is open and we can therefor send ENDSIG immideitnly. This
  // can fail, if TCP connection is dead. If so, we can
  // destroy channel with good conscience.
  if (!this._request) {
    frame = createFrame(this.id, 0x3, FLAG_END, this._endsig);
    this._endsig = null;
    this._connection.send(frame);
  }
};


function finalizeDestroyChannel(chan, err, message) {
  var id = chan.id;
  var event;
  var conn;

  if (chan.destroyed) {
    return;
  }

  if ((conn = chan._connection) && chan.id) {
    if (conn.channels[id] == chan) {
      delete conn.channels[id];
      conn.chanRefCount--;
      if (conn.chanRefCount == 0 &&
          conn.reqRefCount == 0) {
        conn.setDisposed(true);
      }
    }
  }

  chan.readyState = Channel.CLOSED;

  chan.id = null;
  chan.readable = false;
  chan.writable = false;
  chan.emitable = false;
  chan.destroyed = true;
  chan._request = null;
  chan._connection = null;

  if (err && chan.onerror) {
    event = new ErrorEvent(chan, typeof err == "string" ? err : err.message);
    chan.onerror(event);
  }

  if (chan.onclose) {
    event = new CloseEvent(chan);
    chan.onclose(event);
  }
};


Channel.prototype._open = function(payload, newid) {
  var flushed = false;
  var id = this.id;
  var event;
  var frame;
  var sig;

  this.id = newid;

  this._connecting = false;
  this._request = null;

  this._connection.channels[this.id] = this;
  this._connection.chanRefCount++;

  if (this._closing) {
    frame = createFrame(this.id, 0x3, FLAG_END, this._endsig);
    this._endsig = null;
    this._connection.send(frame);
  } else {
    this.readyState = Channel.OPEN;
    if (this.onopen) {
      event = new OpenEvent(this, payload, newid, id);
      this.onopen(event);
    }
  }
};


// Represents a server connection.
function Connection(id) {
  this.id = id;
  this.chanRefCount = 0;
  this.reqRefCount = 0;
  this.channels = {};
  this.requests = {};
  this.sock = null;
  this.timeout = null;

  Connection.all[id] = this;
}


Connection.all = {};
Connection.disposed = {};


Connection.getConnection = function(url) {
  var id;
  var connection;
  var datacache = "";
  var lastException;

  id = url.protocol + url.host;

  if ((connection = Connection.all[id])) {
    return connection;
  }

  if ((connection = Connection.disposed[id])) {
    connection.setDisposed(false);
    return connection;
  }

  // rewrite url if initial token is present.
  if (url.auth) {
    url = parseUri([
      url.protocol,
      "://",
      url.hostname,
      "/?t=",
      url.auth
    ].join(""));
  }


  connection = new Connection(id);
  connection.connect(url);

  return connection;
}


Connection.prototype.connect = function(url) {
  var self = this;

  if (this.sock) {
    throw new Error("Socket already connected");
  }

  nextTick(function() {
    SocketInterface(url, function(err, sock) {
      var requests = self.requests;

      if (err) {
        return self.destroy(err);
      }

      sockImplementation(self, sock);

      if (self.reqRefCount == 0) {
        // All requests was cancelled before we got a
        // handshake from server. Dispose us.
        self.setDisposed(true);
      }

      for (var id in requests) {
        requests[id].send();
      }
    });
  }, 0);
};


Connection.prototype.open = function(chan, id, mode, token) {
  var self = this;
  var channels = this.channels;
  var oldchan;
  var request;
  var frame;

  if ((oldchan = channels[id]) && !oldchan._closing) {
    nextTick(function() {
      finalizeDestroyChannel(chan, new Error("Channel is already open"));
    });
    return null;
  }

  frame = createFrame(id, 0x1, mode, token);

  request = new OpenRequest(this, id, frame);

  request.onresponse = function(payload, newid) {
    chan._open(payload, newid);
  };

  request.onclose = function(err) {
    if (err) { finalizeDestroyChannel(chan, err); }
  };

  if (this.sock && !oldchan) {
    // Do not send request if socket isnt handshaked yet, or
    // if a channel is open and waiting for an ENDSIG.
    request.send();
  }

  return request;
};


Connection.prototype.setDisposed = function(state) {
  var id = this.id;
  var sock = this.sock;
  var self = this;

  if (!this.id || !sock) return;

  if (state) {

    if (sock) {
      this.timeout = setTimeout(function() {
        self.destroy();
      }, 200);
    }

    Connection.disposed[id] = this;
    Connection.all[id] = undefined;

  } else {

    delete Connection.disposed[id];
    Connection.all[id] = this;

    if (this.timeout) {
      clearTimeout(this.timeout);
    }
  }
};


// Write a `Frame` to the underlying socket.
Connection.prototype.send = function(frame) {
  if (this.sock) {
    return this.sock.send(frame);
  } else {
    return false;
  }
};


// Destroy connection with optional Error
Connection.prototype.destroy = function(err, message) {
  var id = this.id;
  var channels = this.channels;
  var requests = this.requests;
  var chan;
  var request;
  var queued;

  if (!id) {
    return;
  }

  this.id = null;

  for (var chanid in channels) {
    if ((chan = channels[chanid])) {
      finalizeDestroyChannel(chan, err, message);
    }
  }

  for (var reqid in this.requests) {
    if ((request = requests[reqid])) {
      request.destroyAndNext(err);
    }
  }

  this.channels = {};
  this.requests = {};
  this.chanRefCount = 0;
  this.reqRefCount = 0;

  delete Connection.all[id];
  delete Connection.disposed[id];

  if (this.timeout) {
    clearTimeout(this.timeout);
    this.timeout = null;
  }

  if (this.sock) {
    this.sock.close();
    this.sock = null;
  }
};


// Binary message parser
function sockMessageBinImpl(event) {
  var ch;
  var op;
  var flag;
  var buffer;
  var payload;
  var extra;
  var tmp;

  if ((buffer = event.data) instanceof ArrayBuffer == false) {
    return this.destroy(new Error("ERR_UNSUPPORTED_TYPE"));
  }

  if (event.data.byteLength < 5) {
    return this.destroy(new Error("ERR_BAD_HEADER_SIZE"));
  }

  buffer = new Uint8Array(event.data);

  ch = (buffer[1] << 16 |
        buffer[2] << 8 |
        buffer[3]) + (buffer[0] << 24 >>> 0);

  desc = buffer[4];
  op = ((desc >> 1) & 0xf) >> 2;
  flag = (desc << 1 & 0xf) >> 1;

  switch (op) {

    case 0x0: // NOOP
      break;

    case 0x1: // OPEN
      if (flag == OpenRequest.FLAG_REDIRECT) {

        if (buffer.byteLength < 9) {
          return this.destroy(new Error("ERR_BAD_PAYLOAD"));
        }

        extra = (buffer[6] << 16 |
                 buffer[7] << 8 |
                 buffer[8]) + (buffer[5] << 24 >>> 0);

        if (buffer.byteLength > 9) {
          try {
            payload = abtoutf(buffer, 9);
          } catch (err) {
            return this.destroy(new Error("ENCODING_ERR"));
          }
        }

      } else if (buffer.byteLength > 5) {
        try {
          payload = abtoutf(buffer, 5);
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.onopenframe(ch, flag, payload, extra);
      break;

    case 0x2: // DATA
      if (buffer.byteLength > 5) {
        try {
          if (flag & 1) {
            payload = abtoutf(buffer, 5);
          } else {
            tmp = new Uint8Array(buffer.length - 5);
            tmp.set(buffer.subarray(5));
            payload = tmp.buffer;
          }
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.ondataframe(ch, flag, payload);
      break;

    case 0x3: // SIGNAL
      if (buffer.byteLength > 5) {
        try {
          payload = abtoutf(buffer, 5);
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.onsignalframe(ch, flag, payload);
      break;
  }
}


// Utf message parser implementation
function sockMessageUtfImpl(event) {
  var data = event.data;
  var ch;
  var op;
  var flag;
  var buffer;
  var payload;
  var desc;
  var extra;

  if (!data || !data.length) {
    return this.destroy(new Error("ERR_UNSUPPORTED_TYPE"));
  }

  if (data.length < 8) {
    return this.destroy(new Error("BAD_HEADER_SIZE_ERR"));
  }

  try {
    data = atob(data);
  } catch (err) {
    return this.destroy(new Error("ENCODING_ERR"));
  }

  ch = (data.charCodeAt(1) << 16 |
        data.charCodeAt(2) << 8 |
        data.charCodeAt(3)) + (data.charCodeAt(0) << 24 >>> 0);

  desc = data.charCodeAt(4);

  op = ((desc >> 1) & 0xf) >> 2;
  flag = (desc << 1 & 0xf) >> 1;

  switch (op) {

    case 0x0: // NOOP
      break;

    case 0x1: // OPEN
      if (flag == OpenRequest.FLAG_REDIRECT) {
        if (data.length < 9) {
          return this.destroy(new Error("INVALID_PAYLOAD_ERR"));
        }
        try {
          extra = (data.charCodeAt(6) << 16 |
                   data.charCodeAt(7) << 8 |
                   data.charCodeAt(8)) +
                   (data.charCodeAt(5) << 24 >>> 0);
          if (payload.length > 9) {
            payload = decodeURIComponent(escape(data.substr(9)));
          }
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      } else if (data.length > 5) {
        try {
          payload = decodeURIComponent(escape(data.substr(5)));
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.onopenframe(ch, flag, payload, extra);
      break;

    case 0x2: // DATA
      if (data.length > 5) {
        try {
          if (flag & 1) {
            payload = decodeURIComponent(escape(data.substr(5)));
          } else {
            payload = atobin(data.substr(5));
          }
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.ondataframe(ch, flag, payload);
      break;

    case 0x3: // SIGNAL
      if (data.length > 5) {
        try {
          payload = decodeURIComponent(escape(data.substr(5)));
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.onsignalframe(ch, flag, payload);
      break;
  }
}


// OpenRequest constructor.
function OpenRequest(conn, id, frame) {
  var requests = conn.requests;
  var frame;
  var next;

  this.conn = conn;
  this.id = id;
  this.frame = frame;
  this.present = false;
  this.sent = false;
  this.destroyed = false;

  this.prev = null;
  this.next = null;

  if ((next = requests[id.toString()])) {
    while (next.next && (next = next.next)) {};
    next.next = this;
  } else {
    requests[id] = this;
  }

  conn.reqRefCount++;
}


// Open Flags
OpenRequest.FLAG_ALLOW = 0x0;
OpenRequest.FLAG_REDIRECT = 0x1;
OpenRequest.FLAG_DENY = 0x7;


OpenRequest.prototype.send = function() {
  var self = this;

  if (this.present) {
    return;
  }

  this.present = true;

  if (this.sent) {
    throw new Error("OpenRequest is already sent");
  }

  nextTick(function() {
    if (self.destroyed) return;
    self.sent = true;
    self.conn.send(self.frame);
  });

};


OpenRequest.prototype.cancel = function() {
  var id = this.id;
  var conn = this.conn;
  var requests = conn.requests;
  var next;


  if (this.sent) {
    // We cannot cancel if request is already sent.

    return false;
  }

  if (requests[id] == this) {
    if (this.next) {
      requests[id] = this.next;
    } else {
      delete requests[id];
    }
  } else if (this.prev) {
    this.prev = this.next;
  }

  this.destroy();

  return true;
};


OpenRequest.prototype.destroy = function(err, message) {
  var conn;

  if (!this.destroyed) {
    if ((conn = this.conn) && conn.id) {
      conn.reqRefCount--;
      if (conn.reqRefCount == 0 &&
          conn.chanRefCount == 0) {
        conn.setDisposed(true);
      }
    }
    this.onclose && this.onclose(err, message);
    this.destroyed = true;
  }
};


// Destroy this OpenRequest and all other in chain
OpenRequest.prototype.destroyAndNext = function(err) {
  if (this.next) {
    this.next.destroyAndNext(err);
  }
  this.destroy(err);
}


OpenRequest.prototype.processResponse = function(flag, payload, extra) {
  var conn = this.conn;
  var request;
  var err;
  var content;

  if (this.next) {
    if (flag == OpenRequest.FLAG_ALLOW) {
      this.next.destroyAndNext(new Error("Channel is already open"));
    } else {
      this.next.prev = null;
      conn.requests[this.id] = this.next;
      conn.requests[this.id].send();
    }
  } else {
    delete conn.requests[this.id];
  }

  switch (flag) {

    case OpenRequest.FLAG_ALLOW:
      this.onresponse(payload, this.id);
      this.destroy();
      break;

    case OpenRequest.FLAG_REDIRECT:
      this.onresponse(payload, extra);
      this.destroy();
      break;

    default:
      this.destroy(new Error(payload || "ERR_OPEN_DENIED"));
      break;
  }
};


function sockImplementation(conn, sock) {

  conn.sock = sock;

  sock.onerror = function(event) {
    conn.sock = null;
    conn.destroy(event);
  };

  sock.onclose = function(event) {
    var msg = "Connection reseted by server";
    self.sock = null;
    if (event && event.code) {
      msg += "(" + event.code + (event.reason ? " " + event.reason : "") + ")";
    }
    conn.destroy(new Error(msg));
  };

  sock.onopenframe = function(id, flag, payload, extra) {
    var request;

    if (!(request = conn.requests[id])) {
      conn.destroy(new Error("UNKNOW_CHANNEL_ERR"));
      return;
    }

    request.processResponse(flag, payload, extra);
  };

  sock.ondataframe = function(id, flag, payload) {
    var channels = conn.channels;
    var event;
    var chan;

    if (id === ALL_CHANNELS) {
      for (var chanid in channels) {
        chan = channels[chanid];
        if (chan.readable && chan.onmessage) {
          event = new MessageEvent(chan, flag, payload);
          chan.onmessage(event);
        }
      }
    } else if ((chan = channels[id])) {
      if (chan.readable && chan.onmessage) {
        event = new MessageEvent(chan, flag, payload);
        chan.onmessage(event);
      }
    }
  };

  sock.onsignalframe = function(id, flag, payload) {
    var channels = conn.channels;
    var requests = conn.requests;
    var frame;
    var chan;
    var message;
    var event;

    switch (flag) {

      case FLAG_EMIT:
        if (id === ALL_CHANNELS) {
          for (var chanid in channels) {
            chan = channels[chanid];
            if (chan._closing == false && chan.onsignal) {
              event = new SignalEvent(chan, payload);
              chan.onsignal(event);
            }
          }
        } else if ((chan = channels[id])) {
          if (chan._closing == false && chan.onsignal) {
            event = new SignalEvent(chan, payload);
            chan.onsignal(event);
          }
        }
        break;

      case FLAG_END:
      case FLAG_ERROR:

        if (id === ALL_CHANNELS) {
          if (flag != FLAG_END) {
            conn.destroy(new Error(payload || "ERR_UNKNOWN"));
          } else {
            conn.destroy(null, payload);
          }
          return;
        }

        if (!(chan = channels[id])) {
          // Protocol violation. Channel does not exists in client. Ignore
          // for now.

          return;
        }

        if (chan._closing) {
          // User requested to close this channel. This ENDSIG is a
          // response to that request. It is now safe to destroy
          // channel. Note: We are intentionally not sending the message
          // to the function, because channel is closed according
          // to client.

          finalizeDestroyChannel(chan);

          if (requests[id]) {
            // Send pending open request if exists.
            requests[id].send();
          }

        } else {
          // Server closed this channel. We need to respond with a
          // ENDSIG in order to let server now that we received this
          // signal.

          frame = createFrame(id, 0x3, FLAG_END);
          conn.send(frame);

          if (flag != FLAG_END) {
            finalizeDestroyChannel(chan, new Error(payload || "ERR_UNKNOWN"));
          } else {
            finalizeDestroyChannel(chan, null, payload);
          }
        }
        break;

      default:
        conn.destroy(new Error("Server sent an unknown SIGFLAG"));
        return;
    }

  };

}


// Returns the binary representation of a mode expression. Returns null
// on invalid mode.
function getBinMode(modeExpr) {
  var result = 0;
  var match;

  if (!modeExpr) {
    return 0;
  }

  if (typeof modeExpr !== "string" || !(match = modeExpr.match(MODE_RE))) {
    return null;
  }

  match[1] && (result |= READ);
  match[2] && (result |= WRITE);
  match[3] && (result |= EMIT);

  return result;
}


function WebSocketInterface(url, C) {
  return function(url, C) {
    var subs;
    var sock;

    url = url.protocol == "http" ? "ws://" + url.addr : "wss://" + url.addr;

    subs = ["wsutf.winkprotocol.org"];

    if (AB_TRANSPORT_SUPPORT) {
      subs.unshift("wsbin.winkprotocol.org");
    }

    sock = new WebSocket(url, subs);

    sock.binaryType = "arraybuffer";

    sock._destroyed = false;

    sock.onmessage = AB_TRANSPORT_SUPPORT ? sockMessageBinImpl
                                          : sockMessageUtfImpl;

    sock.onopen = function() {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(null, sock);
    };


    sock.onclose = function() {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(new Error("Faild to connect to remote"));
    };


    sock.onerror = function(err) {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(err);
    };


    sock.destroy = function(err) {

      if (this._destroyed) {
        return;
      }

      this._destroyed = true;

      if (err) {
        this.onerror && this.onerror(err);
      }

      this.close();
    };

  };
}


function FlashSocketInterface() {
  var exports = { onhandshake: 1, onready: 1, onopen: 1,
                  onclose: 1, onerror: 1, onmessage: 1 };

  function FlashSocket(url) {
    this.id = FlashSocket.incr++;
    this.url = url;
    this.connected = false;
    FlashSocket.all[this.id] = this;
    if (!FlashSocket.bridge) return FlashSocket.embed();
    if (FlashSocket.flashready) this.connect();
  }

  Channel.__bridge = FlashSocket;

  FlashSocket.all = {};
  FlashSocket.incr = 1;
  FlashSocket.flashready = false;
  FlashSocket.bridge = null;

  FlashSocket.embed = function() {
    var body = document.getElementsByTagName('body')[0];
    var str = [];
    var vars = [];
    var flashid;
    var codebase;
    var pluginpage;
    var path;
    var bridge;
    var tmpl;

    for (var key in exports) {
      vars.push(key + "=" + TARGET_NAME + ".__bridge." + key);
    }

    codebase = "http://fpdownload.macromedia.com/pub/shockwave/cabs/"
               "flash/swflash.cab#version=9,0,0,0";

    pluginpage = "http://www.macromedia.com/go/getflashplayer";

    path = "bridge10.swf";

    str[0 ] = '<object classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000"' +
              ' codebase="' +  codebase + '"' +
              ' width="1" height="1"';
    str[1 ] = '<param name="allowScriptAccess" value="always"></param>';
    str[2 ] = '<param name="allowNetworking" value="true"></param>';
    str[3 ] = '<param name="movie" value="' + path + '"></param>';
    str[4 ] = '<param name="quality" value="low"></param>';
    str[5 ] = '<param name="menu" value="false"></param>';
    str[6 ] = '<param name="FlashVars" value="' + vars.join("&") + '">';
    str[7 ] = '</param><param name="bgcolor" value="#ffffff"></param>';
    str[8 ] = '<param name="wmode" value="transparent"></param>';
    str[9 ] = '<embed src="' + path + '" quality="low" bgcolor="#ffffff"' +
              ' wmode="transparent" width="1" height="1"' +
              ' swLiveConnect="true" allowScriptAccess="always"' +
              ' allowNetworking="true" menu="false"' +
              ' type="application/x-shockwave-flash"' +
              ' FlashVars="' + vars.join("&") + '"' +
              ' pluginspage="' + pluginpage + '"/>';
    str[10] = '</object>';


    tmpl = document.createElement("div");
    tmpl.innerHTML = str.join("");
    bridge = tmpl.childNodes[0];
    bridge.style.position = "absolute";
    bridge.style.top = "0";
    bridge.style.left = "0";
    bridge.style.width = "1px";
    bridge.style.height = "1px";
    bridge.style.zIndex = "-100000";

    for (var i = 0; i < bridge.childNodes.length; i++) {
      if (bridge.childNodes[i].nodeName.toUpperCase() == "EMBED") {
        bridge = bridge.childNodes[i];
        break;
      }
    }

    body.appendChild(bridge);
    FlashSocket.bridge = bridge;
  };


  FlashSocket.onhandshake = function() {
    console.log("ready");
    return true;
  };


  FlashSocket.onready = function() {
    var all = FlashSocket.all;
    var url;
    FlashSocket.flashready = true;
    console.log("READY CALLBACK");
    for (var id in all) {
      url = all[id].url.protocol + "://" + all[id].url.addr;
      FlashSocket.bridge.init(all[id].id, url);
    }
  };


  FlashSocket.onopen = function(id) {
    var sock;
    console.log("onopen");
    if ((sock = FlashSocket.all[id]) && sock.onopen) {
      sock.connected = true;
      sock.onopen();
    }
  };


  FlashSocket.onerror = function(id, err) {
    var sock;
    if ((sock = FlashSocket.all[id])) {
      sock.destroy(new Error(err || "unknown bridge socket error"));
    }
  };


  FlashSocket.onclose = function(id) {
    var sock;
    if ((sock = FlashSocket.all[id]) && sock.onclose) {
      sock.destroy();
    }
  };


  FlashSocket.onmessage = function(id, data) {
    var sock;
    if ((sock = FlashSocket.all[id])) {
      sock.onmessage({ data: data });
    }
  };


  FlashSocket.prototype.onmessage = sockMessageUtfImpl;


  FlashSocket.prototype.send = function(data) {
    FlashSocket.bridge.send(this.id, data);
  };


  FlashSocket.prototype.close = function() {
    this.destroy();
  };


  FlashSocket.prototype.destroy = function(err) {

    if (!this.id) return;

    if (this.connected) {
      FlashSocket.bridge.close(this.id);
    }

    delete FlashSocket.all[this.id];

    this.id = null;

    if (err) {
      this.onerror && this.onerror(err);
    }

    this.onclose && this.onclose();
  };


  return function (url, C) {
    var sock = new FlashSocket(url);

    sock.onopen = function() {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(null, sock);
    };

    sock.onclose = function() {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(new Error("Faild to connect to remote"));
    };

    sock.onerror = function(err) {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(err);
    };
  };
}


function CometSocketInterface() {
  var idprefix = "__" + TARGET_NAME.toLowerCase() + "__"
  var idsuffix = "__bridge__";
  var origin = global.location.origin;

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
    var id = event.data.substr(0, 8);
    var sock;

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

    src = url.protocol +
          "://" +
          url.authority +
          COMET_HANDSHAKE_PATH +
          "?origin=" + origin;

    this.elem = document.createElement('iframe');
    this.elem.setAttribute("id", idprefix + this.id + idsuffix);
    this.elem.src = src;
    this.elem.onload = function() {
      self.bridge = this.contentWindow;
      self.bridge.postMessage(id + token, "*");
    };

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
        this.onmessage(payload);
        break;

      default:
        this.destroy(new Error("BAD_OP(" + op + ")"));
        break;
    }
  };


  CometSocket.prototype.onmessage = sockMessageUtfImpl;


  CometSocket.prototype.send = function(data) {
    this.bridge.postMessage("\x03" + data, this.origin);
  };


  CometSocket.prototype.close = function() {
    this.destroy();
  };


  CometSocket.prototype.destroy = function(err) {
    var body;

    if (!this.id) return;

    if (this.handshakeTimeout) {
      clearTimeout(this.handshakeTimeout);
    }

    if (this.bridge) {
      this.bridge.postMessage("\x02", "*");
      this.bridge = null;
    }

    if (this.elem) {
      this.elem.onload = null;
      body = document.getElementsByTagName('body')[0];
      try { body.removeChild(this.elem); } catch (err) { }
      this.elem = null;
    }

    this.messageHandler = null;

    delete CometSocket.all[this.id];
    CometSocket.count--;

    if (CometSocket.count == 0) {
      global.removeEventListener("message", messageHandler, false);
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


  return function (url, C) {
    var sock = new CometSocket(url);

    sock.onopen = function() {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(null, sock);
    };

    sock.onclose = function() {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(new Error("Faild to connect to remote"));
    };

    sock.onerror = function(err) {
      sock.onopen = sock.onclose = sock.onerror = null;
      return C(err);
    };
  };
}

global[TARGET_NAME] = Channel;

SocketInterface = WebSocketInterface();

})(typeof window == "undefined" ? this : window);