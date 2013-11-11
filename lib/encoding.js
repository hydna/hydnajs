
var FLAG_BITMASK = 0x7;

var OP_BITPOS = 3;
var OP_BITMASK = (0x7 << OP_BITPOS);

var CTYPE_BITPOS = 6;
var CTYPE_BITMASK = (0x1 << CTYPE_BITPOS);


// Converts an ArrayBuffer to UTF8
function abtoutf(ab, offset) {
	var result = [];

  for (var i = offset, l = ab.byteLength; i < l; i++) {
		result.push(String.fromCharCode(ab[i]));
  }

	return decodeURIComponent(escape(result.join("")));
}


// Converts a base64-string to an array with number.
function atoarr(a) {
  var arr = [];
  for (var i = 0, l = a.length; i < l; i++) {
    arr[i] = a.charCodeAt(i);
  }
  return arr;
}


// Converts a string to a ArrayBuffer
function atoab(a) {
  var ab;
  ab = new Uint8Array(a.length);
  for (var i = 0, l = a.length; i < l; i++) {
    ab[i] = a.charCodeAt(i);
  }
  return ab.buffer;
}


// Create a binary frame
function createFrameBin(ptr, op, flag, data) {
  var poff = 0;
  var plen = 0;
  var chars;
  var payload;
  var view;
  var frame;
  var ctype;
  var b;

  ctype = PAYLOAD_TYPE_TEXT;

  if (data) {
    if (typeof data == "string") {
      chars = unescape(encodeURIComponent(data));
      view = new Uint8Array(chars.length);
    	for (var i = 0, l = chars.length; i < l; i++) {
    		view[i] = chars.charCodeAt(i);
      }
      payload = view.buffer;
      plen = payload.byteLength;
    } else if (data instanceof ArrayBuffer) {
      ctype = PAYLOAD_TYPE_BINARY;
      payload = data;
      plen = data.byteLength;
    } else if (data.buffer instanceof ArrayBuffer) {
      ctype = PAYLOAD_TYPE_BINARY;
      payload = data.buffer;
      poff = data.byteOffset;
      plen = data.byteLength;
    } else if (data.length) {
      ctype = PAYLOAD_TYPE_BINARY;
      view = new Uint8Array(data.length);
      for (var i = 0, l = data.length; i < l; i++) {
        view[i] = parseInt(data[i]);
      }
      payload = view.buffer;
      plen = this.data.byteLength;
    } else {
      throw new Error("UNSUPPORTED_TYPE_ERR");
    }
  }

  if (5 + plen > BFRAME_MAX_SIZE) {
    throw new Error("FRAME_OVERFLOW_ERR");
  }

  frame = new ArrayBuffer(5 + plen);

  view = new Uint8Array(frame)
  view[0] = ptr >>> 24 & 0xff;
  view[1] = ptr >>> 16 & 0xff;
  view[2] = ptr >>> 8 & 0xff;
  view[3] = ptr % 256;
  view[4] = (ctype << CTYPE_BITPOS) | (op << OP_BITPOS) | flag;

  if (plen) {
    view.set(new Uint8Array(payload, poff, plen), 5);
  }

  return frame;
}

// Creates an UTF frame
function createFrameUtf(ptr, op, flag, data) {
  var buffer;
  var frame;
  var view;
  var payload;
  var result;
  var ctype;
  var b;

  ctype = PAYLOAD_TYPE_TEXT;

  if (data) {
    if (typeof data == "string") {
      payload = unescape(encodeURIComponent(data));
    } else if (data instanceof ArrayBuffer ||
               data.buffer instanceof ArrayBuffer) {
      ctype = PAYLOAD_TYPE_BINARY;
      buffer = data.buffer || data;
      view = new Uint8Array(buffer, data.byteOffset || 0, data.byteLength);
      payload = [];
      for (var i = 0, l = view.byteLength; i < l; i++) {
        payload[i] = String.fromCharCode(view[i]);
      }
    } else if (data.length) {
      ctype = PAYLOAD_TYPE_BINARY;
      payload = [];
      for (var i = 0, l = data.length; i < l; i++) {
        b = (parseInt(data[i]) % 256 + 256) % 256;
        payload[i] = String.fromCharCode(b);
      }
    } else {
      throw new Error("UNSUPPORTED_TYPE_ERR");
    }
  }

  frame = new Array();
  frame[0] = String.fromCharCode((ptr >>> 24) & 0xff);
  frame[1] = String.fromCharCode((ptr >>> 16) & 0xff);
  frame[2] = String.fromCharCode((ptr >>> 8) & 0xff);
  frame[3] = String.fromCharCode(ptr & 0xff);
  frame[4] = String.fromCharCode((ctype << CTYPE_BITPOS) |
                                 (op << OP_BITPOS) |
                                  flag);

  if (payload) {
    frame = frame.concat(payload);
  }

  result = btoa(frame.join(""));

  if (result.length > UFRAME_MAX_SIZE) {
    throw new Error("FRAME_OVERFLOW_ERR");
  }

  return result;
}


function getsize(data) {
  var buffer;
  var view;

  if (typeof data == "string") {
    return unescape(encodeURIComponent(data)).length;
  } else if (data instanceof ArrayBuffer ||
             data.buffer instanceof ArrayBuffer) {
    return data.byteLength
  } else if (data.length) {
    return data.length;
  } else {
    throw new Error("UNSUPPORTED_TYPE_ERR");
  }
}


// Binary message parser
function sockMessageBinImpl(event) {
  var ptr;
  var ctype;
  var op;
  var flag;
  var data;
  var payload;
  var tmp;

  if ((data = event.data) instanceof ArrayBuffer == false) {
    return this.destroy(null, STATUS_PROTOCOL_ERROR, "ERR_UNSUPPORTED_TYPE");
  }

  if (event.data.byteLength < 5) {
    return this.destroy(null, STATUS_PROTOCOL_ERROR, "ERR_BAD_HEADER_SIZE");
  }

  data = new Uint8Array(event.data);

  ptr = (data[1] << 16 |
         data[2] << 8 |
         data[3]) + (data[0] << 24 >>> 0);

  desc = data[4];

  ctype = (desc & CTYPE_BITMASK) >> CTYPE_BITPOS;
  op = (desc & OP_BITMASK) >> OP_BITPOS;
  flag = (desc & FLAG_BITMASK);

  if (data.byteLength > 5) {
    try {
      if (ctype == PAYLOAD_TYPE_TEXT) {
        payload = abtoutf(data, 5);
      } else {
        tmp = new Uint8Array(data.length - 5);
        tmp.set(data.subarray(5));
        payload = tmp.buffer;
      }
    } catch (err) {
      return this.destroy(null, STATUS_PROTOCOL_ERROR, "ENCODING_ERR");
    }
  }

  if (this.onframe) {
    this.onframe(ptr, op, flag, payload);
  }
}


// Utf message parser implementation
function sockMessageUtfImpl(event) {
  var data = event.data;
  var ptr;
  var op;
  var flag;
  var ctype;
  var payload;
  var desc;

  if (!data || !data.length) {
    return this.destroy(null, STATUS_PROTOCOL_ERROR, "ERR_UNSUPPORTED_TYPE");
  }

  if (data.length < 8) {
    return this.destroy(null, STATUS_PROTOCOL_ERROR, "BAD_HEADER_SIZE_ERR");
  }

  try {
    data = atob(data);
  } catch (err) {
    return this.destroy(null, STATUS_PROTOCOL_ERROR, "ENCODING_ERR");
  }

  ptr = (data.charCodeAt(1) << 16 |
         data.charCodeAt(2) << 8 |
         data.charCodeAt(3)) + (data.charCodeAt(0) << 24 >>> 0);

  desc = data.charCodeAt(4);

  ctype = (desc & CTYPE_BITMASK) >> CTYPE_BITPOS;
  op = (desc & OP_BITMASK) >> OP_BITPOS;
  flag = (desc & FLAG_BITMASK);

  if (data.length > 5) {
    try {
      if (ctype == PAYLOAD_TYPE_TEXT) {
        payload = decodeURIComponent(escape(data.substr(5)));
      } else {
        // TODO: Convert to ArrayBuffer if possible
        payload = atobin(data.substr(5));
      }
    } catch (err) {
      return this.destroy(null, STATUS_PROTOCOL_ERROR, "ENCODING_ERR");
    }
  }

  if (this.onframe) {
    this.onframe(ptr, op, flag, payload);
  }
}


// Returns the binary representation of a mode expression. Returns null
// on invalid mode.
function getBinMode(modeExpr) {
  var result = 0;
  var match;

  if (!modeExpr) {
    return 0;
  }

  if (typeof modeExpr !== "string" || !(match = modeExpr.match(MODE_RE))) {
    return null;
  }

  match[1] && (result |= READ);
  match[2] && (result |= WRITE);
  match[3] && (result |= EMIT);

  return result;
}


function cloneData(data) {
  var clone;
  var buffer;

  if (!data || typeof data == "string") {
    return data;
  }

  if (typeof data.slice == 'function') {
    return data.slice(0);
  }

  buffer = new Uint8Array(data);
  clone = new Uint8Array(buffer.length);

  for (var i = 0, l = buffer.length; i < l; i++) {
    clone[i] = buffer[i];
  }

  return clone;
}