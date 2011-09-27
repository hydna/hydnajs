var createServer = require("http").createServer;
var server;
server = createServer(function(req, res) {
  var content = require("fs").readFileSync("iframe.html");
  if (/^\/\?/.test(req.url)) {
    res.writeHead(200, { "content-Type": "text/html" });
    res.end(content);
  } else {
    res.writeHead(404, { "content-Type": "text/html" });
    res.end("NOT_FOUND");
  }
});
server.listen(8080);