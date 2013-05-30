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
  this.destroyed = false;

  this.readable = false;
  this.writable = false;
  this.emitable = false;

  this.connect(url, mode);
}


Channel.VERSION = VERSION;
Channel.SUPPORTED = SUPPORTED;

// We cannot use SocketInterface.name, IE do not support it.
Channel.TRANSPORT = SocketInterface && SocketInterface.NAME;

Channel.WEBSOCKET = hasWSSupport();
Channel.FLASH = hasFlashSupport();
Channel.COMET = hasCometSupport();

Channel.MAXSIZE = PAYLOAD_MAX_SIZE;

Channel.CONNECTING = Channel.prototype.CONNECTING = 0;
Channel.OPEN = Channel.prototype.OPEN = 1;
Channel.CLOSING = Channel.prototype.CLOSING = 2;
Channel.CLOSED = Channel.prototype.CLOSED = 3;


Channel.sizeOf = getsize;


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

  if (!SUPPORTED) {
    throw new Error("Not supported in current browser");
  }

  if (this._connecting) {
    throw new Error("ALREADY_CONNECTING_ERR");
  }

  if (this._closing) {
    throw new Error("Channel is closing");
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
  var flag = (arguments[1] || 0);
  var frame;

  if (this.readyState !== Channel.OPEN) {
    throw new Error("INVALID_STATE_ERR");
  }

  if (!this.writable) {
    throw new Error("NOT_WRITABLE_ERR");
  }

  if (flag < 0 || flag > 3 || isNaN(flag)) {
    throw new Error("Bad priority, expected Number between 0-3");
  }

  if (!data || (!data.length && !data.byteLength)) {
    throw new Error("Expected `data`");
  }

  if (typeof data == "string") {
    flag = flag << 1 | 1;
  } else {
    flag = flag << 1 | 0;
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

  chan.readable = false;
  chan.writable = false;
  chan.emitable = false;
  chan.destroyed = true;
  chan._request = null;
  chan._connection = null;

  try {
    if (err && chan.onerror) {
      event = new ErrorEvent(chan, typeof err == "string" ? err : err.message);
      chan.onerror(event);
    }
  } catch (err) {
    // Ignore any errors when emitting events.
  }

  try {
    if (chan.onclose) {
      event = new CloseEvent(chan, message || null);
      chan.onclose(event);
    }
  } catch (err) {
    // Ignore any errors when emitting events.
  }

  chan.id = null;
};