
TEST_HOST     = "localhost:7010";
TEST_CH       = TEST_HOST + "/x112233";
CALLBACK_URL  = null;

(function() {
  var href = window.location.href;
  var baseuri = window.location.href.split("?")[1];
  var transport = null;

  (baseuri = /callback=(.+)/.exec(href)) && (CALLBACK_URL = baseuri[1]);
  (transport = /transport=(.+)&|transport=(.+)/.exec(href)) &&
               transport && (transport[1] ? (transport = transport[1])
                            : (transport = transport[2]));

  if (transport) {
    window.__FORCE_TRANSPORT_SOCKET__ = transport;
  }
})()



function initTest(timeout, test) {
  var done = false;
  var time = (new Date()).getTime();
  var h1;
  var status;

  h1 = document.getElementsByTagName("h1")[0] ||
       document.getElementsByTagName("body")[0];


  status = document.createElement("span");
  status.className = "status";
  status.innerHTML = "running";
  status.style.fontSize = "0.7em";
  status.style.paddingLeft = "15px"
  h1.appendChild(status);

  function checkcallback(err, result) {
    if (!CALLBACK_URL) return;
    if (err) {
      err = err.message || err;
      window.parent.location.href = CALLBACK_URL + "fail:" + err;
    } else {
      window.parent.location.href = CALLBACK_URL + "done:" + result;
    }
  }

  function printresult(err, result) {
    if (err) {
      err = err.message || err;
      status.innerHTML = "failed: " + err;
    } else {
      status.innerHTML = "success (" + result + ")";
    }
  }

  setTimeout(function() {
    if (done) return;
    done = true;
    checkcallback("timeout");
    printresult("timeout");
  }, timeout);

  test(function(err) {
    var result;
    if (done) return;
    time = (new Date()).getTime() - time;
    result = (time / 1000 ) + "s";
    done = true;
    checkcallback(err, result);
    printresult(err, result);
  });
}


function createTestChannel(mode, ignoreErrors) {
  var url = TEST_CH;
  var chan;

  if (typeof ignoreErrors == "number") {
    url = TEST_HOST + "/" + ignoreErrors;
    ignoreErrors = false;
  }

  chan = new TestChannel(url, mode);

  if (ignoreErrors) {
    chan.on("error", function(err) { console.log("err %s", err) });
  }
  return chan;
}


function createPayload(size) {
  var index = size;
  var payload;

  if (typeof Uint8Array !== "undefined") {
    payload = new Uint8Array(size);
  } else {
    payload = new Array();
  }

  while (index--) {
    payload[index] = Math.floor(Math.random() * 256);
  }

  return payload;
}


function compareBuffers(a, b) {
  var lena = a && (a.length || a.byteLength);
  var lenb = b && (b.length || b.byteLength);

  if (lena != lenb) {
    return false;
  }

  if (typeof Uint8Array !== "undefined" &&
      b instanceof Uint8Array == false) {
    b = new Uint8Array(b.buffer || b);
  }

  while (lena--) {
    if (a[lena] != b[lena]) {
      return false;
    }
  }

  return true;
}

