function OpenEvent(target, data, id) {
  this.target = target;
  this.message = data;
  this.data = data;
}

OpenEvent.prototype.type = "open";


function MessageEvent(target, flag, data) {
  this.target = target;
  this.dataType = flag & 1 ? "text" : "binary";
  this.priority = (flag >> 1);
  this.data = data;
}

MessageEvent.prototype.type = "message";


function SignalEvent(target, data) {
  this.target = target;
  this.message = data;
  this.data = data;
}

SignalEvent.prototype.type = "signal";


function ErrorEvent(target, message) {
  this.target = target;
  this.message = message || "UNKNOWN_ERR";
}

ErrorEvent.prototype.type = "error";



function CloseEvent(target, data) {
  this.target = target;
  this.message = data;
  this.data = data;
}

CloseEvent.prototype.type = "close";
