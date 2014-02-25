var nextTick = null;
if (typeof setImmediate != "undefined") {
  nextTick = setImmediate;
} else if (typeof postMessage != "undefined" && typeof window != "undefined") {
	nextTick = (function() {
	  var TOKEN = "nextTick." + ((Math.random() * 0xFFFF) & 0xFFFF).toString();
    var callbacks = [];
    var incr = 1;

  	function message(event) {
  	  var C;
  		if (event.source == global && event.data === TOKEN) {
  		  (C = callbacks.shift()) && C();
  		}
  	}

  	if (global.addEventListener) {
  		global.addEventListener("message", message, false);
  	} else if (global.attachEvent) {
  		global.attachEvent("onmessage", message);
  	} else {
  	  global.onmessage = message;
  	}

	  return function(C) {
	    callbacks.push(C);
	    global.postMessage(TOKEN, "*");
	    return incr++;
	  }
	})();
} else {
  nextTick = function(C) { setTimeout(C, 0); };
}