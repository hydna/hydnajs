
TEST_HOST     = "localhost:7010";
TEST_CH       = TEST_HOST + "/x112233";


function initTest(timeout, test) {
  var baseuri = window.location.href.split("?")[1];
  var docallback = baseuri && !(!baseuri.length);
  var done = false;
  var time = (new Date()).getTime();
  var h1;
  var status;

  h1 = document.getElementsByTagName("h1")[0] ||
       document.getElementsByTagName("body")[0];

  status = document.createElement("span");
  status.className = "status";
  status.innerText = "running";
  status.style.fontSize = "0.7em";
  status.style.paddingLeft = "15px"
  h1.appendChild(status);

  function checkcallback(err) {
    if (!docallback) return;
    if (err) {
      err = err.message || err;
      window.parent.location.href = baseuri + "fail:" + err;
    } else {
      window.parent.location.href = baseuri + "done";
    }
  }

  function printresult(err) {
    if (err) {
      err = err.message || err;
      status.innerText = "failed: " + err;
    } else {
      status.innerText = "success (" + (time / 1000 )+ "s)";
    }
  }

  setTimeout(function() {
    if (done) return;
    done = true;
    checkcallback("timeout");
    printresult("timeout");
  }, timeout);

  test(function(err) {
    if (done) return;
    time = (new Date()).getTime() - time;
    done = true;
    checkcallback(err);
    printresult(err);
  });
}


function createTestChannel(mode, ignoreErrors) {
  var chan = new HydnaChannel(TEST_CH, mode);
  if (ignoreErrors) {
    chan.on("error", function() { });
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
  var lena = a.length || a.byteLength;
  var lenb = b.length || b.byteLength;

  if (lena != lenb) {
    return false;
  }

  while (lena--) {
    if (a[lena] != b[lena]) {
      return false;
    }
  }

  return true;
}

