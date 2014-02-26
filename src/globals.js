/*
  These constants MUST be provided by the builder:
    - OBJECT_NAME (string)
    - DISABLE_WEBSOCKET (boolean)
    - DISABLE_FLASH (boolean)
    - DISABLE_COMET (boolean)
    - COMET_PATH (string)
    - FLASH_PATH (string)
    - VERSION (string)
*/

var PAYLOAD_MAX_SIZE = 0xfffa;
var BFRAME_MAX_SIZE = 0xffff;
var UFRAME_MAX_SIZE = 0x15554;

var PAYLOAD_TYPE_TEXT = 0;
var PAYLOAD_TYPE_BINARY = 1;

var OP_HEARTBEAT = 0x0;
var OP_OPEN = 0x1;
var OP_DATA = 0x2;
var OP_SIGNAL = 0x3;
var OP_RESOLVE = 0x4;

// Channel modes
var READ = 0x01;
var WRITE = 0x02;
var READWRITE = 0x03;
var EMIT = 0x04;

// flags
var FLAG_ALLOW = 0x0;
var FLAG_EMIT = 0x0;
var FLAG_END = 0x1;
var FLAG_DENY = 0x7;
var FLAG_ERROR = 0x7;

var ALL_CHANNELS = 0;

var MODE_RE = /^(r|read){0,1}(w|write){0,1}(?:\+){0,1}(e|emit){0,1}$/i;


// Range 1000-1999 is compatible with WebSocket specification.
var STATUS_NORMAL_CLOSURE = 1000;
var STATUS_GOING_AWAY = 1001;
var STATUS_PROTOCOL_ERROR = 1002;
var STATUS_UNSUPPORTED_DATA = 1003;
var STATUS_NO_STATUS_RCVD = 1005;
var STATUS_ABNORMAL_CLOSURE = 1006;
var STATUS_INVALID_PAYLOAD = 1007;
var STATUS_POLICY_VIOLATION = 1008;
var STATUS_MESSAGE_TOO_BIG = 1009;
var STATUS_MANDATORY_EXT = 1010;
var STATUS_INTERNAL_SERVER_ERROR = 1011;
var STATUS_TLS_HANDSHAKE = 1015;

// Range 5000-5999 is hydna specific
var STATUS_OPEN_DENIED = 5000;
var STATUS_SIGNAL = 5001;
var STATUS_CHANNEL_OPEN = 5002;
var STATUS_TRANSPORT_FAILURE = 5003;

// Map native types to local scope, if exists
var encodeURIComponent = global.encodeURIComponent;
var decodeURIComponent = global.decodeURIComponent;
var escape = global.escape;
var unescape = global.unescape;

// Check if the browser supports ArrayBuffers's. If not,
// use Arrays instead.
var ArrayBuffer = global.ArrayBuffer;
var atobin = null;

if (ArrayBuffer == undefined) {
  ArrayBuffer = function() {};
  atobin = atoarr;
} else {
  atobin = atoab;
}

var uniqueId = (function () {
  var incr = 1;
  return function (asString) {
    var id = incr++;
    if (!asString) {
      return id;
    }
    id = incr.toString(16);
    while (id.length < 8) id = 0 + id;
    return id;
  };
}());


var time = Date.now || (function () {
  return (new Date()).getTime();
});

var EXPORTS = (function () {
  switch (true) {
    case typeof module !== "undefined" &&
         typeof module.exports !== "undefined":
    return "common";
    case typeof define === "function" && !!define.amd:
    return "amd";
  }
  return "global";  
}());