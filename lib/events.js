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