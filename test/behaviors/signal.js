var request = require("request");
var signal = require("signal");

if (request.getToken() == "ping") {
  signal.reply("pong");
} else {
  signal.reply("bad token: " + request.getToken());
}