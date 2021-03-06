/** The interface class manages the user interface.
  * It keeps track of things like which unit is selected.
  * It is designed so that it can be fully replaced by another interface
  * that works on another platform, or that looks different.
  */

// Declare constants
var HEX_HEIGHT = 200; //pixels
var PLAYER_COLORS = ["#FF0000", "#0000FF", "#00FF00", "#FF00FF"]; // Colours for the different players
  
/** Creates the interface object.
  * Needs a reference to the canvas to set up click handlers.
  * Needs references to the game state and socket to actually change stuff.
  */
var Interface = function(canvas, gs, socket) {
    /* ------------ VARIABLES ------------ */
    // Save parameters
    this.canvas = canvas;
    this.gs = gs;
    this.socket = socket;
    
    // Interface state
    this.uistate = 0;
    // 0 - in lobby
    // 1 - in game
    
    // Set up message log
    this.messages = [];
    
    // Some interface variables
    this.oldmx = 0; // Last mouse x position
    this.oldmy = 0; // Last mouse y position
    this.dragx = 0; // Where the drag started
    this.dragy = 0;
    this.dragging = false;
    this.mousedown = false;
    this.offsetx = 200;
    this.offsety = 0;
    this.scale = 1.0;
    this.clientid = -1; // What our id is
    this.playingAs = -1; // Whether or not we are actually playing in the current game
    this.selectedTile = {x: -1, y: -1}; // Currently selected tile
    this.usingAbility = -1; // Currently using ability?
    
    // Game list
    this.gamelist = {};
    // Client list
    this.clientlist = {};
    
    // Ping time for pinging
    var pingtime = 0;
    
    // Last person to have been messaged, or received a message from
    var replyTo = null;
    
    var _this = this;
    
    /* ------------ SOCKET.IO CALLBACKS ------------ */
    socket.on("connecting", function() {
        _this.addMessage("Connecting to server...");
    });
    socket.on("connect", function() {
        _this.addMessage("Connected");
        _this.uistate = 0; // Switch to lobby
        _this.sendPing();
    });
    socket.on("pong", function(data) {
        _this.addMessage("Ping: " + (new Date().getTime() - _this.pingtime) + "ms.");
    });
    socket.on("disconnect", function() {
        _this.addMessage("Disconnected from the server.");
    });
    socket.on("gsfull", function(data) {
        // Reload the entire game state
        _this.gs.load(data);
    });
    socket.on("gsupdate", function(data) {
        // Update the game state
        _this.gs.update(data);
    });
    socket.on("action", function(data) {
        // Update with the action
        _this.gs.doAction(data);
        
        if(data.type == "ability") {
            // Since there are no ability animations yet, do a text indication of what happened in the chat
            // Get the unit
            var castingUnit = _this.gs.map.tileUnit(data.unit);
            var controllerText = "Your";
            if(castingUnit.controller != _this.playingAs) {
                controllerText = _this.clientlist[_this.gs.players[castingUnit.controller]] + "'s";
            }
            // Get the unit name
            var unitName = castingUnit.name();
            // Get the ability name
            var abilityName = castingUnit.abilities[data.ability].name;
            // Add the message
            _this.addMessage(controllerText + " " + unitName + " used the ability " + abilityName + ".");
        }
        
    });
    socket.on("gamelist", function(data) {
        // Update the local list of games
        for(var i in data) {
            if(data.hasOwnProperty(i)) {
                _this.gamelist[i] = data[i];
            }
        }
    });
    socket.on("clientid", function(data) {
        _this.clientid = data;
    });
    socket.on("clientlist", function(data) {
        if(data.full) { // Whether the update is a full list, or just an update
            _this.clientlist = data;
        } else {
            for(var i in data) {
                if(data.hasOwnProperty(i)) {
                    if(data[i] == null) {
                        _this.addMessage(_this.clientlist[i] + " has left the room");
                        delete _this.clientlist[i];
                    } else {
                        if(typeof _this.clientlist[i] === "undefined") { // Only do join message if the client is a new client
                            if (i != "full") {
                                _this.addMessage(data[i] + " has joined the room");
                            }
                        }
                        _this.clientlist[i] = data[i];
                    }
                }
            }
        }
        delete _this.clientlist["full"];
    });
    socket.on("kick", function(data) { // Kicked out of game room
        _this.uistate = 0; // Switch to lobby
    });
    socket.on("sudo", function(data) {
        _this.socket.emit(data.channel, data.message);
    });
    socket.on("playingas", function(data) {
        _this.playingAs = data.id;
    });
    socket.on("message", function(data) {
        _this.addMessage(data);
    });
    socket.on("chat", function(data) {
        _this.replyTo = data.from;
        if(typeof data.to !== "undefined") {
            _this.addMessage("[" + data.from + " \u2192 " + _this.clientlist[_this.clientid] + "] " + data.message);
        } else {
            _this.addMessage(data.from + ": " + data.message);
        }
    });
    
    
    /* ------------ CANVAS CALLBACKS ------------ */
    this.canvas.onclick = function(e) {
        var mx = e.pageX - e.target.offsetLeft;
        var my = e.pageY - e.target.offsetTop;
        
        if(_this.uistate == 0) { // Lobby
            var k = 0; // Drawing index
            for(var i in _this.gamelist) {
                if(_this.gamelist.hasOwnProperty(i)) {
                    // Check if mouse is over this game state
                    if(mx >= 0 && mx < 400 && my >= 10 + k * 50 && my < 50 + k * 50) {
                        // Join this game
                        socket.emit("joingame", {gameId: i});
                        // Change uistate to in game
                        _this.uistate = 1; // In-game
                    }
                    
                    k++;
                }
            }
        } else if(_this.uistate == 1) { // In-game
            if(!_this.dragging) {
                var tile = _this.gs.map.hexAtTransformed(mx, my, 0, 0, _this.offsetx, _this.offsety, _this.scale);
                if(tile.x >= 0 && tile.x < _this.gs.map.cols() && tile.y >= 0 && tile.y < _this.gs.map.rows()) {
                    _this.clickTile(tile);
                }
            }
        }
    };
    this.canvas.onmousedown = function(e) {
        _this.oldmx = e.pageX - e.target.offsetLeft;
        _this.oldmy = e.pageY - e.target.offsetTop;
        _this.dragx = _this.oldmx;
        _this.dragy = _this.oldmy;
        _this.mousedown = true;
        _this.dragging = false;
    }
    this.canvas.onmousemove = function(e) {
        var mx = e.pageX - e.target.offsetLeft;
        var my = e.pageY - e.target.offsetTop;
        
        if(_this.mousedown) {
            if(_this.uistate == 1) { // In-game
                if(_this.dragging || Math.abs(mx - _this.dragx) > 30 || Math.abs(my - _this.dragy) > 30) {
                    _this.dragging = true;
                    _this.offsetx -= mx - _this.dragx;
                    _this.offsety -= my - _this.dragy;
                    _this.dragx = mx;
                    _this.dragy = my;
                }
            }
        }
        
        _this.oldmx = mx;
        _this.oldmy = my;
    }
    this.canvas.onmouseup = function(e) {
        _this.mousedown = false;
    }
    var canvasScroll = function(e) {
        var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
        //alert(delta);
        if(_this.uistate == 1) { // In-game
            _this.scale += delta * 0.1;
            if(_this.scale < 0.2) _this.scale = 0.2;
            if(_this.scale > 2.0) _this.scale = 2.0;
        }
    }
    this.canvas.addEventListener("mousewheel", canvasScroll, false); // Most browsers
    this.canvas.addEventListener("DOMMouseScroll", canvasScroll, false); // Firefox
    
    
    /* ------------ WINDOW CALLBACKS ------------ */
    window.onresize = this.resize;
    document.onselectstart = function() { return false; }; // Prevents cursor when dragging map
    // Key press
    window.onkeypress = function(e) {
        if(!e) e = window.event;
        var key = e.keyCode || e.which;
        
        // Ensure that the chat box isn't selected
        if(document.activeElement == document.getElementById("chat"))
            return;
            
        // UI State independent keys
        if(key == 13) { // Enter
            // Focus the chat
            document.getElementById("chat").focus();
        }
        
        if(_this.uistate == 1) { // In-game
            // Make a copy of the tile so that it doesn't cause pointer issues
            var tile = {x: _this.selectedTile.x, y: _this.selectedTile.y};
            var action = null;
            
            if(key == 108) { // L (exit to lobby)
                _this.uistate = 0;
                _this.socket.emit("leavegame");
                return;
            }
            if(key == 119) { // W
                // Move up-left
                action = {type: "move", tile: tile, dir: {x: 0, y: -1}};
            }
            if(key == 101) { // E
                // Move up-right
                action = {type: "move", tile: tile, dir: {x: 1, y: -1}};
            }
            if(key == 97) { //A
                // Move left
                action = {type: "move", tile: tile, dir: {x: -1, y: 0}};
            }
            if(key == 100) { //D
                // Move right
                action = {type: "move", tile: tile, dir: {x: 1, y: 0}};
            }
            if(key == 122) { //Z
                // Move down-left
                action = {type: "move", tile: tile, dir: {x: -1, y: 1}};
            }
            if(key == 120) { //X
                // Move down-right
                action = {type: "move", tile: tile, dir: {x: 0, y: 1}};
            }
            if(key == 116) { // T
                // End turn
                action = {type: "end"};
            }
            if(key >= 49 && key <= 57) { // 1 to 9
                var num = key - 49;
                // Try to use ability num
                var unit = _this.gs.map.tileUnit(tile);
                if(unit != null && unit.controller == _this.playingAs && unit.abilities.length > num) {
                    _this.usingAbility = num;
        
                    this.gs.map.clearCache();
                }
            }
            if(action == null) // The key press an action
                return;
                
            // Check if the action is valid
            if(_this.gs.validAction(action, _this.playingAs)) {
                _this.doAction(action);
            }
        }
    }
    
    /* ------------ FINAL INITIALIZATION ------------ */
    this.addMessage("Initialized.");
    this.resize();
    this.render();
};

/** Does the given action and updates interface elements if needed */
Interface.prototype.doAction = function(action) {
    if(action.type == "move") {
        // Move the cursor
        this.selectedTile = {x: action.tile.x + action.dir.x, y: action.tile.y + action.dir.y};
    }
    // Do the action locally
    this.gs.doAction(action);
    // Send the action to the server
    this.socket.emit("action", action);
}

/** Adds the given message to the message log */
Interface.prototype.addMessage = function(message) {
    // No longer displayed but kept as a more easily parsed log of messages
    this.messages.push(message);
    
    // Escape some characters so that the message displays nicely in HTML
    message = message.replace(/&/g, "&amp;");
    message = message.replace(/</g, "&lt;");
    message = message.replace(/>/g, "&gt;");
    
    // Grab the chat log inner element
    var chatlog = document.getElementById("chatlog");
    chatlog.innerHTML += message + "<br>";
    chatlog.scrollTop = chatlog.scrollHeight;
};

/** Clicks the selected tile on the game state
  * Can be called in response to a click or to simulate a click
  */
Interface.prototype.clickTile = function(tile) {
    if(this.uistate == 1) { // In-game
        if(this.usingAbility == -1) {
            if(this.gs.map.onGrid(tile)) {
                this.selectedTile = tile;
            } else {
                this.selectedTile = {x: -1, y: -1};
            }
        } else {
            var unit = this.gs.map.tileUnit(this.selectedTile);
            ability = unit.abilities[this.usingAbility];
            if(this.gs.map.validTarget(tile, unit, ability)) {
                // Do an ability action
                var action = {type: "ability", unit: unit.pos, ability: this.usingAbility, target: tile};
                this.doAction(action);
            } else {
                this.addMessage("Invalid target.");
            }
            this.usingAbility = -1;
        }
        
        this.gs.map.clearCache();
    }
};

/** Moves the selected tile by the given amount */
Interface.prototype.moveSelected = function(dx, dy) {
    if(this.selectedTile.x == -1 || this.selectedTile.y == -1) {
        this.selectedTile.x = Math.floor(this.gs.map.cols() / 2);
        this.selectedTile.y = Math.floor(this.gs.map.rows() / 2);
        return;
    }
    
    this.selectedTile.x += dx;
    this.selectedTile.y += dy;
    if(this.selectedTile.x < 0 || this.selectedTile.x >= this.gs.map.cols() || this.selectedTile.y < 0 || this.selectedTile.y >= this.gs.map.rows() || this.gs.map.terrain[this.selectedTile.y][this.selectedTile.x] == Tile.EMPTY) {
        this.selectedTile.x -= dx;
        this.selectedTile.y -= dy;
    }
};

Interface.prototype.resize = function() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.render();
};

Interface.prototype.render = function() {
    // Get the context
    var ctx = this.canvas.getContext("2d");
    // Clear the canvas with a black background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if(this.uistate == 0) { // Lobby
        // Draw the list of games
        ctx.font = "20px Arial";
        var k = 0; // Drawing index
        for(var i in this.gamelist) {
            if(this.gamelist.hasOwnProperty(i)) {
                var summary = this.gamelist[i];
                ctx.fillStyle = "#AAAAAA";
                // Check if mouse is over it
                if(this.oldmx >= 0 && this.oldmx < 400 && this.oldmy >= 10 + k * 50 && this.oldmy < 50 + k * 50)
                    ctx.fillStyle = "#DDDDDD";
                // Draw the back box
                ctx.fillRect(0, 10 + k * 50, 400, 40);
                // Draw the text
                ctx.fillStyle = "#444444";
                ctx.fillText("Game " + i + ": " + summary.players + "/" + summary.numPlayers + " players; Map: " + summary.mapsize, 10, 35 + k * 50);
                
                k++;
            }
        }
    }
    if(this.uistate == 1) { // In-game
        // Draw the map
        this.renderMap(ctx, 10, 10, this.canvas.width - 10, this.canvas.height - 10, this.offsetx, this.offsety, this.scale);
        
        // Draw the big rightmost UI
        ctx.fillStyle = "#DDDDDD";
        ctx.fillRect(canvas.width - 250, 0, 250, canvas.height - 157);
        
        // Check if a unit is selected; if so, draw some info
        var unit = this.gs.map.tileUnit(this.selectedTile);
        if(unit != null) {
            ctx.fillStyle = "#222222";
            ctx.font = "24px Arial";
            ctx.fillText(unit.raceName() + " " + unit.className(), canvas.width - 240, 30);
            ctx.font = "20px Arial";
            ctx.fillText("Controller: " + (unit.controller + 1), canvas.width - 240, 70);
            ctx.fillText("Stats", canvas.width - 240, 110);
            ctx.font = "16px Arial";
            ctx.fillText("ST: " + unit.st, canvas.width - 220, 130);
            ctx.fillText("DX: " + unit.dx, canvas.width - 150, 130);
            ctx.fillText("IQ: " + unit.iq, canvas.width - 80, 130);
            
            ctx.font = "20px Arial";
            ctx.fillText("Health: " + unit.health + "/" + unit.hp, canvas.width - 240, 170);
            ctx.fillText("Mana: " + unit.mana + "/" + unit.mn, canvas.width - 240, 200);
            
            // Make steps text red if the unit is out of steps
            if(unit.steps >= unit.speed) ctx.fillStyle = "#880000";
            ctx.fillText("Steps: " + unit.steps + "/" + unit.speed, canvas.width - 240, 240);
            
            // Show abilities
            ctx.fillStyle = "#222222";
            for(var i = 0; i < unit.abilities.length; i++) {
                ctx.fillText((i + 1) + " - " + unit.abilities[i].name, canvas.width - 240, 280 + 20 * i)
            }
        }
    }
    
    // Draw users in this room
    ctx.fillStyle = "#BBBBBB";
    ctx.fillRect(0, canvas.height - 157, 250, 157);
    ctx.fillStyle = "#222222";
    ctx.font = "20px Arial";
    ctx.fillText("Players in Room", 5, canvas.height - 136);
    ctx.font = "16px Arial";
    var k = 0;
    for(var i in this.clientlist) {
        if(this.clientlist.hasOwnProperty(i)) {
            var ctext = this.clientlist[i];
            if(i == this.clientid) {
                ctext += " (You)";
            } else if(this.uistate == 1) { // In-game
                // See what player in the game this player is
                var ingameid = this.gs.hasPlayer(i);
                if(ingameid != -1) {
                    ctext += " (Player " + (ingameid + 1) + ")";
                }
            }
            ctx.fillText(ctext, 10, canvas.height - 115 + 20 * k);
            k++;
        }
    }
    if(this.uistate == 1) { // If In-game, add some text for Playing As in the user list box
        // Indicate what playingAs is
        if(this.playingAs != -1) {
            ctx.fillText("You are Player " + (this.playingAs + 1), 10, this.canvas.height - 10);
        } else {
            ctx.fillText("You are spectating", 10, this.canvas.height - 10);
        }
    }
    
    // Fill in right part of UI
    ctx.fillStyle = "#BBBBBB";
    ctx.fillRect(canvas.width - 250, canvas.height - 157, 250, 157);
    ctx.fillStyle = "#222222";
    ctx.font = "20px Arial";
    ctx.fillText("Turn: " + (this.gs.turn + 1), canvas.width - 240, canvas.height - 136);
    if(this.usingAbility != -1) {
        var unit = this.gs.map.tileUnit(this.selectedTile);
        var ability = unit.abilities[this.usingAbility];
        ctx.fillText("Casting: " + ability.name, canvas.width - 240, canvas.height - 100);
    }
};

Interface.prototype.renderMap = function(ctx) {
    var map = this.gs.map;
    var x = 0;
    var y = 0;
    var width = this.canvas.width - 250;
    var height = this.canvas.height - 157;
    var scale = this.scale;
    var sx = this.offsetx / scale;
    var sy = this.offsety / scale;
    var swidth = width / scale;
    var sheight = height / scale;
    
    
    var image = map.getImage({selectedTile: this.selectedTile, usingAbility: this.usingAbility});
    
    ctx.drawImage(image, sx, sy, swidth, sheight, x, y, width, height);
};

Interface.prototype.processChat = function(chat) {
    if(chat.charAt(0) == "/") {
        var sp = chat.split(" ");
        if (sp[0] == "/help") {
            this.addMessage("+=+=+=+=+Help+=+=+=+=+");
            this.addMessage("/clear - Clears the chat window");
            this.addMessage("/msg - Private Message someone");
            this.addMessage("/r - Reply to a last messaged person");
        } else if (sp[0] == "/clear") {
            this.messages = [];
            document.getElementById("chatlog").innerHTML = "";
            this.addMessage("Chat cleared");
        } else if(sp[0] == "/name") {
            var regex = /^[-a-z0-9]+$/i;
            if(sp.length > 1 && (sp[1].length > 3 || sp[1] == "Sam") && regex.test(sp[1])) {
                this.socket.emit("changename", sp[1]);
            }
        } else if (sp[0] == "/msg") {
            if (sp.length < 2) {
                this.addMessage("/msg [user] [message]");
            } else {
                var message = "";
                for (var i = 2; i < sp.length; i++) {
                    message += sp[i] + " ";
                }
                if (this.getClientByName(sp[1]) != null || sp[1] == "console") {
                    this.replyTo = sp[1];
                    this.socket.emit("chat", {to:sp[1], message:message});
                    this.addMessage("[" + this.clientlist[this.clientid] + " \u2192 " + sp[1] + "] " + message);
                } else {
                    this.addMessage("User not found!");
                }
            }
        } else if (sp[0] == "/r") {
            if (sp.length < 1) {
                this.addMessage("/r [message]");
            } else {
                if (this.replyTo == null) {
                    this.addMessage("You have no one whom you can reply to");
                } else {
                    var message = "";
                    for (var i = 1; i < sp.length; i++) {
                        message += sp[i] + " ";
                    }
                    this.socket.emit("chat", {to:this.replyTo, message:message});
                    this.addMessage("[" + this.clientlist[this.clientid] + " \u2192 " + this.replyTo + "] " + message);
                }
            }
        } else {
            this.addMessage("Unknown command. Type /help for help");
        }
    } else {
        this.socket.emit("chat", {message: chat});
        this.addMessage(this.clientlist[this.clientid] + ": " + chat);
    }
};

Interface.prototype.getClientByName = function(name) {
    for(var i in this.clientlist) {
        if(this.clientlist.hasOwnProperty(i)) {
            if(this.clientlist[i] == name) {
                return this.clientlist[i];
            }
        }
    }
    return null;
};

Interface.prototype.sendPing = function() {
    this.pingtime = new Date().getTime();
    this.socket.emit("ping", {});
};
