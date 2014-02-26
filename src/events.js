function OpenEvent(target, data) {
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
  this.data = data;
  this.message = data;
  if (typeof data == "string") {
    this.message = data;
  } else {
    this.message = "UNKNOWN_ERR";
  }
}

ErrorEvent.prototype.type = "error";



function CloseEvent(target, code, reason) {
  this.target = target;

  this.wasClean = code == STATUS_NORMAL_CLOSURE;
  this.wasDenied = code == STATUS_OPEN_DENIED;
  this.hadError = !this.wasClean && !this.wasDenied;

  this.code = code;
  this.reason = reason || "";
  this.data = reason;

}

CloseEvent.prototype.type = "close";


function addEventHandler(target, event, handler) {
  if (typeof event !== "string") {
    throw new Error("Expected `event` as String");
  }
  if (typeof handler !== "function") {
    throw new Error("Expected `handler` as Function");
  }
  if (!target._events[event]) {
    target._events[event] = handler;
  } else if (typeof target._events[event] !== 'function') {
    target._events[event].push(handler);
  } else {
    target._events[event] = [target._events[event], handler];
  }
}


function removeEventHandler(target, type, handler) {
  var idx;
  var handlers;
  if (!type || !handler) {
    return;
  }
  if (!(handlers = target._events[type])) {
    return;
  } else if (typeof handlers === 'function') {
    if (handlers == handler) {
      delete target._events[type];
    }
  } else {
    idx = handlers.length;
    while (idx--) {
      if (handlers[idx] == handler) {
        handlers.splice(idx, 1);
        if (handlers.length == 1) {
          target._events[type] = handlers[0];
        }
        break;
      }
    }
  }
}


function callEventHandler(target, event, handler) {
  try {
    handler.call(target, event);
  } catch (dispatchError) {
    nextTick(function () {
      throw dispatchError;
    });
  }
}


function dispatchEvent(event) {
  var type;
  var handler;
  var target;

  if (!event ||
      typeof (type = event.type) !== 'string' ||
      !(target = event.target)) {
    return;
  }

  if ((handler = target['on' + type])) {
    callEventHandler(target, event, handler);
  }

  if ((handler = target._events[event.type])) {

    if (typeof handler !== "function") {
      for (var i = 0, l = handler.length; i < l; i++) {
        callEventHandler(target, event, handler[i]);
      }
    } else {
      callEventHandler(target, event, handler);
    }
  }
}