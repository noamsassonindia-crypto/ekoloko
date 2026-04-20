"use strict";
// JS port of com.vtweens.dataobjects.room.WorldRoomData
// Replicates network flow and data structure for RoomData (extension #1) with Flash-compatible semantics

const { EventEmitter } = require('events');
const COMMANDS = require('../../consts/COMMANDS');
const ROOM = require('../../consts/ROOM');
const NPC = require('../../consts/NPC');
const ITEM = require('../../consts/ITEM');
const LIFELEVELROOMDATA = require('../../consts/LIFELEVELROOMDATA');
const ZONEEXTENSIONS = require('../../consts/ZONEEXTENSIONS');
const LocalCache = require('../../shell/LocalCache');
const MainGetter = require('../../util/MainGetter');
const { SFSEvent } = require('../../sfs/SFSClient');

class WorldRoomData extends EventEmitter {
  static DATA_LOADED = 'data_loaded';

  constructor(roomId, initialData = null) {
    super();
    this.serverPortalData = null;
    this.swfNameStr = null;
    this.sound = null;
    this.zoneId = 0;
    this.id = -1;
    this.npcs = [];
    this.npcsData = [];
    this.levelLimit = 0;
    this.seniorityLimit = 0;
    this.leadershipLimit = 0;
    this.mustEquipLimit = false;
    this.premium = false;
    this.lifeLevel = null;
    this.itemLimit = null;
    this.pioneerPointsLimit = 0;

    this.id = roomId;
    if (initialData != null) {
      this.upadateRoomData(initialData);
    } else {
      this.loadData(roomId);
    }
  }

  // Event registration with immediate fire if already loaded (to match AS override behavior)
  addEventListener(eventName, handler) {
    this.on(eventName, handler);
    if (eventName === WorldRoomData.DATA_LOADED && this.isLoaded()) {
      // fire asynchronously like Flash's dispatchEvent
      process.nextTick(() => this.emit(WorldRoomData.DATA_LOADED));
    }
  }

  // Getters matching AS API
  get portalsData() { return this.serverPortalData; }
  get swfName() { return this.swfNameStr; }
  get bgSound() { return this.sound; }
  get zoneID() { return this.zoneId; }
  get isPremium() { return !!this.premium; }
  getId() { return this.id; }
  getNPCs() { return this.npcs; }
  isLoaded() { return this.swfNameStr != null; }
  deactivate() {}

  // Optional: produce a room limit string; minimal implementation without TextResourceManager
  get roomLimitString() {
    const lines = [];
    if (this.levelLimit > 1) lines.push(`Requires level ${this.levelLimit}`);
    if (this.seniorityLimit > 1) lines.push(`Requires seniority ${this.seniorityLimit}`);
    if (this.leadershipLimit > 0) lines.push(`Requires leadership ${this.leadershipLimit}`);
    if (this.pioneerPointsLimit > 0) lines.push(`Requires pioneer points ${this.pioneerPointsLimit}`);
    if (this.itemLimit != null && this.mustEquipLimit) lines.push(`Must wear item ${this.itemLimit?.id ?? this.itemLimit}`);
    if (this.itemLimit != null && !this.mustEquipLimit) lines.push(`Must own item ${this.itemLimit?.id ?? this.itemLimit}`);
    return lines.join('\n');
  }

  // Internal: initiate fetch (or load from cache)
  loadData(roomId) {
    const cached = LocalCache.getInstance().getData(LocalCache.ROOMS, roomId);
    if (!cached) {
      const sfs = MainGetter.MainCaller?.SFS;
      if (!sfs) throw new Error('SFS not initialized in MainGetter.MainCaller');
      sfs.addEventListener(SFSEvent.onExtensionResponse, this.onExtensionResponse);
      const params = {};
      params[COMMANDS.V_ROOM_ID] = roomId;
      sfs.sendXtMessage(ZONEEXTENSIONS.RoomData, COMMANDS.C_GET_ROOM, params, sfs.XTMSG_TYPE_JSON);
    } else {
      this.upadateRoomData(cached);
    }
  }

  // Update object from server payload
  upadateRoomData(payload) {
    this.setNPCs(payload[COMMANDS.V_ROOM_NPCS] || []);
    const rd = payload[COMMANDS.V_ROOM_DATA] || {};
    this.serverPortalData = rd[ROOM.PORTALS] || [];
    this.swfNameStr = rd[ROOM.SWF] ?? null;
    this.sound = rd[ROOM.SOUND] ?? null;
    this.zoneId = rd[ROOM.ZONE_ID] ?? 0;
    this.levelLimit = rd[ROOM.LEVEL] ?? 0;
    this.seniorityLimit = rd[ROOM.SENIORITY] ?? 0;
    this.leadershipLimit = rd[ROOM.LEADERSHIP] ?? 0;
    this.pioneerPointsLimit = rd[ROOM.PIONEER_POINTS] ?? 0;
    this.mustEquipLimit = !!rd[ROOM.MUST_EQUIP];
    this.premium = !!rd[ROOM.PREMIUM];
    this.lifeLevel = rd[ROOM.LIFE_LEVEL_TYPE] ?? null;
    const itemObj = rd[ROOM.ITEM] ?? null;
    this.itemLimit = itemObj ? { id: itemObj[ITEM.ID] } : null;

    // Notify listeners
    this.emit(WorldRoomData.DATA_LOADED);
  }

  setNPCs(arr) {
    this.npcsData = Array.isArray(arr) ? arr : [];
    // Keep raw data as-is to maintain 1:1 compatibility
    this.npcs = this.npcsData.map(n => ({
      id: n[NPC.ID],
      url: n[NPC.URL],
      px: n[NPC.PX],
      py: n[NPC.PY],
    }));
  }

  // Bound handler to preserve "this"
  onExtensionResponse = (evt) => {
    try {
      const obj = evt?.params?.dataObj || {};
      if (obj[COMMANDS.V_ROOM_ID] === this.id) {
        const cmd = obj[COMMANDS.V_COMMAND];
        if (cmd === COMMANDS.S_ROOM_DATA) {
          const lc = LocalCache.getInstance();
          lc.setData(LocalCache.ROOMS, obj, this.id);
          this.upadateRoomData(obj);
          // Detach after handling matching response
          const sfs = MainGetter.MainCaller?.SFS;
          sfs?.removeEventListener(SFSEvent.onExtensionResponse, this.onExtensionResponse);
        } else if (cmd === COMMANDS.S_ROOM_DATA_ERROR) {
          const sfs = MainGetter.MainCaller?.SFS;
          sfs?.removeEventListener(SFSEvent.onExtensionResponse, this.onExtensionResponse);
          // Surface an error for callers
          this.emit('error', new Error(String(obj[COMMANDS.V_ERROR] || 'Room data error')));
        }
      }
    } catch (e) {
      this.emit('error', e);
    }
  }
}

module.exports = WorldRoomData;
