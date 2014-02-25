var exports = EXPORTS == 'global' ? Channel : {};

exports.VERSION = VERSION;
exports.SUPPORTED = DEFAULT_TRANSPORT !== null;
exports.WEBSOCKET = "websocket" in AVAILABLE_TRANSPORTS;
exports.FLASH = "flash" in AVAILABLE_TRANSPORTS;
exports.COMET = "comet" in AVAILABLE_TRANSPORTS;
exports.MAXSIZE = PAYLOAD_MAX_SIZE;
exports.sizeOf = getsize;

if (EXPORTS !== "global") {
  exports.Channel = Channel;
}

switch (EXPORTS) {

  case "amd":
  define([], function() {
    return exports;
  });
  break;

  case "common":
  module.exports = exports;
  break;

  default:
  if (OBJECT_NAME in global) {
    throw new Error("Target name already taken, or is library already loaded");
  }
  global[OBJECT_NAME] = exports;
  break;
}