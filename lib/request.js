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