(function(global) {

var TARGET_NAME = "HydnaChannel";
var FORCE_TRANSPORT = "flash";


if (TARGET_NAME in global) {
  throw new Error("Target name already taken, or library already loaded");
}




// parseUri 1.2.2
// (c) Steven Levithan <stevenlevithan.com>
// MIT License
// Move this to deps.
function parseUri (str) {
	var	o   = parseUri.options,
		m   = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
		uri = {},
		i   = 14;

	while (i--) uri[o.key[i]] = m[i] || "";

	uri[o.q.name] = {};
	uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
		if ($1) uri[o.q.name][$1] = $2;
	});

	return uri;
};

parseUri.options = {
	strictMode: false,
	key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
	q:   {
		name:   "queryKey",
		parser: /(?:^|&)([^&=]*)=?([^&]*)/g
	},
	parser: {
		strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
		loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
	}
};


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


function utftoab(s) {
	var chars = unescape(encodeURIComponent(s));
	var result = new Uint8Array(chars.length);

	for (var i = 0, l = chars.length; i < l; i++) {
		result[i] = chars.charCodeAt(i);
  }

	return new Uint8Array(result);
}


function abtoutf(ab, offset) {
	var result = [];

  for (var i = offset, l = ab.byteLength; i < l; i++) {
		result.push(String.fromCharCode(ab[i]));
  }

	return decodeURIComponent(escape(result.join("")));
}


// Converts an array with numbers to an ArrayBuffer
function arrtoab(arr) {
  var bytes = new Uint8Array(arr.length);
  var b;

  for (var i = 0, l = arr.length; i < l; i++) {
    bytes[i] = parseInt(arr[i]);
  }
  return bytes.buffer;
}


// Converts an ArrayBuffer to an array with numbers
function abtoarr(ab) {
  var arr = [];
  for (var i = 0, l = ab.byteLength; i < l; i++) {
    arr[i] = ab[i];
  }
  return arr;
}


// Converts an array with numbers to base64-string
function arrtoa(arr) {
  var bytes = [];
  var b;
  for (var i = 0, l = arr.length; i < l; i++) {
    b = (parseInt(arr[i]) % 256 + 256) % 256;
    bytes[i] = String.fromCharCode(b);
  }
  return btoa(bytes.join(""));
}


// Converts a base64-string to an array with number.
function atoarr(a) {
  var arr = [];
  a = atob(a);
  for (var i = 0, l = a.length; i < l; i++) {
    arr[i] = a.charCodeAt(i);
  }
  return arr;
}

// Converts an ArrayBuffer to Base-64
function abtoa(ab, off, len) {
  var view = new Uint8Array(ab, off, len);
  var bytes = [];
  for (var i = 0, l = view.byteLength; i < l; i++) {
    bytes[i] = String.fromCharCode(view[i]);
  }
  return btoa(bytes.join(""));
}

// Converts a Base-64 string to a ArrayBuffer
function atoab(a) {
  var ab;
  a = atob(a);
  ab = new Uint8Array(a.length);
  for (var i = 0, l = a.length; i < l; i++) {
    ab[i] = a.charCodeAt(i);
  }
  return ab.buffer;
}

// Converts a UTF8-String to a Base-64 string
function utftoa(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

// Converts a Base-64 string into a UTF8-String
function atoutf(a) {
	return decodeURIComponent(escape(atob(a)));
}

var VERSION = "1.0rc";

var READ = 0x01;
var WRITE = 0x02;
var READWRITE = 0x03;
var EMIT = 0x04;

// Packet related sizes
var MAX_PAYLOAD_SIZE = 10240;

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


var WebSocket = global.WebSocket;

// Mozilla-based browsers prefixed the WebSocket object. Map
// it to a local instead

if (typeof MozWebSocket !== "undefined") {
  WebSocket = MozWebSocket;
}

var AB_TRANSPORT_SUPPORT = false;
var PAYLOAD_MAX_SIZE = 0;
var frameSet = null;
var frameToBuffer = null;
var messageParser = null;


// Test if we support binary. This is awful, but the only
// way that is working right now.
if (WebSocket) {
// (function() {
//   var ws = new WebSocket("ws://localhost:7010");
//   AB_TRANSPORT_SUPPORT = "binaryType" in ws;
//   ws.close();
// })();
}

function Channel(url, mode) {
  this.id = null;

  this._connecting = false;
  this._opening = false;
  this._closing = false;
  this._connection = null;
  this._request = null;
  this._mode = null;
  this._writeQueue = null;

  this.url = null;
  this.readyState = 0;

  this.readable = false;
  this.writable = false;
  this.emitable = false;

  this.connect(url, mode);
}

Channel.VERSION = VERSION;

Channel.CONNECTING = Channel.prototype.CONNECTING = 0;
Channel.OPEN = Channel.prototype.OPEN = 1;
Channel.CLOSING = Channel.prototype.CLOSING = 2;
Channel.CLOSED = Channel.prototype.CLOSED = 3;


Channel.prototype.onopen = function(e) { };
Channel.prototype.onmessage = function(e) {};
Channel.prototype.onerror = function(e) {};
Channel.prototype.onclose = function(e) {};


Channel.prototype.connect = function(url, mode) {
  var parse;
  var self = this;
  var packet;
  var messagesize;
  var request;
  var uri;
  var id;
  var host;
  var mode;
  var token;

  if (this._connecting) {
    throw new Error("Already connecting");
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

  if (url.pathname && url.pathname.length != 1) {
    if (url.pathname.substr(0, 2) == "/x") {
      id = parseInt("0" + url.pathname.substr(1));
    } else {
      id = parseInt(url.pathname.substr(1));
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
    token = new Buffer(decodeURIComponent(uri.query), "utf8");
  }

  this.id = id;
  this._mode = mode;
  this._connecting = true;
  this.url = url.href;

  this.readable = ((this._mode & READ) == READ);
  this.writable = ((this._mode & WRITE) == WRITE);
  this.emitable = ((this._mode & EMIT) == EMIT);

  this._connection = Connection.getConnection(url, false);
  this._request = this._connection.open(this, id, mode, token);
};


Channel.prototype.send = function(data, priority) {
  var flag = (arguments[1] || 1) - 1;
  var frame;

  if (!this.writable) {
    throw new Error("Channel is not writable");
  }

  if (flag < 0 || flag > 3 || isNaN(flag)) {
    throw new Error("Bad priority, expected Number between 1-4");
  }

  if (!data || (!data.length && !data.byteLength)) {
    throw new Error("Expected `data`");
  }

  frame = DataFrame.createFrame(this.id, flag, data);

  try {
    flushed = this._writeOut(frame);
  } catch (err) {
    this._destroy(err);
    return false;
  }

  return flushed;
};


Channel.prototype.emit = function(data) {
  var frame;
  var flushed;

  if (!this.emitable) {
    throw new Error("Channel is not emitable.");
  }

  if (typeof data !== "string" || data.length == 0) {
    throw new Error("bad argument, `data`, expected String");
  }

  frame = SignalFrame.createFrame(this.id, SignalFrame.FLAG_EMIT, data);

  try {
    flushed = this._writeOut(frame);
  } catch (writeException) {
    this.destroy(writeException);
    return false;
  }

  return flushed;
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
    frame = SignalFrame.createFrame(this.id, SignalFrame.FLAG_END, data);
  } else {
    frame = SignalFrame.createFrame(this.id, SignalFrame.FLAG_END, null);
  }

  this._endsig = frame;

  this._destroy();
};


Channel.prototype._destroy = function(err) {
  var sig;

  if (this.destroyed || this._closing || !this.id) {
    return;
  }

  if (!this._connection) {
    finalizeDestroyChannel(this);
  }

  this.readable = false;
  this.writable = false;
  this.emitable = false;
  this._closing = true;

  if (this._request && !this._endsig &&
      this._request.cancel()) {
    this._request = null;
    finalizeDestroyChannel(this, err);
    return;
  }

  sig = this._endsig || new SignalFrame(this.id, SignalFrame.FLAG_END);

  if (this._request) {
    // Do not send ENDSIG if _request is present. We need to wait for
    // the OPENSIG before we can close it.

    this._endsig = sig;
  } else {
    // Channel is open and we can therefor send ENDSIG immideitnly. This
    // can fail, if TCP connection is dead. If so, we can
    // destroy channel with good conscience.

    try {
      this._writeOut(sig);
    } catch (err) {
      // ignore
    }
  }
};


function finalizeDestroyChannel(chan, err, message) {
  var id = chan.id;
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

  chan.id = null;
  chan.readable = false;
  chan.writable = false;
  chan.emitable = false;
  chan.destroyed = true;
  chan._request = null;
  chan._writequeue = null;
  chan._connection = null;

  err && chan.onerror && chan.onerror(err);

  chan.onclose && chan.onclose();
};


Channel.prototype.onsignal = function(data, start, end) {
  var message = null;

  if (end - start) {
    message = data.toString("utf8", start, end);
  }

  if (this._events && this._events["signal"]) {
    this.emit("signal", message);
  }
};


// Internal write method to write raw packets.
Channel.prototype._writeOut = function(packet) {
  var written;

  if (this._writeQueue) {
    this._writeQueue.push(packet);
    return false;
  }

  if (this._connecting) {
    this._writeQueue = [packet];
    return false;
  } else if (this._connection) {
    return this._connection.send(packet);
  } else {
    this.destroy(new Error("Channel is not writable"));
    return false;
  }
};


Channel.prototype._open = function(newid) {
  var flushed = false;
  var queue = this._writeQueue;
  var id = this.id;
  var packet;

  this.id = newid;
  this._connecting = false;
  this._writeQueue = null;
  this._request = null;

  this._connection.channels[this.id] = this;
  this._connection.chanRefCount++;

  if (queue && queue.length) {
    for (var i = 0, l = queue.length; i < l; i++) {
      packet = queue[i];
      packet.id = newid;
      try {
        flushed = this._writeOut(packet);
      } catch(writeException) {
        this.destroy(writeException);
        return;
      }
    }
  }

  if (this._closing) {
    if ((packet = self._endsig)) {
      self._endsig = null;
      packet.id = newid;
      try {
        this._writeOut(packet);
      } catch (err) {
        // Ignore
      }
      return;
    }
  }

  this.onopen && this.onopen();
};

function OpenEvent(data) {
  this.data = data;
}

OpenEvent.prototype.type = "open";

function MessageEvent(target, flag, data) {
  this.target = target;
  this.binary = flag & 1;
  this.priority = (flag >> 1) + 1;
  this.data = data;
}

MessageEvent.prototype.type = "message";


function ErrorEvent(message) {
  this.message = message;
}

ErrorEvent.prototype.type = "error";


function CloseEvent(message) {
  this.message = message;
}

CloseEvent.prototype.type = "close";



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

      try {
        for (var id in requests) {
          self.send(requests[id]);
          requests[id].sent = true;
        }
      } catch (err) {
        self.destroy(err);
      }
    });
  }, 0);
};


Connection.prototype.open = function(chan, id, mode, token) {
  var self = this;
  var channels = this.channels;
  var oldchan;
  var request;

  if ((oldchan = channels[id]) && !oldchan._closing) {
    nextTick(function() {
      finalizeDestroyChannel(chan, new Error("Channel is already open"));
    });
    return null;
  }

  request = OpenRequest.createFrame(this, id, mode, token);

  request.onresponse = function(newid) {
    chan._open(newid);
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
    return this.sock.send(frame.toBuffer());
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


function binFrameSet(data) {
  if (typeof data == "string") {
    this.flag = this.flag << 1 | 1;
    this.data = utftoab(data);
    this.len = this.data.byteLength;
  } else if (data instanceof ArrayBuffer) {
    this.flag = this.flag << 1 | 0; // binary
    this.data = data;
    this.len = data.byteLength;
  } else if (data.buffer instanceof ArrayBuffer) {
    this.flag = this.flag << 1 | 0; // binary
    this.data = data.buffer;
    this.off = data.byteOffset;
    this.len = data.byteLength;
  } else if (data.length) {
    this.flag = this.flag << 1 | 0; // binary
    this.data = arrtoab(data);
    this.len = this.data.byteLength;
  } else {
    throw new Error("Unsupported data type");
  }
}


function binFrameToBuffer() {
  var id = this.id;
  var data = this.data;
  var view;
  var payload;
  var buffer;
  var length;

  length = 5 + this.len;
  buffer = new ArrayBuffer(length);

  view = new Uint8Array(buffer)
  view[0] = id >>> 24;
  view[1] = id >>> 16;
  view[2] = id >>> 8;
  view[3] = id % 256;
  view[4] = this.desc;

  if (length > 5) {
    payload = new Uint8Array(data, this.off, this.len);
    view.set(payload, 5);
  }

  return buffer;
}


// Binary message parser
function binMessageParser(event) {
  var ch;
  var op;
  var flag;
  var buffer;
  var payload;

  if ((buffer = event.data) instanceof ArrayBuffer == false) {
    return this.onerror && this.onerror(new Error("ERR_UNSUPPORTED_TYPE"));
  }

  if (event.data.byteLength < 5) {
    return this.onerror && this.onerror(new Error("ERR_BAD_HEADER_SIZE"));
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
      if (buffer.byteLength > 5) {
        if (flag == OpenRequest.FLAG_REDIRECT) {
          if (buffer.byteLength < 9) {
            return this.onerror && this.onerror(
                                          new Error("ERR_BAD_PAYLOAD"));
          }
          payload = (buffer[6] << 16 |
                     buffer[7] << 8 |
                     buffer[8]) + (buffer[5] << 24 >>> 0);
        } else {
          payload = abtoutf(buffer, 5);
        }
      }
      this.onopenframe(ch, flag, payload);
      break;

    case 0x2: // DATA
      if (flag & 1) {
        payload = abtoutf(buffer, 5);
      } else {
        // TODO: Only a sub-set, make a `real` arraybuffer instead.
        payload = buffer.subarray(5);
      }
      this.ondataframe(ch, flag, payload);
      break;

    case 0x3: // SIGNAL
      if (buffer.byteLength > 5) {
        payload = abtoutf(buffer, 5);
      }
      this.onsignalframe(ch, flag, payload);
      break;
  }
}


function b64FrameSet(data) {
  if (typeof data == "string") {
    this.flag = this.flag << 1 | 1;
    this.data = utftoa(data);
    this.len = this.data.length;
  } else if (data instanceof ArrayBuffer) {
    this.flag = this.flag << 1 | 0; // binary
    this.data = abtoa(data, 0, data.byteLength);
    this.len = this.data.length;
  } else if (data.buffer instanceof ArrayBuffer) {
    this.flag = this.flag << 1 | 0; // binary
    this.data = abtoa(data, data.byteOffset, data.byteLength);
    this.len = this.data.length;
  } else if (data.length) {
    this.flag = this.flag << 1 | 0; // binary
    this.data = arrtoa(data);
    this.len = this.data.length;
  } else {
    throw new Error("Unsupported data type");
  }
}


function b64FrameToBuffer() {
  var id = this.id;
  var view;

  view = new Array();
  view[0] = String.fromCharCode(id >>> 24);
  view[1] = String.fromCharCode(id >>> 16);
  view[2] = String.fromCharCode(id >>> 8);
  view[3] = String.fromCharCode(id % 256);
  view[4] = String.fromCharCode(this.desc);

  view = btoa(view.join(""));

  if (this.len) {
    view += this.data;
  }

  return view;
}


// Base64 message parser
function b64MessageParser(event) {
  var data = event.data;
  var ch;
  var op;
  var flag;
  var buffer;
  var payload;
  var head;
  var desc;

  if (!data || !data.length) {
    return this.destroy(new Error("ERR_UNSUPPORTED_TYPE"));
  }

  if (data.byteLength < 8) {
    return this.destroy(new Error("ERR_BAD_HEADER_SIZE"));
  }

  head = atob(data.substr(0, 8));
  payload = data.substr(8);

  ch = (head.charCodeAt(1) << 16 |
        head.charCodeAt(2) << 8 |
        head.charCodeAt(3)) + (head.charCodeAt(0) << 24 >>> 0);

  desc = head.charCodeAt(4);

  op = ((desc >> 1) & 0xf) >> 2;
  flag = (desc << 1 & 0xf) >> 1;

  switch (op) {

    case 0x0: // NOOP
      break;

    case 0x1: // OPEN
      if (payload && payload.length) {
        if (flag == OpenRequest.FLAG_REDIRECT) {
          payload = atob(payload);
        } else {
          payload = atoutf(payload);
        }
      }
      this.onopenframe(ch, flag, payload);
      break;

    case 0x2: // DATA
      if (flag & 1) {
        payload = atoutf(payload);
      } else {
        payload = atobin(payload);
      }
      this.ondataframe(ch, flag, payload);
      break;

    case 0x3: // SIGNAL
      if (payload && payload.length) {
        payload = atoutf(payload);
      }

      this.onsignalframe(ch, flag, payload);
      break;
  }
}


if (AB_TRANSPORT_SUPPORT) {
  PAYLOAD_MAX_SIZE = 0xfff8;
  frameSet = binFrameSet;
  frameToBuffer = binFrameToBuffer;
  messageParser = binMessageParser;
} else {
  PAYLOAD_MAX_SIZE = 0x1554c;
  frameSet = b64FrameSet;
  frameToBuffer = b64FrameToBuffer;
  messageParser = b64MessageParser;
}


// OpenRequest constructor.
function OpenRequest(conn, id, flag) {
  var requests = conn.requests;
  var next;

  this.conn = conn;
  this.id = id;
  this.desc = 0x1 << 3 | flag;
  this.flag = flag;
  this.data = null;
  this.off = 0;
  this.len = 0;
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


OpenRequest.createFrame = function(conn, id, flag, data) {
  var frame = new OpenRequest(conn, id, flag);

  if (data && data.length) {

    if (typeof data !== "string") {
      throw new Error("Expected String");
    }

    frame.set(data);

    if (frame.off + frame.len > DataFrame.MAX_PAYLOAD_SIZE) {
      throw new Error("Cannot send data, max length reach.");
    }
  }

  return frame;
};


OpenRequest.prototype.set = frameSet;
OpenRequest.prototype.toBuffer = frameToBuffer;


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
    self.sent = true;
    try {
      self.conn.send(self);
    } catch (err) {
      self.conn.destroy(err);
    }
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


OpenRequest.prototype.processResponse = function(flag, payload) {
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
      this.onresponse(this.id);
      this.destroy();
      break;

    case OpenRequest.FLAG_REDIRECT:
      this.onresponse(payload);
      this.destroy();
      break;

    default:
      this.destroy(new Error(payload || "ERR_OPEN_DENIED"));
      break;
  }
};


function DataFrame(id, flag) {
  this.id = id;
  this.desc = 0x2 << 3 | flag;
  this.flag = flag;
  this.data = null;
  this.off = 0;
  this.len = 0;
}


DataFrame.createFrame = function(id, flag, data) {
  var frame = new DataFrame(id, flag);

  if (data) {
    frame.set(data);

    if (frame.off + frame.len > DataFrame.MAX_PAYLOAD_SIZE) {
      throw new Error("Cannot send data, max length reach.");
    }
  }

  return frame;
};


DataFrame.prototype.set = frameSet;
DataFrame.prototype.toBuffer = frameToBuffer;


function SignalFrame(id, flag) {
  this.id = id;
  this.desc = 0x3 << 3 | flag;
  this.flag = flag;
  this.data = null;
  this.off = 0;
  this.len = 0;
}

// Signal flags
SignalFrame.FLAG_EMIT = 0x0;
SignalFrame.FLAG_END = 0x1;
SignalFrame.FLAG_ERROR = 0x7;


SignalFrame.createFrame = function(id, flag, data) {
  var frame = new SignalFrame(id, flag);

  if (data && data.length) {

    if (typeof data !== "string") {
      throw new Error("Expected String");
    }

    frame.set(data);

    if (frame.off + frame.len > SignalFrame.MAX_PAYLOAD_SIZE) {
      throw new Error("Cannot send data, max length reach.");
    }
  }

  return frame;
};


SignalFrame.prototype.set = frameSet;
SignalFrame.prototype.toBuffer = frameToBuffer;


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
      msg = event.code + " " + event.reason;
    }
    conn.destroy(new Error(msg));
  };

  sock.onopenframe = function(id, flag, payload) {
    var request;

    if (!(request = conn.requests[id])) {
      conn.destroy(new Error("Server sent an open response to unknown"));
      return;
    }

    request.processResponse(flag, payload);
  };

  sock.ondataframe = function(id, flag, payload) {
    var channels = conn.channels;
    var event;
    var chan;

    if (id === ALL_CHANNELS) {
      for (var chanid in channels) {
        chan = channels[chanid];
        if (chan.readable) {
          event = new MessageEvent(chan, flag, payload);
          chan.onmessage && chan.onmessage(event);
        }
      }
    } else if ((chan = channels[id])) {
      if (chan.readable) {
        event = new MessageEvent(chan, flag, payload);
        chan.onmessage && chan.onmessage(event);
      }
    }
  };

  sock.onsignalframe = function(id, flag, payload) {
    var channels = conn.channels;
    var requests = conn.requests;
    var chan;
    var message;

    switch (flag) {

      case SignalFrame.FLAG_EMIT:
        if (id === ALL_CHANNELS) {
          for (var chanid in channels) {
            chan = channels[chanid];
            if (chan._closing == false) {
              chan.onsignal && chan.onsignal(payload);
            }
          }
        } else if ((chan = channels[id])) {
          if (chan._closing == false) {
            chan.onsignal && chan.onsignal(payload);
          }
        }
        break;

      case SignalFrame.FLAG_END:
      case SignalFrame.FLAG_ERROR:

        if (id === ALL_CHANNELS) {
          if (flag != SignalFrame.FLAG_END) {
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

          try {
            conn.send(new SignalFrame(id, SignalFrame.FLAG_END));
          } catch (err) {
            conn.destroy(err);
          }

          if (flag != SignalFrame.FLAG_END) {
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

    url = url.protocol == "http" ? "ws://" + url.authority
                                 : "wss://" + url.authority;

    subs = ["wsb64.winkprotocol.org"];

    if (AB_TRANSPORT_SUPPORT) {
      subs.unshift("wsbin.winkprotocol.org");
    }

    sock = new WebSocket(url, subs);

    sock.binaryType = "arraybuffer";

    sock._destroyed = false;

    sock.onmessage = messageParser;


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

  function BridgeSocket(url) {
    this.id = BridgeSocket.incr++;
    this.url = url;
    this.connected = false;
    BridgeSocket.all[this.id] = this;
    if (!BridgeSocket.bridge) return BridgeSocket.embed();
    if (BridgeSocket.flashready) this.connect();
  }

  Channel.__bridge = BridgeSocket;

  BridgeSocket.all = {};
  BridgeSocket.incr = 1;
  BridgeSocket.flashready = false;
  BridgeSocket.bridge = null;

  BridgeSocket.embed = function() {
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

    flashid = "__" + TARGET_NAME.toLowerCase() + "_bridge__";

    codebase = "http://fpdownload.macromedia.com/pub/shockwave/cabs/"
               "flash/swflash.cab#version=9,0,0,0";

    pluginpage = "http://www.macromedia.com/go/getflashplayer";

    path = "bridge10.swf";

    str[0 ] = '<object classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000"' +
              ' codebase="' +  codebase + '"' +
              ' width="500" height="500"'+
              ' id="' + flashid + '" name="' + flashid + '">';
    str[1 ] = '<param name="allowScriptAccess" value="always"></param>';
    str[2 ] = '<param name="allowNetworking" value="true"></param>';
    str[3 ] = '<param name="movie" value="' + path + '"></param>';
    str[4 ] = '<param name="quality" value="low"></param>';
    str[5 ] = '<param name="menu" value="false"></param>';
    str[6 ] = '<param name="FlashVars" value="' + vars.join("&") + '">';
    str[7 ] = '</param><param name="bgcolor" value="#ffffff"></param>';
    str[8 ] = '<param name="wmode" value="transparent"></param>';
    str[9 ] = '<embed src="' + path + '" quality="low" bgcolor="#ffffff"' +
              ' wmode="transparent" width="500" height="500"' +
              ' id="' + flashid + '" name="' + flashid + '"' +
              ' swLiveConnect="true" allowScriptAccess="always"' +
              ' allowNetworking="true" menu="false"' +
              ' type="application/x-shockwave-flash"' +
              ' FlashVars="' + vars.join("&") + '"' +
              ' pluginspage="' + pluginpage + '"/>';
    str[10] = '</object>';


    tmpl = document.createElement("div");
    tmpl.innerHTML = str.join("");
    bridge = tmpl.childNodes[0];

    for (var i = 0; i < bridge.childNodes.length; i++) {
      if (bridge.childNodes[i].nodeName.toUpperCase() == "EMBED") {
        bridge = bridge.childNodes[i];
        break;
      }
    }

    body.appendChild(bridge);
    BridgeSocket.bridge = bridge;
  };


  BridgeSocket.onhandshake = function() {
    console.log("ready");
    return true;
  };


  BridgeSocket.onready = function() {
    var all = BridgeSocket.all;
    BridgeSocket.flashready = true;
    console.log("READY CALLBACK");
    for (var id in all) {
      BridgeSocket.bridge.init(all[id].id, all[id].url.source);
    }
  };


  BridgeSocket.onopen = function(id) {
    var sock;
    console.log("onopen");
    if ((sock = BridgeSocket.all[id]) && sock.onopen) {
      sock.connected = true;
      sock.onopen();
    }
  };


  BridgeSocket.onerror = function(id, err) {
    var sock;
    if ((sock = BridgeSocket.all[id])) {
      sock.destroy(new Error(err || "unknown bridge socket error"));
    }
  };


  BridgeSocket.onclose = function(id) {
    var sock;
    if ((sock = BridgeSocket.all[id]) && sock.onclose) {
      sock.destroy();
    }
  };


  BridgeSocket.onmessage = function(id, data) {
    var sock;
    if ((sock = BridgeSocket.all[id])) {
      sock.onmessage({ data: data });
    }
  };


  BridgeSocket.prototype.onmessage = messageParser;


  BridgeSocket.prototype.send = function(data) {
    BridgeSocket.bridge.send(this.id, data);
  };


  BridgeSocket.prototype.close = function() {
    this.destroy();
  };


  BridgeSocket.prototype.destroy = function(err) {

    if (!this.id) return;

    if (this.connected) {
      BridgeSocket.bridge.close(this.id);
    }

    this.id = null;

    delete BridgeSocket.all[this.id];

    if (err) {
      this.onerror && this.onerror(err);
    }

    this.onclose && this.onclose();
  };


  return function (url, C) {
    var sock = new BridgeSocket(url);

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