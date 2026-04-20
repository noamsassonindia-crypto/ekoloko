"use strict";
// JS stub of SmartFoxClient to bridge to ExtensionBypass on the server
// Provides addEventListener/removeEventListener/sendXtMessage with onExtensionResponse

const { EventEmitter } = require('events');
const path = require('path');
const ExtensionBypass = require(path.resolve(__dirname, '../../extension_bypass.js'));

const COMMANDS = require('../consts/COMMANDS');
const ROOM = require('../consts/ROOM');
const NPC = require('../consts/NPC');
const ITEM = require('../consts/ITEM');
const LIFELEVELROOMDATA = require('../consts/LIFELEVELROOMDATA');
const ZONEEXTENSIONS = require('../consts/ZONEEXTENSIONS');

class SFSClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.XTMSG_TYPE_JSON = 'json';
    this.socket = options.socket || {
      sfsUser: {
        id: options.userId || 1,
        name: options.userName || 'player',
        currentRoom: { id: options.roomId || 101 },
        _vars: {},
        getVariable(k) { return this._vars[k]; },
        setVariable(k, v) { this._vars[k] = v; },
        getVariables() { return { ...this._vars }; },
      },
    };

    // Build protocol mapping to ensure ExtensionBypass uses correct keys
    this.PROTOCOL = {
      COMMANDS,
      ROOM,
      NPC,
      ITEM,
      LIFELEVELROOMDATA,
      // USERVARIABLES etc. can be added when needed
    };

    // server adapter that loops responses back into our event stream
    this.server = {
      PROTOCOL: this.PROTOCOL,
      sendExtensionResponse: (socket, payload, messageType) => {
        // mirror SmartFox onExtensionResponse shape
        const evt = { params: { dataObj: payload } };
        // Emit asynchronously to mimic network
        process.nextTick(() => this.emit(SFSEvent.onExtensionResponse, evt));
      },
      sendPublicMessage: (socket, message, roomId = socket?.sfsUser?.currentRoom?.id || 0) => {
        const evt = { params: { message, sender: {
          getId: () => socket?.sfsUser?.id || 0,
          getName: () => socket?.sfsUser?.name || 'player',
        } } };
        process.nextTick(() => this.emit(SFSEvent.onPublicMessage, evt));
      },
      // Optional broadcasts can be silently ignored in this client stub
      broadcastUserVariableUpdate: () => {},
      handleJoinRoom: () => {},
    };
  }

  // Compatibility helpers
  addEventListener(eventName, handler) { this.on(eventName, handler); }
  removeEventListener(eventName, handler) { this.off(eventName, handler); }

  // Core: route messages to ExtensionBypass
  sendXtMessage(zoneExtension, command, params = {}, messageType = this.XTMSG_TYPE_JSON) {
    try {
      // Ensure command is included for server-side handlers that rely on it
      const payload = { ...params };
      if (payload[COMMANDS.V_COMMAND] == null && command != null) {
        payload[COMMANDS.V_COMMAND] = command;
      }

      // Call extension bypass directly
      ExtensionBypass.handleExtension(
        this.socket,
        String(zoneExtension),
        payload,
        messageType,
        this.server,
        this.PROTOCOL,
      );
      return true;
    } catch (e) {
      // Emit an error-like response, consistent with Flash patterns when errors occur
      const err = {};
      err[COMMANDS.V_COMMAND] = COMMANDS.S_ROOM_DATA_ERROR;
      err[COMMANDS.V_ERROR] = e.message || String(e);
      const evt = { params: { dataObj: err } };
      process.nextTick(() => this.emit(SFSEvent.onExtensionResponse, evt));
      return false;
    }
  }
}

// Public chat message API (used by AS3 Main.sendSfsChatMSG)
SFSClient.prototype.sendPublicMessage = function(message, roomId) {
  // Loop back into onPublicMessage similarly to SmartFoxClient
  const evt = { params: { message, sender: {
    getId: () => this.socket?.sfsUser?.id || 0,
    getName: () => this.socket?.sfsUser?.name || 'player',
  } } };
  process.nextTick(() => this.emit(SFSEvent.onPublicMessage, evt));
};

const SFSEvent = {
  onExtensionResponse: 'onExtensionResponse',
  onPublicMessage: 'onPublicMessage',
};

// Expose static to mimic SmartFoxClient.XTMSG_TYPE_JSON usage sites
SFSClient.XTMSG_TYPE_JSON = 'json';

module.exports = { SFSClient, SFSEvent, ZONEEXTENSIONS };
