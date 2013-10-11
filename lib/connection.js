
// Represents a server connection.
function Connection(id) {
  this.id = id;
  this.chanRefCount = 0;
  this.reqRefCount = 0;
  this.channelsByPath = {};
  this.channels = {};
  this.requests = {};
  this.sock = null;
  this.timeout = null;

  this.keepAliveTimer = null;
  this.lastSentMessage = 0;

  Connection.all[id] = this;
}


Connection.all = {};
Connection.disposed = {};


Connection.getConnection = function(url) {
  var id;
  var connection;
  var datacache = "";
  var lastException;

  id = url.protocol + ":" + url.host;

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
        requests[id].resolve();
      }
    });
  }, 0);
};


Connection.prototype.open = function(chan, path, mode, token) {
  var self = this;
  var channels = self.channels;
  var channelsByPath = self.channelsByPath;
  var oldchan;
  var request;
  var frame;

  if ((oldchan = channelsByPath[path]) && !oldchan._closing) {
    nextTick(function() {
      finalizeDestroyChannel(chan, new Error("Channel is already open"));
    });
    return null;
  }

  request = new OpenRequest(self, path, mode, token);

  request.onresponse = function(payload, id) {
    chan._open(payload, id, path);
  };

  request.onclose = function(err) {
    if (err) { finalizeDestroyChannel(chan, err); }
  };

  if (self.sock && !oldchan) {
    // Do not send request if socket isnt handshaked yet, or
    // if a channel is open and waiting for an ENDSIG.
    request.resolve();
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

    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }

    Connection.disposed[id] = this;
    Connection.all[id] = undefined;

  } else {

    delete Connection.disposed[id];
    Connection.all[id] = this;

    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    this.startKeepAliveTimer();
  }
};


Connection.prototype.startKeepAliveTimer = function () {
  var self = this;
  this.keepAliveTimer = setInterval(function () {
    var now = (new Date()).getTime();
    var frame;

    if (now - self.lastSentMessage >= 15000) {
      frame = createFrame(0, 0x0, 0);
      self.send(frame);
    }
  }, 5000);
};


// Write a `Frame` to the underlying socket.
Connection.prototype.send = function(frame) {
  if (this.sock) {
    this.lastSentMessage = (new Date()).getTime();
    return this.sock.send(frame);
  } else {
    return false;
  }
};


// Destroy connection with optional Error
Connection.prototype.destroy = function(err, message) {
  var id = this.id;
  var channels = this.channelsByPath;
  var requests = this.requests;
  var chan;
  var request;
  var queued;

  if (!id) {
    return;
  }

  this.id = null;

  for (var path in channels) {
    if ((chan = channels[path])) {
      finalizeDestroyChannel(chan, err, message);
    }
  }

  for (var path in this.requests) {
    if ((request = requests[path])) {
      request.destroyAndNext(err);
    }
  }

  this.channels = {};
  this.channelsByPath = {};
  this.requests = {};
  this.chanRefCount = 0;
  this.reqRefCount = 0;

  delete Connection.all[id];
  delete Connection.disposed[id];

  if (this.timeout) {
    clearTimeout(this.timeout);
    this.timeout = null;
  }

  if (this.keepAliveTimer) {
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
  }

  if (this.sock) {
    this.sock.close();
    this.sock = null;
  }
};


function sockImplementation(conn, sock) {

  conn.sock = sock;

  sock.onerror = function(event) {
    conn.sock = null;
    conn.destroy(event);
  };

  sock.onclose = function(event) {
    var msg = "Connection reset by server";
    self.sock = null;
    if (event && event.code) {
      msg += "(" + event.code + (event.reason ? " " + event.reason : "") + ")";
    }
    conn.destroy(new Error(msg));
  };

  sock.onopenframe = function(id, flag, payload) {
    var requests = conn.requests;
    var request;

    for (var path in requests) {
      if (requests[path].id == id) {
        request = requests[path];
        break;
      }
    }

    if (!request) {
      conn.destroy(new Error("ERR_SERVER_SENT_TO_BAD_CHANNEL"));
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

          if (requests[chan.path]) {
            // Send pending open request if exists.
            requests[chan.path].resolve();
          }

        } else {
          // Server closed this channel. We need to respond with a
          // ENDSIG in order to let server now that we received this
          // signal.

          frame = createFrame(id, OP_SIGNAL, FLAG_END);
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


  sock.onresolveframe = function(id, flag, payload) {
    var requests = conn.requests;
    var request;
    var path;

    if (payload.length == 0) {
      conn.destroy(new Error('Server sent a bad resolve response'));
      return;
    }

    if ((request = requests[payload])) {
      request.processResolve(id, flag, path);
    }
  };


  conn.startKeepAliveTimer();
}
