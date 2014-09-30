
var AVAILABLE_TRANSPORTS = {};
var DEFAULT_TRANSPORT = null;
var availableConnections = {};

function getConnection(channel, urlobj, options) {
  var transport;
  var connection;
  var connections;
  var connkey;
  var connurl;
  var path;

  var allowTransportFallback;

  if (options && options.transport !== "auto") {
    transport = options.transport;
    allowTransportFallback = false;
  } else if ("__FORCE_TRANSPORT_SOCKET__" in global){
    transport = global.__FORCE_TRANSPORT_SOCKET__;
    allowTransportFallback = false;
  } else {
    if (DEFAULT_TRANSPORT == null) {
      throw new Error("Browser does not support any of the transport protocols");
    }
    transport = DEFAULT_TRANSPORT;
    if (options && options.allowTransportFallback) {
      allowTransportFallback = options.allowTransportFallback;
    } else {
      allowTransportFallback = true;
    }
  }

  if (transport in AVAILABLE_TRANSPORTS === false) {
    throw new Error("Bad transport '" + transport + "'");
  }

  connurl = connectionUrl(urlobj);
  connkey = connectionKey(connurl, transport);
  path = urlobj.path;

  if ((connections = availableConnections[connkey])) {
    for (var i = 0; i < connections.length; i++) {
      if (path in connections[i].channels === false) {
        connection = connections[i];
        break;
      }
    }
  }

  if (!connection) {
    connection = new Connection(connurl, transport, allowTransportFallback);
    if (transport in availableConnections === false) {
      availableConnections[connkey] = [];
    }
    availableConnections[connkey].push(connection);
  }

  connection.createChannel(channel, urlobj.path);

  return connection;
}


function connectionKey(connurl, transport) {
  return [transport, connurl].join(':');
}


function connectionUrl(urlobj) {
  var result;

  result = [urlobj.protocol, '://', urlobj.host];

  if (urlobj.port) {
    result.push(':' + urlobj.port);
  }

  return result.join('');
}


function Connection(url, transport, allowTransportFallback) {
  this.url = url;
  this.transport = transport;
  this.refcount = 0;
  this.channels = {};
  this.routes = {};
  this.socket = null;
  this.connecting = false;
  this.connected = false;

  this.keepAliveTimer = null;
  this.lastSentMessage = 0;

  this.allowTransportFallback = allowTransportFallback;

  this.bindTransport();
}


Connection.prototype.bindTransport = function() {
  var self = this;
  var initTransport;
  var socket;

  initTransport = AVAILABLE_TRANSPORTS[self.transport];
  socket = initTransport(self.url);

  socket.onopen = function() {
    var channels = self.channels;
    self.connected = true;
    self.connecting = false;
    for (var path in channels) {
      self.send(0, OP_RESOLVE, 0, path);
    }
    self.startKeepAliveTimer();
  };

  socket.onframe = function(ptr, op, flag, data) {
    switch (op) {
      case OP_HEARTBEAT: return;
      case OP_OPEN: return self.processOpen(ptr, flag, data);
      case OP_DATA: return self.processData(ptr, flag, data);
      case OP_SIGNAL: return self.processSignal(ptr, flag, data);
      case OP_RESOLVE: return self.processResolve(ptr, flag, data);
    }
  };

  socket.onerror = function(err) {

    self.socket = null;

    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onframe = null;

    self.destroy(err);
  };

  socket.onclose = function(event) {
    var reason;
    var code;

    self.socket = null;

    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onframe = null;

    if (event) {
      code = event.code || STATUS_NORMAL_CLOSURE;

      if (code != STATUS_NORMAL_CLOSURE) {
        reason = event.message || event.reason || "Connection reset by server";
      }
    } else {
      code = event.code || STATUS_ABNORMAL_CLOSURE;
      reason = "Connection reset by server";
    }

    if (code == STATUS_TRANSPORT_FAILURE &&
        self.connecting === true &&
        self.allowTransportFallback === true &&
        "fallbackTransport" in this &&
        this.fallbackTransport in AVAILABLE_TRANSPORTS) {
      // Try with a fallback socket if available
      self.transport = this.fallbackTransport;
      self.bindTransport();
      return;
    }

    self.destroy(null, code, reason);
  };

  socket._destroyed = false;

  socket.destroy = function(err, code, reason) {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    if (err && this.onerror) {
      this.onerror(err);
    }

    if (code && this.onclose) {
      this.onclose(null, code, reason);
    }

    this.close();
  };

  this.socket = socket;
  this.connecting = true;
};


Connection.prototype.createChannel = function(channel, path) {
  var channels = this.channels
  var channel;

  if (path in channels) {
    throw new Error("Channel already created");
  }

  channels[path] = channel;
  this.refcount++;

  // Do not send request if socket isnt handshaked yet
  if (this.connected) {
    this.send(0, OP_RESOLVE, 0, path);
  }
};


Connection.prototype.destroyChannel = function(channel, err, code, data) {
  var channels = this.channels
  var routes = this.routes;

  if (typeof channel._path !== 'string') {
    return;
  }

  delete channels[channel._path];

  if (typeof channel._ptr == 'number') {
    delete routes[channel._ptr];
  }

  channel._onend(err, code, data);

  if (--this.refcount == 0) {
    this.destroy();
  }
};


Connection.prototype.send = function(ptr, op, flag, data) {
  var frame;
  if (this.socket && this.connected) {
    this.lastSentMessage = (new Date()).getTime();
    frame = this.socket.createFrame(ptr, op, flag, data);
    return this.socket.send(frame);
  } else {
    return false;
  }
};


Connection.prototype.startKeepAliveTimer = function () {
  var self = this;
  this.keepAliveTimer = setInterval(function () {
    var now = (new Date()).getTime();

    if (now - self.lastSentMessage >= 15000) {
      self.send(0, OP_HEARTBEAT, 0);
    }
  }, 5000);
  self.send(0, OP_HEARTBEAT, 0);
};


Connection.prototype.processOpen = function(ptr, flag, data) {
  var channel;

  if (!(channel = this.routes[ptr])) {
    this.destroy(null, STATUS_PROTOCOL_ERROR, "UNKNOWN_OPEN_RESP_ERR");
    return;
  }

  if (channel.readyState !== Channel.CONNECTING) {
    this.destroy(null, STATUS_PROTOCOL_ERROR, "CHANNEL_NOT_CONNECTING_ERR");
  }

  if (flag == FLAG_ALLOW) {
    channel._onopen(data);
  } else {
    this.destroyChannel(channel, null, STATUS_OPEN_DENIED, data);
  }
};


Connection.prototype.processData = function(ptr, flag, data) {
  var routes = this.routes;
  var channel;

  if (ptr === ALL_CHANNELS) {
    for (var chanptr in routes) {
      channel = routes[chanptr];
      if (channel.readyState == Channel.OPEN && channel.readable) {
        dispatchEvent(new MessageEvent(channel, flag, cloneData(data)));
      }
    }
  } else if ((channel = routes[ptr])) {
    if (channel.readyState == Channel.OPEN && channel.readable) {
      dispatchEvent(new MessageEvent(channel, flag, data));
    }
  }
};


Connection.prototype.processSignal = function(ptr, flag, data) {
  var routes = this.routes;
  var channel;

  switch (flag) {

    case FLAG_EMIT:
      if (ptr === ALL_CHANNELS) {
        for (var chanptr in routes) {
          channel = routes[chanptr];
          if (channel.readyState == Channel.OPEN) {
            dispatchEvent(new SignalEvent(channel, cloneData(data)));
          }
        }
      } else if ((channel = routes[ptr])) {
        if (channel.readyState == Channel.OPEN) {
          dispatchEvent(new SignalEvent(channel, data));
        }
      }
      break;

    case FLAG_END:
    case FLAG_ERROR:
      if (ptr === ALL_CHANNELS) {
        if (flag == FLAG_END) {
          this.destroy(null, STATUS_NORMAL_CLOSURE, data);
        } else {
          this.destroy(null, STATUS_SIGNAL, data);
        }
        return;
      }

      if (!(channel = routes[ptr])) {
        // Protocol violation. Channel does not exists in client. Ignore
        // for now.
        return;
      }

      if (channel.readyState == Channel.CLOSING) {
        this.destroyChannel(channel, null, STATUS_NORMAL_CLOSURE);
      } else {
        this.send(ptr, OP_SIGNAL, FLAG_END);
        if (flag == FLAG_END) {
          this.destroyChannel(channel, null, STATUS_NORMAL_CLOSURE, data);
        } else {
          this.destroyChannel(channel, null, STATUS_SIGNAL, data);
        }
      }
      break;

    default:
      this.destroy(null, STATUS_PROTOCOL_ERROR, "Unknown signal flag SIGFLAG");
      return;
  }
};


Connection.prototype.processResolve = function(ptr, flag, data) {
  var channel;
  var path;

  if (typeof data !== "string" || data.length == 0) {
    this.destroy(null, STATUS_INVALID_PAYLOAD, "Resolve payload empty");
    return;
  }

  path = data;

  if (!(channel = this.channels[path])) {
    return;
  }

  if (channel.readyState == Channel.CLOSING) {
    this.destroyChannel(channel, null, STATUS_NORMAL_CLOSURE);
    return;
  }

  if (flag != FLAG_ALLOW) {
    this.destroyChannel(channel,
                        null,
                        STATUS_OPEN_DENIED,
                        "Unable to resolve path");
    return;
  }

  this.routes[ptr] = channel;
  channel._ptr = ptr;

  this.send(ptr, OP_OPEN, channel._mode, channel._token);
};


// Destroy connection with optional Error
Connection.prototype.destroy = function(err, code, data) {
  var channels = this.channels;
  var connections;
  var connkey;
  var channel;
  var idx;

  if (!this.url) {
    return;
  }

  connkey = connectionKey(this.url, this.transport);
  connections = availableConnections[connkey];
  idx = connections && connections.length || 0;

  while (idx--) {
    if (connections[idx] == this) {
      connections.splice(idx, 1);
      if (connections.length == 0) {
        delete availableConnections[connkey];
      }
      break;
    }
  }

  this.url = null;
  this.connecting = false;
  this.connected = false;
  this.channels = {};
  this.routes = {};
  this.refcount = 0;
  this.transport = null;

  for (var path in channels) {
    if ((channel = channels[path])) {
      channel._onend(err, code, cloneData(data));
    }
  }

  if (this.keepAliveTimer) {
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
  }

  if (this.socket) {
    this.socket.onopen = null;
    this.socket.onerror = null;
    this.socket.onclose = null;
    this.socket.onframe = null;
    try {
      this.socket.close();
    } catch (err) {
    } finally {
      this.socket = null;
    }
  }
};


function bridgeOpenHandler() {
  this.connected = true;

  if (this.initTimer) {
    clearTimeout(this.initTimer);
    this.initTimer = null;
  }

  if (!this.onopen) {
    return;
  }

  this.onopen();
}


function bridgeMessageHandler(data) {
  if (!this.onmessage) {
    return;
  }

  this.onmessage({
    type: "message",
    data: data
  });
}


function bridgeErrorHandler(err) {
  this.close(STATUS_TRANSPORT_FAILURE, err || "BRIDGE_UNKNOWN_ERR");
}


function bridgeCloseHandler() {
  this.close(STATUS_ABNORMAL_CLOSURE, "BRIDGE_UNKNOWN_ERR");
}
