"use strict";
// JS implementation of com.vtweens.shell.LocalCache
// Provides per-session caching compatible with Flash semantics used by WorldRoomData

class LocalCacheInternal {
  constructor() {
    this.sharedObjects = new Map();
    this.VERSION_ID = "version_id";
  }

  getSharedObject(name) {
    if (!this.sharedObjects.has(name)) {
      this.sharedObjects.set(name, { data: {} });
    }
    return this.sharedObjects.get(name);
  }

  getVersion(name) {
    return this.getSharedObject(name).data[this.VERSION_ID];
  }

  setVersion(name, versionStr, appVersionSuffix = "") {
    const composed = `${versionStr}${appVersionSuffix}`;
    const current = this.getVersion(name);
    if (current == null || current !== composed) {
      // reset cache for this name
      this.sharedObjects.set(name, { data: {} });
      this.getSharedObject(name).data[this.VERSION_ID] = composed;
    }
  }

  getData(cacheName, key = 0, subKey = -1) {
    const so = this.getSharedObject(cacheName);
    const id = `${key}_${subKey}`;
    return so.data[id];
  }

  setData(cacheName, value, key = 0, subKey = -1) {
    const so = this.getSharedObject(cacheName);
    const id = `${key}_${subKey}`;
    so.data[id] = value;
  }
}

class LocalCache {
  static getInstance() {
    if (!LocalCache._instance) LocalCache._instance = new LocalCacheInternal();
    return LocalCache._instance;
  }
}

// Static cache names, matching AS values
LocalCache.ITEMS = "0";
LocalCache.ROOMS = "1";
LocalCache.LOGIN_STATIC_DATA = "2";
LocalCache.ANIMAL_STORE = "3";
LocalCache.STORES = "4";
LocalCache.RECYCLE_BIN = "5";
LocalCache.HOUSE = "6";
LocalCache.CARDS = "7";
LocalCache.CREDITS_STORE = "8";
LocalCache.STATIC_DB_DATA = "9";
LocalCache.POTION_STORES = "10";

module.exports = LocalCache;
