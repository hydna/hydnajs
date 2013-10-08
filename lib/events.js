function OpenEvent(target, data, id) {
  this.target = target;
  this.data = data;
}

OpenEvent.prototype.type = "open";


function MessageEvent(target, flag, data) {
  this.target = target;
  this.priority = flag;
  this.data = data;
}

MessageEvent.prototype.type = "message";


function SignalEvent(target, data) {
  this.target = target;
  this.data = data;
}

SignalEvent.prototype.type = "signal";


function ErrorEvent(target, data) {
  this.target = target;
  this.data = data || "UNKNOWN_ERR";
}

ErrorEvent.prototype.type = "error";



function CloseEvent(target, data) {
  this.target = target;
  this.data = data;
}

CloseEvent.prototype.type = "close";
