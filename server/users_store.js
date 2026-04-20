// JSON-file user store. Drop-in fallback for the PostgreSQL accounts/players
// schema when no database is configured. Reads/writes one file per process.
//
// Storage shape:
//   { nextId: <int>, users: { <username>: <userRow> } }
// Each <userRow> has the same fields the s.js authenticateUser() returns, so
// the rest of the SFS pipeline can consume it unchanged.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORE_PATH = path.join(__dirname, "users.json");

function defaultRow(username, password, overrides = {}) {
  return {
    username,
    password, // plain (used to compute MD5(randomKey + password) on login)
    email: "",
    is_activated: true,
    is_banned: false,
    account_id: 0,
    player_id: 0,
    level: 1,
    gold: 100,
    activity_points: 0,
    leadership_points: 0,
    skintone: 1,
    eyes: 1,
    mouth: 1,
    hair: 1,
    makeup: 0,
    gender: 1,
    is_mod: false,
    mod: false,
    equiped: '{"19":0,"20":0,"21":0,"22":0}',
    inventory: "{}",
    recycle_inventory: "{}",
    online: false,
    ranger_level: 0,
    seniority_level: 1,
    advisor_level: 0,
    is_premium: false,
    premium_days_left: 0,
    animal_level: 0,
    has_house: false,
    house_locked: false,
    tutorial_step: 0,
    card_albums: "{}",
    card_inventory: "{}",
    potions: "{}",
    animals_adopted: "{}",
    gardener_level: 0,
    gardener_points: 0,
    credits_store_credits: 0,
    last_login: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

class UsersStore {
  constructor(filePath = STORE_PATH) {
    this.filePath = filePath;
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.data = {
        nextId: parsed.nextId || 1,
        users: parsed.users || {},
      };
    } catch (_) {
      this.data = { nextId: 1, users: {} };
      this._save();
    }
  }

  _save() {
    const tmp = this.filePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  findByUsername(username) {
    if (!username) return null;
    return this.data.users[username.toLowerCase()] || null;
  }

  // Insert a new user. Throws if username already exists.
  create(username, password, overrides = {}) {
    const key = String(username || "").toLowerCase();
    if (!key) throw new Error("username required");
    if (this.data.users[key]) throw new Error("username taken");
    const id = this.data.nextId++;
    const row = defaultRow(key, String(password || ""), {
      account_id: id,
      player_id: id,
      ...overrides,
    });
    this.data.users[key] = row;
    this._save();
    return row;
  }

  update(username, patch) {
    const key = String(username || "").toLowerCase();
    const row = this.data.users[key];
    if (!row) return null;
    Object.assign(row, patch);
    this._save();
    return row;
  }

  // Verify the SmartFox client's MD5(randomKey + password). Returns true if
  // the stored plain password produces the same hash.
  verify(row, clientHashedPassword, randomKey) {
    if (!row || !row.password) return false;
    const expected = crypto
      .createHash("md5")
      .update(randomKey + row.password)
      .digest("hex");
    return clientHashedPassword === expected;
  }

  list() {
    return Object.values(this.data.users);
  }
}

module.exports = { UsersStore, defaultRow };
