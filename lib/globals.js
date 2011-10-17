var SUPPORTED = true;
var TRANSPORT = null;

var VERSION = "1.0rc";

var PAYLOAD_MAX_BIN = 0xfff8;
var PAYLOAD_MAX_UTF = 0x1554c;

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

var AB_TRANSPORT_SUPPORT = false;


// Map native types to local scope, if exists
var ArrayBuffer = global.ArrayBuffer;
var WebSocket = global.WebSocket || global.MozWebSocket || void(0);
var btoa = global.btoa;
var atob = global.atob;


// Predefined local varibales. They are mapped in
// the `detection` process.
var SocketInterface = null;
var createFrame = null;
var atobin = null;


var TARGET_NAME = typeof BUILD_TARGET !== "undefined" ? BUILD_TARGET
                                                      : "HydnaChannel";
var COMET_HANDSHAKE_PATH = "/comet/";

if (TARGET_NAME in global) {
  throw new Error("Target name already taken, or is library already loaded");
}

global[TARGET_NAME] = Channel;
