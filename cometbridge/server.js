var createServer = require("http").createServer;
var server;
server = createServer(function(req, res) {
  var content = require("fs").readFileSync("iframe.html");
  res.writeHead(200, { "content-Type": "text/html" });
  res.end(content);
});
server.listen(8080);