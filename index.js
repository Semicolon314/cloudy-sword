// Load required modules
var express = require("express");
var favicon = require("serve-favicon");
var socketio = require("socket.io");
var LobbyData = require("./static/lobbydata.js");
var util = require("util");

// Create the express app
var app = express();

//Console input
process.stdin.resume();
process.stdin.setEncoding('utf8');

// Set up static file directory and favicon
app.use("/static", express.static(__dirname + "/static"));
app.use(favicon(__dirname + "/static/favicon.ico"));

/* ------------ APPLICATION PAGES ------------ */
app.get("/", function(req, res) {
    res.sendfile(__dirname + "/views/index.html");
});

/* ------------ START SERVER ------------ */
var server = app.listen(5000, function() {
    console.log("Server listening on port %d", server.address().port);
});

/* ------------ SOCKET.IO ------------ */
var io = socketio.listen(server, {log: false});

// Set up Socket.IO connection handler
io.sockets.on("connection", function(socket) {    
    var client = lobby.addClient(socket);
    
    socket.on("ping", function() {
        socket.emit("pong", "");
    });
    socket.on("sudo", function(data) {
        io.sockets.emit(data.channel, data.message);
    });
});

/* ------------ GAME STUFF ------------ */
// Create a lobby data object
var lobby = new LobbyData(io);
// Create some games in it
lobby.addGame({rows: 25, cols: 25});
lobby.addGame({});

//A variable to get the current instance
var _this = this;

/* ------------ CONSOLE --------------- */
process.stdin.on('data', function (text) {
    var command = util.inspect(text).substring(1, util.inspect(text).length-5);
    var args = command.split(" ");
    if (args[0] == "?" || args[0] == "help") {
        console.log("XxXxXx--HELP--xXxXxX");
        console.log("quit - Exit cloudy-sword");
        console.log("msg - Private Message someone");
        console.log("r - Reply to a Private Message");
    } else if (args[0] == "quit" || args[0] == "exit") {
        console.log("bye!");
        process.exit();
    } else if (args[0] == "message" || args[0] == "msg") {
        if (args.length < 3) {
            console.log("msg [username] [message]");
        } else {
            if (lobby.getClientByName(args[1]) != null) {
                var message = "";
                for (var i = 2; i < args.length; i++) {
                    message += args[i] + " ";
                }
                lobby.replyTo = args[1];
                lobby.getClientByName(args[1]).socket.emit("message", "The Console whispers " + message);
                console.log("[console -> " + args[1] + "] " + message);
            } else {
                console.log("That user does not exist");
            }
        }
    } else if (args[0] == "reply" || args[0] == "r") {
        if (args.length < 1) {
            console.log("r [message]");
        } else {
            if (lobby.replyTo != null) {
                var message = "";
                for (var i = 1; i < args.length; i++) {
                    message += args[i] + " ";
                }
                lobby.getClientByName(lobby.replyTo).socket.emit("msguser", {from:"The Console", to:lobby.replyTo, message:message});
                console.log("[console -> " + lobby.replyTo + "] " + message);
            } else {
                console.log("You have no one whom you can reply to");
            }
        }
    } else {
        console.log("Unknown command. Type 'help' for help");
    }
});