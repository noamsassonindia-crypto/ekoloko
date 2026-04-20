"use strict";
// Demo: Validate RoomData flow end-to-end

const { SFSClient, ZONEEXTENSIONS } = require('../sfs/SFSClient');
const MainGetter = require('../util/MainGetter');
const WorldRoomData = require('../dataobjects/room/WorldRoomData');

(async () => {
  // Initialize SFS stub and MainCaller
  const SFS = new SFSClient({ userId: 1, userName: 'demo', roomId: 101 });
  const Main = { SFS };
  MainGetter.MainCaller = Main;

  const roomId = 101;
  const wrd = new WorldRoomData(roomId);

  wrd.addEventListener(WorldRoomData.DATA_LOADED, () => {
    console.log('[DEMO] Room data loaded for', wrd.getId());
    console.log('  swf:', wrd.swfName);
    console.log('  sound:', wrd.bgSound);
    console.log('  zone:', wrd.zoneID);
    console.log('  portals:', JSON.stringify(wrd.portalsData));
    process.exit(0);
  });

  wrd.on('error', (e) => {
    console.error('[DEMO] Error:', e.message);
    process.exit(1);
  });
})();
