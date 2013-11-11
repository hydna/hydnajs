// parserUri
// Based on Steve Levithan's parseUri
// (c) Steven Levithan <stevenlevithan.com>
// MIT License
var parseUri = (function() {
  var PARSE_RE = /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;
  var KEYS = ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"];

  return function(str) {
  	var m = PARSE_RE.exec(str);
    var uri = {};
  	var i = 14;
  	var authority;

  	while (i--) m[i] && (uri[KEYS[i]] = m[i]);

    if ((authority = uri.authority) && (i = authority.indexOf("@")) !== -1) {
      uri.authority = authority.substr(i + 1);
    }

    uri.path = uri.path || '/';

  	return uri;
  };
})();
