
function hasFlashSupport() {
  var nav = global.navigator;
  var mkey = "application/x-shockwave-flash";
  var ActiveX;
  var mimes;
  var major;
  var plugin;

  if ((/android/i).test(nav.userAgent)) {
    return false;
  }

  if (typeof nav.plugins != "undefined" &&
      (plugin = nav.plugins["Shockwave Flash"]) &&
      plugin.description &&
      ((mime = nav.mimeTypes) && mime[mkey] && mime[mkey].enabledPlugin)) {
    major = /\s(\d+)/.exec(plugin.description);
    return major[1] && (parseInt(major[1]) > 9);
  } else if ((ActiveX = global.ActiveXObject)) {
    try {
      if ((plugin = new ActiveX("ShockwaveFlash.ShockwaveFlash"))) {
        major = /\s(\d+)/.exec(plugin.GetVariable("$version"));
        return major[1] && (parseInt(major[1]) > 9);
      }
    } catch(e) {
      return false;
    }
  }

  return false;
}


var FlashTransport = {
  sockets: {},
  ready: false,
  bridge: null,

  embed: function() {
    var body;
    var str = [];
    var vars = [];
    var objname;
    var flashid;
    var codebase;
    var pluginpage;
    var members;
    var path;
    var bridge;
    var tmpl;
    var id;

    // Use channel as our global object if not using AMD-support.
    if (typeof define === 'function' && define.amd) {
      do {
        objname = '__hydnaFlashTransport' + (Math.random() * 0xFFFFFFFF);
      } while(global.document.getElementById(objname));
      window[objname] = FlashTransport;
    } else {
      objname = OBJECT_NAME + '.__bridge';
      Channel.__bridge = FlashTransport;
    }


    // Both `name` and `id` is required by internet explorer.
    do {
      id = "__" + time();
    } while(global.document.getElementById(id));

    members = { onhandshake: 1, onready: 1, onopen: 1,
                onclose: 1, onerror: 1, onmessage: 1 };

    for (var key in members) {
      vars.push(key + "=" + objname + "." + key);
    }

    codebase = "http://fpdownload.macromedia.com/pub/shockwave/cabs/"
               "flash/swflash.cab#version=9,0,0,0";

    pluginpage = "http://www.macromedia.com/go/getflashplayer";

    path = FLASH_PATH + "?" + (Math.random() * 0xFFFFFFFF);

    str[0 ] = '<object name="' + id + '" id="' + id + '"' +
              ' classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000"' +
              ' codebase="' +  codebase + '" name=' +
              ' width="1" height="1">';
    str[1 ] = '<param name="allowScriptAccess" value="always"></param>';
    str[2 ] = '<param name="allowNetworking" value="true"></param>';
    str[3 ] = '<param name="movie" value="' + path + '"></param>';
    str[4 ] = '<param name="quality" value="low"></param>';
    str[5 ] = '<param name="menu" value="false"></param>';
    str[6 ] = '<param name="FlashVars" value="' + vars.join("&") + '">';
    str[7 ] = '</param><param name="bgcolor" value="#ffffff"></param>';
    str[8 ] = '<param name="wmode" value="transparent"></param>';
    str[9 ] = '<embed  src="' + path + '" quality="low" bgcolor="#ffffff"' +
              ' wmode="transparent" width="1" height="1"' +
              ' swLiveConnect="true" allowScriptAccess="always"' +
              ' allowNetworking="true" menu="false"' +
              ' type="application/x-shockwave-flash"' +
              ' FlashVars="' + vars.join("&") + '"' +
              ' pluginspage="' + pluginpage + '">';
    str[10] = '</object>';

    tmpl = document.createElement("div");
    tmpl.innerHTML = str.join("");
    bridge = tmpl.childNodes[0];

    if (!global.document.all) {
      for (var i = 0; i < bridge.childNodes.length; i++) {
        if (bridge.childNodes[i].nodeName.toUpperCase() == "EMBED") {
          bridge = bridge.childNodes[i];
          break;
        }
      }
    }

    bridge.style.position = "absolute";
    bridge.style.top = "0px";
    bridge.style.left = "0px";
    bridge.style.width = "1px";
    bridge.style.height = "1px";
    bridge.style.zIndex = "-100000";

    body = document.getElementsByTagName('body')[0];
    body.appendChild(bridge);

    FlashTransport.bridge = bridge;
  },

  onhandshake: function() {
    return typeof navigator !== "undefined" && navigator.userAgent || "none";
  },

  onready: function() {
    nextTick(function() {
      var sockets = FlashTransport.sockets;
      var socket;
      var url;

      FlashTransport.ready = true;

      for (var id in sockets) {
        socket = FlashTransport.sockets[id];
        socket.init();
      }
    });
    return true;
  },

  onopen: function(id) {
    var socket;
    if ((socket = FlashTransport.sockets[id])) {
      socket.openHandler();
    }
  },

  onmessage: function(id, data) {
    var socket;
    if ((socket = FlashTransport.sockets[id])) {
      socket.messageHandler(data);
    }
  },

  onerror: function(id, err) {
    var socket;
    if ((socket = FlashTransport.sockets[id])) {
      socket.errorHandler(err);
    }
  },

  onclose: function(id) {
    var socket;
    if ((socket = FlashTransport.sockets[id])) {
      socket.closeHandler();
    }
  }
};


function FlashSocket(url) {
  var self = this;

  this.id = uniqueId();
  this.url = url;
  this.connected = false;

  this.initTimer = setTimeout(function () {
    self.errorHandler("FLASH_INIT_TIMEOUT_ERR");
  }, 15000);
}


FlashSocket.prototype.fallbackTransport = "comet";

FlashSocket.prototype.onmessage = sockMessageUtfImpl;
FlashSocket.prototype.createFrame = createFrameUtf;
FlashSocket.prototype.openHandler = bridgeOpenHandler;
FlashSocket.prototype.closeHandler = bridgeCloseHandler;
FlashSocket.prototype.errorHandler = bridgeErrorHandler;
FlashSocket.prototype.messageHandler = bridgeMessageHandler;


FlashSocket.prototype.init = function () {
  var urlobj = parseUri(this.url);
  var url = urlobj.protocol + "://" + urlobj.host;

  if (urlobj.protocol == 'https') {
    // Currently no support for HTTPS over flash
    this.errorHandler("FLASH_TLS_ERR");
    return;
  } 

  FlashTransport.bridge.init(this.id, url);
};


FlashSocket.prototype.send = function(data) {
  var id = this.id;
  nextTick(function () {
    FlashTransport.bridge.send(id, data);
  });
};


FlashSocket.prototype.close = function(code, reason) {
  if (!this.id) {
    return;
  } 

  if (this.connected) {
    FlashTransport.bridge.close(this.id);
    this.connected = false;
  }

  if (this.initTimer) {
    clearTimeout(this.initTimer);
    this.initTimer = null;
  }

  delete FlashTransport.sockets[this.id];

  this.id = null;

  if (!this.onclose) {
    return;
  }

  this.onclose({
    type: "close",
    code: code || STATUS_NO_STATUS_RCVD,
    reason: reason || "FLASH_UNKNOWN_ERR"
  });

};


function flashSocketInit(url) {
  var socket;

  socket = new FlashSocket(url);

  FlashTransport.sockets[socket.id] = socket;

  if (!FlashTransport.bridge) {
    FlashTransport.embed();
  }

  if (FlashTransport.ready) {
    socket.init();
  }

  return socket;
}


if ((typeof DISABLE_FLASH == "undefined" || DISABLE_FLASH == false) &&
     hasFlashSupport()) {
  AVAILABLE_TRANSPORTS["flash"] = flashSocketInit;
  DEFAULT_TRANSPORT = DEFAULT_TRANSPORT || "flash";
}