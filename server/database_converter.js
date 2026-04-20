// Database Converter - Converts PostgreSQL data to ActionScript format
// Based on ActionScript constants found in /actionscript/main/scripts/com/vtweens/consts/

const PLAYER_MAPPING = {
  "0": "id",                                    // ID
  "1": "name",                                  // NAME
  "2": "level",                                 // LEVEL
  "3": "level_target",                          // LEVEL_TARGET
  "4": "gold",                                  // GOLD
  "5": "skintone",                              // SKINTONE
  "6": "eyes",                                  // EYES
  "7": "mouth",                                 // MOUTH
  "8": "hair",                                  // HAIR
  "9": "makeup",                                // MAKEUP
  "10": "activity_points",                      // ACTIVITY_POINTS
  "11": "mod",                                  // MOD
  "12": "leader",                               // LEADER
  "13": "gender",                               // GENDER
  "14": "chatstatus",                           // CHATSTATUS
  "15": "equiped",                              // EQUIPED
  "16": "may_change_lead",                      // MAY_CHANGE_LEAD
  "17": "one_on_one_games",                     // ONE_ON_ONE_GAMES
  "18": "online",                               // ONLINE
  "19": "ranger_level",                         // RANGER_LEVEL
  "20": "inventory",                            // INVENTORY
  "21": "recycle_inventory",                    // RECYCLE_INVENTORY
  "22": "last_login",                           // LAST_LOGIN
  "23": "banned_until",                         // BANNED_UNTIL
  "24": "bad_words_count",                      // BAD_WORDS_COUNT
  "25": "no_chat_until",                        // NO_CHAT_UNTIL
  "26": "minutes_played",                       // MINUTES_PLAYED
  "27": "animal_level",                         // ANIMAL_LEVEL
  "28": "ban_type",                             // BAN_TYPE
  "29": "ban_count",                            // BAN_COUNT
  "30": "new_premium",                          // NEW_PREMIUM
  "31": "lost_premium",                         // LOST_PREMIUM
  "32": "pioneer_points",                       // PIONEER_POINTS
  "33": "days_for_next_seniority_level",        // DAYS_FOR_NEXT_SENIORITY_LEVEL
  "34": "seniority_days_played",                // SENIORITY_DAYS_PLAYED
  "35": "seniority_level",                      // SENIORITY_LEVEL
  "36": "facebook",                             // FACEBOOK
  "37": "ranger_applicable",                    // RANGER_APPLICABLE
  "38": "house_locked",                         // HOUSE_LOCKED
  "39": "has_house",                            // HAS_HOUSE
  "40": "days_played",                          // DAYS_PLAYED
  "41": "tutorial_step",                        // TUTORIAL_STEP
  "42": "security_form_completed",              // SECURITY_FORM_COMPLETED
  "43": "card_albums",                          // CARD_ALBUMS
  "44": "card_inventory",                       // CARD_INVENTORY
  "45": "card_packs_waiting",                   // CARD_PACKS_WAITING
  "46": "accesories_storage",                   // ACCESORIES_STORAGE
  "47": "clothes_storage",                      // CLOTHES_STORAGE
  "48": "storage_size",                         // STORAGE_SIZE
  "49": "green_ranger_applicable",              // GREEN_RANGER_APPLICABLE
  "50": "senior_ranger_applicable",             // SENIOR_RANGER_APPLICABLE
  "51": "potions",                              // POTIONS
  "52": "animals_adopted",                      // ANIMALS_ADOPTED
  "53": "helper_flow",                          // HELPER_FLOW
  "54": "tutorial_id",                          // TUTORIAL_ID
  "55": "advisor_level",                        // ADVISOR_LEVEL
  "56": "message_inventory",                    // MESSAGE_INVENTORY
  "57": "mobile_coins",                         // MOBILE_COINS
  "58": "mobile_gems",                          // MOBILE_GEMS
  "59": "ranger_application_date"               // RANGER_APPLICATION_DATE
};

const ITEM_MAPPING = {
  "0": "id",                                    // ID
  "1": "name",                                  // NAME
  "2": "type",                                  // TYPE
  "3": "level",                                 // LEVEL
  "4": "leadership",                            // LEADERSHIP
  "5": "gender",                                // GENDER
  "6": "ordinal",                               // ORDINAL
  "7": "count",                                 // COUNT
  "8": "inventory_type",                        // INVENTORY_TYPE
  "9": "price",                                 // PRICE
  "10": "sell_price",                           // SELL_PRICE
  "11": "tradeble",                             // TRADEBLE
  "12": "premium",                              // PREMIUM
  "13": "valid_for_days",                       // VALID_FOR_DAYS
  "14": "pioneer_points",                       // PIONEER_POINTS
  "15": "seniority",                            // SENIORITY
  "16": "recycled_creation_price",              // RECYCLED_CREATION_PRICE
  "17": "recycled_items",                       // RECYCLED_ITEMS
  "18": "store_available"                       // STORE_AVAILABLE
};

const ROOM_MAPPING = {
  "0": "id",                                    // ID
  "1": "sound",                                 // SOUND
  "2": "swf",                                   // SWF
  "3": "portals",                               // PORTALS
  "4": "max_trash_items",                       // MAX_TRASH_ITEMS
  "5": "zone_id",                               // ZONE_ID
  "6": "level",                                 // LEVEL
  "7": "leadership",                            // LEADERSHIP
  "8": "item",                                  // ITEM
  "9": "must_equip",                            // MUST_EQUIP
  "10": "premium",                              // PREMIUM
  "11": "pioneer_points",                       // PIONEER_POINTS
  "12": "seniority",                            // SENIORITY
  "13": "life_level_type"                       // LIFE_LEVEL_TYPE
};

const ANIMALS_MAPPING = {
  "0": "id",                                    // ID
  "1": "type_level",                            // TYPE_LEVEL
  "2": "max_age",                               // MAX_AGE
  "3": "price",                                 // PRICE
  "4": "quiz_id",                               // QUIZ_ID
  "5": "food_group",                            // FOOD_GROUP
  "6": "clean_price",                           // CLEAN_PRICE
  "7": "item",                                  // ITEM
  "8": "player_level",                          // PLAYER_LEVEL
  "9": "pioneer_points"                         // PIONEER_POINTS
};

const CARD_MAPPING = {
  "0": "id",                                    // ID
  "1": "ordinal",                               // ORDINAL
  "2": "set",                                   // SET
  "3": "album"                                  // ALBUM
};

const QUEST_MAPPING = {
  "0": "id",                                    // ID
  "1": "level",                                 // LEVEL
  "2": "name",                                  // NAME
  "3": "premium",                               // PREMIUM
  "4": "priority",                              // PRIORITY
  "5": "group",                                 // GROUP
  "6": "sub_group"                              // SUB_GROUP
};

const STORE_MAPPING = {
  "0": "id",                                    // ID
  "1": "items"                                  // ITEMS
};

const POTION_MAPPING = {
  "0": "id",                                    // ID
  "1": "price",                                 // PRICE
  "2": "affects_avatar",                        // AFFECTS_AVATAR
  "3": "type",                                  // TYPE
  "4": "allow_non_pioneers",                    // ALLOW_NON_PIONEERS
  "5": "hide_board",                            // HIDE_BOARD
  "6": "hide_hair",                             // HIDE_HAIR
  "7": "hide_hat",                              // HIDE_HAT
  "8": "hide_hover",                            // HIDE_HOVER
  "9": "intro_id",                              // INTRO_ID
  "10": "should_walk"                           // SHOULD_WALK
};

function convertPlayerToActionScript(playerRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(PLAYER_MAPPING)) {
    if (playerRow[dbColumn] !== undefined) {
      result[key] = playerRow[dbColumn];
    }
  }
  return result;
}

function convertItemToActionScript(itemRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(ITEM_MAPPING)) {
    if (itemRow[dbColumn] !== undefined) {
      result[key] = itemRow[dbColumn];
    }
  }
  return result;
}

function convertRoomToActionScript(roomRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(ROOM_MAPPING)) {
    if (roomRow[dbColumn] !== undefined) {
      result[key] = roomRow[dbColumn];
    }
  }
  return result;
}

function convertAnimalToActionScript(animalRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(ANIMALS_MAPPING)) {
    if (animalRow[dbColumn] !== undefined) {
      result[key] = animalRow[dbColumn];
    }
  }
  return result;
}

function convertCardToActionScript(cardRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(CARD_MAPPING)) {
    if (cardRow[dbColumn] !== undefined) {
      result[key] = cardRow[cardColumn];
    }
  }
  return result;
}

function convertQuestToActionScript(questRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(QUEST_MAPPING)) {
    if (questRow[dbColumn] !== undefined) {
      result[key] = questRow[dbColumn];
    }
  }
  return result;
}

function convertStoreToActionScript(storeRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(STORE_MAPPING)) {
    if (storeRow[dbColumn] !== undefined) {
      result[key] = storeRow[dbColumn];
    }
  }
  return result;
}

function convertPotionToActionScript(potionRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(POTION_MAPPING)) {
    if (potionRow[dbColumn] !== undefined) {
      result[key] = potionRow[dbColumn];
    }
  }
  return result;
}

const ACCOUNT_MAPPING = {
  "0": "id",                                    // ID
  "1": "username",                              // USERNAME
  "2": "password",                              // PASSWORD
  "3": "email",                                 // EMAIL
  "4": "first",                                 // FIRST
  "5": "last",                                  // LAST
  "6": "dob",                                   // DOB
  "7": "ispaying",                              // ISPAYING
  "8": "player",                                // PLAYER
  "9": "survey",                                // SURVEY
  "10": "newsletter",                           // NEWSLETTER
  "11": "parent_email",                         // PARENT_EMAIL
  "12": "payer_email",                          // PAYER_EMAIL
  "13": "paying_until",                         // PAYING_UNTIL
  "14": "payer_id",                             // PAYER_ID
  "15": "reg_date",                             // REG_DATE
  "16": "affiliate",                            // AFFILIATE
  "17": "language",                             // LANGUAGE
  "18": "country",                              // COUNTRY
  "19": "first_payment",                        // FIRST_PAYMENT
  "20": "last_payment",                         // LAST_PAYMENT
  "21": "confirmed_email",                      // CONFIRMED_EMAIL
  "22": "is_activated",                         // ACTIVATIVATED (typo in AS)
  "23": "is_pioneer",                           // IS_PIONEER
  "24": "credits",                              // CREDITS
  "25": "ranger_level"                          // RANGER_LEVEL
};

const GAME_MAPPING = {
  "0": "id",                                    // ID
  "1": "name",                                  // NAME
  "2": "url",                                   // URL
  "3": "npc_id",                                // NPC_ID
  "4": "xml",                                   // XML
  "5": "icon_url",                              // ICON_URL
  "6": "type",                                  // TYPE
  "7": "premium",                               // PREMIUM
  "8": "display_order",                         // DISPLAY_ORDER
  "9": "one_on_one_visible"                     // ONE_ON_ONE_VISIBLE
};

const NPC_MAPPING = {
  "0": "id",                                    // ID
  "1": "name",                                  // NAME
  "2": "history",                               // HISTORY
  "3": "blubble",                               // BLUBBLE
  "4": "url",                                   // URL
  "5": "px",                                    // PX
  "6": "py",                                    // PY
  "7": "msgs",                                  // MSGS
  "8": "room_id",                               // ROOM_ID
  "9": "premium_only"                           // PREMIUM_ONLY
};

const HOUSEITEM_MAPPING = {
  "0": "id",                                    // ID
  "1": "type",                                  // TYPE
  "2": "ordinal",                               // ORDINAL
  "3": "color",                                 // COLOR
  "4": "price",                                 // PRICE
  "5": "sell_price",                            // SELL_PRICE
  "6": "premium",                               // PREMIUM
  "7": "valid_for_days",                        // VALID_FOR_DAYS
  "8": "pioneer_points",                        // PIONEER_POINTS
  "9": "seniority",                             // SENIORITY
  "10": "store_available",                      // STORE_AVAILABLE
  "11": "house_types",                          // HOUSE_TYPES
  "12": "electric_units",                       // ELECTRIC_UNITS
  "13": "recycled_items",                       // RECYCLED_ITEMS
  "14": "recycled_creation_price",              // RECYCLED_CREATION_PRICE
  "15": "pattern",                              // PATTERN
  "16": "pattern_opposite",                     // PATTERN_OPPOSITE
  "17": "location",                             // LOCATION
  "18": "age",                                  // AGE
  "19": "event_id"                              // EVENT_ID
};

const HOUSETYPE_MAPPING = {
  "0": "id",                                    // ID
  "1": "seniority",                             // SENIORITY
  "2": "premium",                               // PREMIUM
  "3": "price",                                 // PRICE
  "4": "size_change_price"                      // SIZE_CHANGE_PRICE
};

function convertAccountToActionScript(accountRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(ACCOUNT_MAPPING)) {
    if (accountRow[dbColumn] !== undefined) {
      result[key] = accountRow[dbColumn];
    }
  }
  return result;
}

function convertGameToActionScript(gameRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(GAME_MAPPING)) {
    if (gameRow[dbColumn] !== undefined) {
      result[key] = gameRow[dbColumn];
    }
  }
  return result;
}

function convertNpcToActionScript(npcRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(NPC_MAPPING)) {
    if (npcRow[dbColumn] !== undefined) {
      result[key] = npcRow[dbColumn];
    }
  }
  return result;
}

function convertHouseItemToActionScript(houseItemRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(HOUSEITEM_MAPPING)) {
    if (houseItemRow[dbColumn] !== undefined) {
      result[key] = houseItemRow[dbColumn];
    }
  }
  return result;
}

function convertHouseTypeToActionScript(houseTypeRow) {
  const result = {};
  for (const [key, dbColumn] of Object.entries(HOUSETYPE_MAPPING)) {
    if (houseTypeRow[dbColumn] !== undefined) {
      result[key] = houseTypeRow[dbColumn];
    }
  }
  return result;
}

module.exports = {
  PLAYER_MAPPING,
  ITEM_MAPPING,
  ROOM_MAPPING,
  ANIMALS_MAPPING,
  CARD_MAPPING,
  QUEST_MAPPING,
  STORE_MAPPING,
  POTION_MAPPING,
  ACCOUNT_MAPPING,
  GAME_MAPPING,
  NPC_MAPPING,
  HOUSEITEM_MAPPING,
  HOUSETYPE_MAPPING,
  convertPlayerToActionScript,
  convertItemToActionScript,
  convertRoomToActionScript,
  convertAnimalToActionScript,
  convertCardToActionScript,
  convertQuestToActionScript,
  convertStoreToActionScript,
  convertPotionToActionScript,
  convertAccountToActionScript,
  convertGameToActionScript,
  convertNpcToActionScript,
  convertHouseItemToActionScript,
  convertHouseTypeToActionScript
};
