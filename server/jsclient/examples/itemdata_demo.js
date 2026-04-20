"use strict";
// Demo: Validate ItemData flow end-to-end for extension #2

const { SFSClient } = require('../sfs/SFSClient');
const MainGetter = require('../util/MainGetter');
const ItemData = require('../dataobjects/item/ItemData');

(async () => {
  const SFS = new SFSClient({ userId: 1, userName: 'demo', roomId: 101 });
  MainGetter.MainCaller = { SFS };

  const itemId = 1; // sample id; GameData will synthesize minimal data if needed
  const item = new ItemData(itemId);

  item.addEventListener(ItemData.DATA_LOADED, () => {
    console.log('[DEMO] Item loaded:', item.getId());
    console.log('  type:', item.getType());
    console.log('  name:', item.getName());
    console.log('  price:', item.getPrice());
    process.exit(0);
  });

  item.on('error', (e) => {
    console.error('[DEMO] Error:', e.message);
    process.exit(1);
  });
})();
