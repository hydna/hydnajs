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

var SUPPORTED = true;
var AB_TRANSPORT_SUPPORT = false;

var PAYLOAD_MAX_SIZE = 0xfff8;
var BFRAME_MAX_SIZE = 0xfffd;
var UFRAME_MAX_SIZE = 0x15553;

var PAYLOAD_TYPE_TEXT = 0;
var PAYLOAD_TYPE_BINARY = 1;

var OP_HEARTBEAT = 0x0;
var OP_OPEN = 0x1;
var OP_DATA = 0x2;
var OP_SIGNAL = 0x3;

// Channel modes
var READ = 0x01;
var WRITE = 0x02;
var READWRITE = 0x03;
var EMIT = 0x04;


// Signal flags
var FLAG_EMIT = 0x0;
var FLAG_END = 0x1;
var FLAG_ERROR = 0x7;

var ALL_CHANNELS = 0;

var MODE_RE = /^(r|read){0,1}(w|write){0,1}(?:\+){0,1}(e|emit){0,1}$/i;


// Map native types to local scope, if exists
var ArrayBuffer = global.ArrayBuffer;
var WebSocket = global.WebSocket || global.MozWebSocket || void(0);
var btoa = global.btoa;
var atob = global.atob;
var encodeURIComponent = global.encodeURIComponent;
var decodeURIComponent = global.decodeURIComponent;
var escape = global.escape;
var unescape = global.unescape;


// Predefined local varibales. They are mapped in
// the `detection` process.
var SocketInterface = null;
var createFrame = null;
var atobin = null;

if (OBJECT_NAME in global) {
  throw new Error("Target name already taken, or is library already loaded");
}

global[OBJECT_NAME] = Channel;
