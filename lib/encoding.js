

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
function createFrameBin(id, op, flag, data) {
  var poff = 0;
  var plen = 0;
  var chars;
  var payload;
  var view;
  var frame;
  var b;

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
      payload = data;
      plen = data.byteLength;
    } else if (data.buffer instanceof ArrayBuffer) {
      payload = data.buffer;
      poff = data.byteOffset;
      plen = data.byteLength;
    } else if (data.length) {
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
  view[0] = id >>> 24 & 0xff;
  view[1] = id >>> 16 & 0xff;
  view[2] = id >>> 8 & 0xff;
  view[3] = id % 256;
  view[4] = op << 3 | flag;

  if (plen) {
    view.set(new Uint8Array(payload, poff, plen), 5);
  }

  return frame;
}

// Creates an UTF frame
function createFrameUtf(id, op, flag, data) {
  var buffer;
  var frame;
  var view;
  var payload;
  var result;
  var b;

  if (data) {
    if (typeof data == "string") {
      payload = unescape(encodeURIComponent(data));
    } else if (data instanceof ArrayBuffer ||
               data.buffer instanceof ArrayBuffer) {
      buffer = data.buffer || data;
      view = new Uint8Array(buffer, data.byteOffset || 0, data.byteLength);
      payload = [];
      for (var i = 0, l = view.byteLength; i < l; i++) {
        payload[i] = String.fromCharCode(view[i]);
      }
    } else if (data.length) {
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
  frame[0] = String.fromCharCode((id >>> 24) & 0xff);
  frame[1] = String.fromCharCode((id >>> 16) & 0xff);
  frame[2] = String.fromCharCode((id >>> 8) & 0xff);
  frame[3] = String.fromCharCode(id & 0xff);
  frame[4] = String.fromCharCode(op << 3 | flag);

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
  var ch;
  var op;
  var flag;
  var data;
  var payload;
  var extra;
  var tmp;

  if ((data = event.data) instanceof ArrayBuffer == false) {
    return this.destroy(new Error("ERR_UNSUPPORTED_TYPE"));
  }

  if (event.data.byteLength < 5) {
    return this.destroy(new Error("ERR_BAD_HEADER_SIZE"));
  }

  data = new Uint8Array(event.data);

  ch = (data[1] << 16 |
        data[2] << 8 |
        data[3]) + (data[0] << 24 >>> 0);

  desc = data[4];
  op = ((desc >> 1) & 0xf) >> 2;
  flag = (desc << 1 & 0xf) >> 1;

  switch (op) {

    case 0x0: // NOOP
      break;

    case 0x1: // OPEN
      if (flag == OpenRequest.FLAG_REDIRECT) {

        if (data.byteLength < 9) {
          return this.destroy(new Error("ERR_BAD_PAYLOAD"));
        }

        extra = (data[6] << 16 |
                 data[7] << 8 |
                 data[8]) + (data[5] << 24 >>> 0);

        if (data.byteLength > 9) {
          try {
            payload = abtoutf(data, 9);
          } catch (err) {
            return this.destroy(new Error("ENCODING_ERR"));
          }
        }

      } else if (data.byteLength > 5) {
        try {
          payload = abtoutf(data, 5);
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.onopenframe(ch, flag, payload, extra);
      break;

    case 0x2: // DATA
      if (data.byteLength > 5) {
        try {
          if (flag & 1) {
            payload = abtoutf(data, 5);
          } else {
            tmp = new Uint8Array(data.length - 5);
            tmp.set(data.subarray(5));
            payload = tmp.buffer;
          }
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.ondataframe(ch, flag, payload);
      break;

    case 0x3: // SIGNAL
      if (data.byteLength > 5) {
        try {
          payload = abtoutf(data, 5);
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.onsignalframe(ch, flag, payload);
      break;
  }
}


// Utf message parser implementation
function sockMessageUtfImpl(event) {
  var data = event.data;
  var ch;
  var op;
  var flag;
  var payload;
  var desc;
  var extra;

  if (!data || !data.length) {
    return this.destroy(new Error("ERR_UNSUPPORTED_TYPE"));
  }

  if (data.length < 8) {
    return this.destroy(new Error("BAD_HEADER_SIZE_ERR"));
  }

  try {
    data = atob(data);
  } catch (err) {
    return this.destroy(new Error("ENCODING_ERR"));
  }

  ch = (data.charCodeAt(1) << 16 |
        data.charCodeAt(2) << 8 |
        data.charCodeAt(3)) + (data.charCodeAt(0) << 24 >>> 0);

  desc = data.charCodeAt(4);

  op = ((desc >> 1) & 0xf) >> 2;
  flag = (desc << 1 & 0xf) >> 1;

  switch (op) {

    case 0x0: // NOOP
      break;

    case 0x1: // OPEN
      if (flag == OpenRequest.FLAG_REDIRECT) {
        if (data.length < 9) {
          return this.destroy(new Error("INVALID_PAYLOAD_ERR"));
        }
        try {
          extra = (data.charCodeAt(6) << 16 |
                   data.charCodeAt(7) << 8 |
                   data.charCodeAt(8)) +
                   (data.charCodeAt(5) << 24 >>> 0);
          if (data.length > 9) {
            payload = decodeURIComponent(escape(data.substr(9)));
          }
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      } else if (data.length > 5) {
        try {
          payload = decodeURIComponent(escape(data.substr(5)));
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.onopenframe(ch, flag, payload, extra);
      break;

    case 0x2: // DATA
      if (data.length > 5) {
        try {
          if (flag & 1) {
            payload = decodeURIComponent(escape(data.substr(5)));
          } else {
            payload = atobin(data.substr(5));
          }
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.ondataframe(ch, flag, payload);
      break;

    case 0x3: // SIGNAL
      if (data.length > 5) {
        try {
          payload = decodeURIComponent(escape(data.substr(5)));
        } catch (err) {
          return this.destroy(new Error("ENCODING_ERR"));
        }
      }
      this.onsignalframe(ch, flag, payload);
      break;
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