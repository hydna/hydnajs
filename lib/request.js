// OpenRequest constructor.
function OpenRequest(conn, path, flag, data) {
  var requests = conn.requests;
  var next;

  this.id = null;

  this.conn = conn;
  this.path = path;
  this.flag = flag;
  this.data = data;
  this.present = false;
  this.sent = false;
  this.destroyed = false;

  this.prev = null;
  this.next = null;

  if ((next = requests[path])) {
    while (next.next && (next = next.next)) {};
    next.next = this;
  } else {
    requests[path] = this;
  }

  conn.reqRefCount++;
}


// Open Flags
OpenRequest.FLAG_ALLOW = 0x0;
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
    var frame;

    if (self.destroyed) return;
    self.sent = true;

    frame = createFrame(self.id, OP_OPEN, self.flag, self.data);
    self.conn.send(frame);
  });

};


OpenRequest.prototype.resolve = function () {
  var self = this;

  if (this.id) {
    throw new Error('OpenRequest already have an ID');
  }

  nextTick(function() {
    var frame;

    try {
      frame = createFrame(0, OP_RESOLVE, 0, self.path);
      self.conn.send(frame);
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


OpenRequest.prototype.destroy = function(err, code, reason) {
  var conn;

  if (!this.destroyed) {
    if ((conn = this.conn) && conn.id) {
      conn.reqRefCount--;
      if (conn.reqRefCount == 0 &&
          conn.chanRefCount == 0) {
        conn.setDisposed(true);
      }
    }
    if (code && this.onclose) {
      this.onclose(err, code, reason);
    }
    this.destroyed = true;
  }
};


// Destroy this OpenRequest and all other in chain
OpenRequest.prototype.destroyAndNext = function(err, code, reason) {
  if (this.next) {
    this.next.destroyAndNext(err, code, reason);
  }
  this.destroy(err, code, reason);
}


OpenRequest.prototype.processResolve = function(id, flag, path) {
  if (flag != OpenRequest.FLAG_ALLOW) {
    this.destroy(null, STATUS_OPEN_DENIED, "Unable to resolve path");
    return;
  }
  
  this.id = id;
  this.send();
};


OpenRequest.prototype.processResponse = function(flag, payload) {
  var conn = this.conn;
  var request;
  var err;
  var content;
  var reason;

  if (this.next) {
    if (flag == OpenRequest.FLAG_ALLOW) {
      reason = "Channel is already open";
      this.next.destroyAndNext(null, STATUS_CHANNEL_OPEN, reason);
    } else {
      this.next.prev = null;
      conn.requests[this.path] = this.next;
      conn.requests[this.path].send();
    }
  } else {
    delete conn.requests[this.path];
  }

  switch (flag) {

    case OpenRequest.FLAG_ALLOW:
      this.onresponse(payload, this.id, this.path);
      this.destroy();
      break;

    default:
      this.destroy(null, STATUS_OPEN_DENIED, payload);
      break;
  }
};