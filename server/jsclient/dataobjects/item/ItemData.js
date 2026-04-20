"use strict";
// JS port of com.vtweens.dataobjects.item.ItemData
// Mirrors AS3 API: constructor(id:int, type:int=-1, ordinal:int=-1, inventoryType:int=-1, txId:*=null, initialObj:*=null)

const { EventEmitter } = require('events');
const COMMANDS = require('../../consts/COMMANDS');
const ITEM = require('../../consts/ITEM');
const ZONEEXTENSIONS = require('../../consts/ZONEEXTENSIONS');
const LocalCache = require('../../shell/LocalCache');
const MainGetter = require('../../util/MainGetter');
const { SFSEvent } = require('../../sfs/SFSClient');

class ItemData extends EventEmitter {
  static DATA_LOADED = 'data_loaded';

  constructor(id, type = -1, ordinal = -1, inventoryType = -1, txId = null, initialObj = null) {
    super();
    this.object = null;
    this.id = id;
    this.type = type;
    this.ordinal = ordinal;
    this.inventoryType = inventoryType;
    this._txId = txId;
    this.textData = null;
    this.loaded = false;

    if (initialObj == null) {
      this.loadData();
    } else {
      this.setTextData(this._deriveTextDataFrom(initialObj));
      this.updateItemData(initialObj);
    }
  }

  addEventListener(eventName, handler) {
    this.on(eventName, handler);
    if (eventName === ItemData.DATA_LOADED && this.isLoaded()) {
      process.nextTick(() => this.emit(ItemData.DATA_LOADED));
    }
  }

  // Internal: basic text data derivation to mimic TextResourceManager.getItemData
  _deriveTextDataFrom(obj) {
    if (!obj) return null;
    const name = obj[ITEM.NAME] || `Item_${this.id}`;
    return { [ITEM.NAME]: name, 2: '' };
  }

  loadData() {
    const lc = LocalCache.getInstance();
    const cached = lc.getData(LocalCache.ITEMS, this.id);
    // derive minimal text data (no TextResourceManager port here)
    this.setTextData(this._deriveTextDataFrom(cached));

    if (!cached) {
      if (!this.txId) {
        const sfs = MainGetter.MainCaller?.SFS;
        if (!sfs) {
          // no SFS available; mark as loaded with no data
          this.loaded = true;
          this.emit(ItemData.DATA_LOADED);
          return;
        }
        sfs.addEventListener(SFSEvent.onExtensionResponse, this.onExtensionResponse);
        const payload = {};
        payload[ITEM.ID] = this.id; // AS3 sends ITEM.ID in payload
        // Command is the extension ID "2" in AS3 impl
        sfs.sendXtMessage(ZONEEXTENSIONS.ItemData, ZONEEXTENSIONS.ItemData, payload, sfs.XTMSG_TYPE_JSON);
      }
    } else {
      this.updateItemData(cached);
    }
  }

  updateItemData(dataObj) {
    const lc = LocalCache.getInstance();
    lc.setData(LocalCache.ITEMS, dataObj, this.id);
    this.object = dataObj;
    this.type = dataObj[ITEM.TYPE];
    this.ordinal = dataObj[ITEM.ORDINAL];
    this.inventoryType = dataObj[ITEM.INVENTORY_TYPE];
    const sfs = MainGetter.MainCaller?.SFS;
    sfs?.removeEventListener(SFSEvent.onExtensionResponse, this.onExtensionResponse);
    this.loaded = true;
    // Ensure textData exists
    if (!this.textData) this.setTextData(this._deriveTextDataFrom(dataObj));
    this.emit(ItemData.DATA_LOADED);
  }

  setTextData(obj) {
    this.textData = obj;
  }

  setData(obj) {
    this.object = obj;
  }

  onExtensionResponse = (evt) => {
    try {
      const obj = evt?.params?.dataObj || {};
      if (obj[ITEM.ID] === this.id) {
        const cmd = obj[COMMANDS.V_COMMAND];
        if (cmd === COMMANDS.S_ITEM_DATA) {
          this.updateItemData(obj[COMMANDS.V_ITEM]);
        } else if (cmd === COMMANDS.S_ITEM_DATA_ERROR) {
          const sfs = MainGetter.MainCaller?.SFS;
          sfs?.removeEventListener(SFSEvent.onExtensionResponse, this.onExtensionResponse);
        }
      }
    } catch (e) {
      // swallow
    }
  }

  // API getters matching AS
  isLoaded() { return !!this.loaded; }
  getId() { return this.id; }
  getOrdinal() { return this.ordinal; }
  getInventoryType() { return this.inventoryType; }
  getName() { return this.textData ? (this.textData[ITEM.NAME] || '-----') : '-----'; }
  getDescription() { return this.textData ? (this.textData[2] || '') : ''; }
  getType() { return this.type; }
  getStoreAvailable() { return this.object?.[ITEM.STORE_AVAILABLE]; }
  getLeadershipLimit() { return this.object?.[ITEM.LEADERSHIP]; }
  getPioneerPointsLimit() { return this.object?.[ITEM.PIONEER_POINTS] ? Number(this.object[ITEM.PIONEER_POINTS]) : 0; }
  getSeniorityLimit() { return this.object?.[ITEM.SENIORITY] ? Number(this.object[ITEM.SENIORITY]) : 0; }
  getValidForDays() { return this.object?.[ITEM.VALID_FOR_DAYS]; }
  getLevelLimit() { return this.object?.[ITEM.LEVEL]; }
  getGenderLimit() { return this.object?.[ITEM.GENDER]; }
  isTradeble() { return (this.object?.[ITEM.TRADEBLE] || 0) > 0; }
  isSellable() { return (this.object?.[ITEM.TRADEBLE] ?? 0) > -1; }
  isPremium() { return !!(this.object && this.object[ITEM.PREMIUM]); }
  getPrice() { return this.object?.[ITEM.PRICE]; }
  getSellPrice() { return Number(this.object?.[ITEM.SELL_PRICE]); }

  get txId() { return this._txId; }
}

module.exports = ItemData;
