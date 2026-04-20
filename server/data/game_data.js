// data/game_data.js
// Simple in-memory game data provider to satisfy client flows with real structures
// Generates deterministic item and potion data and manages per-user state via socket.sfsUser.playerData

const ITEM = {
  ID: "0",
  NAME: "1",
  TYPE: "2",
  LEVEL: "3",
  LEADERSHIP: "4",
  GENDER: "5",
  ORDINAL: "6",
  COUNT: "7",
  INVENTORY_TYPE: "8",
  PRICE: "9",
  SELL_PRICE: "10",
  TRADEBLE: "11",
  PREMIUM: "12",
  VALID_FOR_DAYS: "13",
  PIONEER_POINTS: "14",
  SENIORITY: "15",
  RECYCLED_CREATION_PRICE: "16",
  RECYCLED_ITEMS: "17",
  STORE_AVAILABLE: "18",
};

const STORE = {
  ID: "0",
  ITEMS: "1",
};

const POTIONSTORE = {
  ID: "0",
  POTIONS: "1",
  STORE_ZONES: "2",
};

// Deterministic pseudo-random generator based on storeId
function seededRand(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateItemObject(id, type, ordinal, inventoryType) {
  const basePrice = 50 + (id % 20) * 5;
  return {
    [ITEM.ID]: id,
    [ITEM.NAME]: `Item_${id}`,
    [ITEM.TYPE]: type,
    [ITEM.LEVEL]: 1 + (id % 10),
    [ITEM.LEADERSHIP]: 0,
    [ITEM.GENDER]: 2, // 0=male,1=female,2=unisex (assumption)
    [ITEM.ORDINAL]: ordinal,
    [ITEM.COUNT]: 1,
    [ITEM.INVENTORY_TYPE]: inventoryType, // 0=clothes,1=accessory
    [ITEM.PRICE]: basePrice,
    [ITEM.SELL_PRICE]: Math.floor(basePrice / 2),
    [ITEM.TRADEBLE]: 1,
    [ITEM.PREMIUM]: 0,
    [ITEM.VALID_FOR_DAYS]: 0,
    [ITEM.PIONEER_POINTS]: 0,
    [ITEM.SENIORITY]: 0,
    [ITEM.RECYCLED_CREATION_PRICE]: 0,
    [ITEM.RECYCLED_ITEMS]: "[]",
    [ITEM.STORE_AVAILABLE]: 1,
  };
}

function generateStore(storeId, count = 12) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const baseId = storeId * 1000 + i + 1;
    const type = (i % 2) + 1; // arbitrary type bucket
    const ordinal = i + 1;
    const invType = i % 2; // 0 clothes, 1 accessory
    items.push(generateItemObject(baseId, type, ordinal, invType));
  }
  return { [STORE.ID]: storeId, [STORE.ITEMS]: items };
}

function generatePotionStore(storeId, count = 6) {
  const potions = [];
  for (let i = 0; i < count; i++) {
    const potionId = 100 + (storeId * 10 + i + 1);
    potions.push(potionId);
  }
  return { [POTIONSTORE.ID]: storeId, [POTIONSTORE.POTIONS]: potions };
}

class GameData {
  static getPlayerData(socket) {
    const user = socket?.sfsUser;
    if (!user) return null;
    user.playerData = user.playerData || { gold: 500, level: 1, storage: {}, inventory: {} };
    return user.playerData;
  }

  static getStore(storeId) {
    return generateStore(Number(storeId || 1));
  }

  static getPotionStore(storeId) {
    return generatePotionStore(Number(storeId || 1));
  }

  static getAnimalFood(foodId) {
    // Build V_ANIMAL_FOOD object: { ANIMALFOOD.ID: id, ANIMALFOOD.PRICE: price }
    const idn = Number(foodId) || 0;
    const price = 10 + (idn % 5) * 5; // deterministic, stable price
    return { "0": idn, "1": price };
  }

  // Generate a deterministic set of animal store items for a given store
  static getAnimalStoreItems(storeId) {
    const sid = Number(storeId) || 0;
    const items = [];
    // Create a small catalog of animal-related items with stable ordinals/prices
    for (let i = 0; i < 12; i++) {
      // Use a high base to avoid clashing with clothing/generic items
      const id = sid * 2000 + 500 + i;
      const type = 100 + (i % 3); // arbitrary animal category bucket
      const ordinal = i + 1;
      const invType = 1; // treat as accessory by default
      items.push(generateItemObject(id, type, ordinal, invType));
    }
    return items;
  }

  // Generate a deterministic list of animal food offers for a given store
  static getAnimalFoodItems(storeId) {
    const sid = Number(storeId) || 0;
    const foods = [];
    for (let i = 0; i < 5; i++) {
      const foodId = sid * 10 + i + 1;
      foods.push(this.getAnimalFood(foodId));
    }
    return foods;
  }

  static getItem(id) {
    // Synthesize item data; default to accessory
    return generateItemObject(Number(id), 1, (Number(id) % 50) + 1, Number(id) % 2);
  }

  static canAfford(socket, amount) {
    const pd = this.getPlayerData(socket);
    return (pd?.gold || 0) >= (amount || 0);
  }

  static addGold(socket, amount) {
    const pd = this.getPlayerData(socket);
    if (!pd) return 0;
    pd.gold = Math.max(0, (pd.gold || 0) + (amount || 0));
    return pd.gold;
  }

  static spendGold(socket, amount) {
    const pd = this.getPlayerData(socket);
    if (!pd) return false;
    if ((pd.gold || 0) < (amount || 0)) return false;
    pd.gold -= amount;
    return true;
  }

  static giveItem(socket, itemId, price = 0) {
    const pd = this.getPlayerData(socket);
    if (!pd) return null;
    pd.inventory = pd.inventory || {};
    const key = String(itemId);
    const entry = pd.inventory[key] || { id: itemId, qty: 0, price: price || 0 };
    entry.qty += 1;
    pd.inventory[key] = entry;
    return entry;
  }

  static removeItem(socket, itemId) {
    const pd = this.getPlayerData(socket);
    if (!pd) return false;
    const key = String(itemId);
    const entry = pd.inventory?.[key];
    if (!entry || entry.qty <= 0) return false;
    entry.qty -= 1;
    if (entry.qty === 0) delete pd.inventory[key];
    return true;
  }
}

module.exports = GameData;
