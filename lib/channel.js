function Channel(url, mode, options) {
  var urlobj;
  var protocol;

  if (!DEFAULT_TRANSPORT) {
    throw new Error("Not supported in current browser");
  }

  if (typeof url !== "string") {
    throw new Error("bad argument, `url`, expected String");
  }

  if (/^http:\/\/|^https:\/\//.test(url) == false) {
    protocol = /^http/.test(location.protocol) ? location.protocol : 'http:';
    url = protocol + "//" + url;
  }

  urlobj = parseUri(url);

  if (urlobj.protocol !== "https" && urlobj.protocol !== "http") {
    throw new Error("bad protocol, expected `http` or `https`");
  }

  if (typeof (this._mode = getBinMode(mode)) !== "number") {
    throw new Error("Invalid mode");
  }

  try {
    this._connection = getConnection(this, urlobj, options);
  } catch(connectionError) {
    this._mode = 0;
    throw connectionError;
  }

  this._path = urlobj.path;
  this.url = this._connection.url + this._path;

  this._token = urlobj.query || null;
  this._ptr = null;
  this._resolved = false;
  this._endsig = null;
  this._events = {};

  this.readyState = Channel.CONNECTING;

  this.readable = ((this._mode & READ) == READ);
  this.writable = ((this._mode & WRITE) == WRITE);
  this.emitable = ((this._mode & EMIT) == EMIT);
}


Channel.CONNECTING = Channel.prototype.CONNECTING = 0;
Channel.OPEN = Channel.prototype.OPEN = 1;
Channel.CLOSING = Channel.prototype.CLOSING = 2;
Channel.CLOSED = Channel.prototype.CLOSED = 3;

Channel.prototype.extensions = "";
Channel.prototype.protocol = "";
Channel.prototype.binaryType = typeof ArrayBuffer == "undefined" ? void(0)
                                                                 : "arraybuffer";

try {
  Object.defineProperty(Channel.prototype, "bufferedAmount", {
    configurable : true,
    enumerable: true,
    get: function () {
      var socket = this._connection && this._connection.socket || null;
      return  socket ? socket.bufferedAmount : 0;
    }
  });
} catch (err) {
  Channel.prototype.bufferedAmount = 0;
}

Channel.prototype._onopen = function(data) {
  this._token = null;

  if (this.readyState == Channel.CLOSING) {
    this.channel.send(OP_SIGNAL, FLAG_END, this._endsig);
    this._endsig = null;
    return;
  }

  this.readyState = Channel.OPEN;

  dispatchEvent(new OpenEvent(this, data));
};


Channel.prototype._onend = function(err, code, reason) {
  var self = this;
  var event;
  var code;
  var message;

  if (this.readyState === Channel.CLOSED) {
    return;
  }

  this.readyState = Channel.CLOSED;

  this._ptr = null;
  this._token = null;
  this._resolved = false;
  this._mode = null;

  this._connection = null;
  this._endsig = null;

  if (err) {
    event = new ErrorEvent(this, typeof err == "string" ? err : err.message);
    dispatchEvent(event);
  }

  message = reason;

  if (!code) {
    code = STATUS_ABNORMAL_CLOSURE;
    message = "Connection to remote closed";
  }

  event = new CloseEvent(this, code,  message || null, !!(err));
  dispatchEvent(event);

  this._path = null;
  this._url = null;
};


Channel.prototype.on = function(event, handler) {
  addEventHandler(this, event, handler);
  return this;
};


Channel.prototype.off = function(event, handler) {
  removeEventHandler(this, event, handler);
  return this;
};


Channel.prototype.addEventListener = function(event, handler) {
  addEventHandler(this, event, handler);
};


Channel.prototype.removeEventListener = function(event, handler) {
  removeEventHandler(this, event, handler);
};


Channel.prototype.send = function(data, priority) {
  var flag = (arguments[1] || 0);

  if (this.readyState !== Channel.OPEN) {
    throw new Error("INVALID_STATE_ERR");
  }

  if (!this.writable) {
    throw new Error("NOT_WRITABLE_ERR");
  }

  if (flag < 0 || flag > 7 || isNaN(flag)) {
    throw new Error("Bad priority, expected Number between 0-7");
  }

  if (!data || (!data.length && !data.byteLength)) {
    throw new Error("Expected `data`");
  }

  return this._connection.send(this._ptr, OP_DATA, flag, data);
};


Channel.prototype.emit = function(data) {

  if (this.readyState !== Channel.OPEN) {
    throw new Error("INVALID_STATE_ERR");
  }

  if (!this.emitable) {
    throw new Error("NOT_EMITABLE_ERR");
  }

  if (!data || (!data.length && !data.byteLength)) {
    throw new Error("Expected `data`");
  }

  return this._connection.send(this._ptr, OP_SIGNAL, FLAG_EMIT, data);
};


Channel.prototype.close = function(data) {
  var frame;

  if (this.readyState !== Channel.CONNECTING &&
      this.readyState !== Channel.OPEN) {
    return;
  }

  if (data) {
    if ((!data.length && !data.byteLength)) {
      throw new Error("Expected `data`");
    }
  }

  this.readable = false;
  this.writable = false;
  this.emitable = false;

  if (this.readyState === Channel.OPEN) {
    this._connection.send(OP_SIGNAL, FLAG_END, data);
  } else {
    this._endsig = data;
  }

  this.readyState = Channel.CLOSING;
};