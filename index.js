var server = require("./server");
var router = require("./router");
var requestHandlers = require("./requestHandlers");

var handle = {}
handle["/"] = requestHandlers.start;
handle["/login"] = requestHandlers.login;
handle["/getroom"] = requestHandlers.getRoom;
handle["/getroomstatus"] = requestHandlers.getRoomStatus;
server.start(router.route, handle);
