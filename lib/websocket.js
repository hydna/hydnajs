function WebSocketInterface() {
  var ret;

  ret = function(url, C) {
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
      return C(new Error("Failed to connect to remote"));
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
  ret.NAME = "websocket";
  return ret;
}