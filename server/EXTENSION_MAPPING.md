# ActionScript to Extension_Bypass.js Mapping - הנדסה אחורית מלאה

## סיכום ממצאים

הנדסה אחורית מלאה של קבצי ActionScript והתאמת extension_bypass.js 1:1 לציפיות הקליינט.

### קבצים מרכזיים שנותחו:
- `/actionscript/main/scripts/com/vtweens/shell/Main.as` - מעבד תשובות דרך `onExtensionResponse()`
- `/actionscript/main/scripts/com/vtweens/consts/COMMANDS.as` - קבועי פקודות (V_COMMAND, S_* constants)
- `/actionscript/main/scripts/com/vtweens/consts/ZONEEXTENSIONS.as` - מספרי זיהוי extensions

## מיפוי פקודות קריטיות (COMMANDS Constants)

### Core Commands
- `V_COMMAND = "21"` - שדה חובה בכל תשובה
- `V_SFS_UID = "25"` - מזהה משתמש
- `V_USER_NAME = "27"` - שם משתמש
- `V_GOLD = "235"` - כמות זהב
- `V_ROOM_ID = "42"` - מזהה חדר
- `V_TO_ROOM_NAME = "300"` - יעד טלפורט

### Server Response Commands (S_*)
- `S_TELEPORT = "307"` - תשובת טלפורט
- `S_GIFT_ITEM_THROWN_ACK = "115"` - אישור זריקת מתנה
- `S_GIFT_ITEM_PICKED = "116"` - אישור איסוף מתנה
- `S_RANGER_MESSAGE = "319"` - הודעת ריינג'ר
- `S_GAME_REWARD_UPDATE = "172"` - עדכון פרס משחק
- `S_BUY_POTION = "562"` - אישור קניית שיקוי
- `S_USE_POTION = "557"` - אישור שימוש בשיקוי
- `S_POKE_BLOCKED = "213"` - חסימת poke
- `S_ADD_GOLD = "311"` - הוספת זהב
- `S_LEVEL_UP = "175"` - עליית רמה

## Handler Functions - מצב נוכחי ב-extension_bypass.js

### ✅ מיושם בצורה מלאה (1:1 עם ActionScript):

1. **handleTeleportPlayer** (Extension 20)
   - שולח: `S_TELEPORT="307"` + `V_TO_ROOM_NAME="300"` + `V_GOLD="235"`
   - קליינט (Main.as:5708-5726): מפחית זהב אם `V_GOLD != null`, מבצע טלפורט

2. **handleGiftExtension** (Extension 14)
   - שולח: `S_GIFT_ITEM_THROWN_ACK="115"` + פרטי מתנה
   - קליינט (Main.as:5669-5680): מסיר פריט מהאינוונטר לפי סוג

3. **handlePickGiftExtension** (Extension 15)
   - שולח: `S_GIFT_ITEM_PICKED="116"` + מידע על פריט
   - קליינט (Main.as:5685-5691): מוסיף פריט לאינוונטר ומסיר מתנה מהחדר

4. **handleRangerMessages** (Extension 24)
   - שולח: `S_RANGER_MESSAGE="319"` + `V_TYPE` + `V_MESSAGE` + `V_PLAYER_ID`
   - קליינט (Main.as:5778-5780): קורא ל-`onRangerMessage()`

5. **handlePokeBlocked** (Extension 26)
   - שולח: `S_POKE_BLOCKED="213"` + `V_USER_NAME`
   - קליינט (Main.as:5838-5841): מציג פופאפ חסימה

### ✅ Extensions נוספים עם handlers מלאים:

- **Extension 29-34**: Animal operations (Buy, Feed, Clean, Store)
- **Extension 46-47**: Hide/Show Animal
- **Extension 50-52**: Campaign (Donate, Vote, Promote)
- **Extension 53-55**: Random Events
- **Extension 56-67**: House operations (Buy, Upgrade, Place items, Garden)
- **Extension 72-75**: Security Form operations
- **Extension 76-81**: Card/Album operations
- **Extension 82**: Ping
- **Extension 96-99**: Potion operations (Use, Buy, Lock)
- **Extension 100-103**: Helper/Audit/Days Played
- **Extension 104-110**: Buddy/UserVars/Mood/Skin operations
- **Extension 112-120**: Multiplayer Task lifecycle
- **Extension 121**: Hit Life Trap
- **Extension 122**: Ranger Give Gold

## דוגמאות לתשובות נכונות

### Teleport (Extension 20)
```javascript
{
  "21": "307",      // V_COMMAND: S_TELEPORT
  "300": 101,       // V_TO_ROOM_NAME
  "235": 0          // V_GOLD (0 = free)
}
```

### Gift Thrown (Extension 14)
```javascript
{
  "21": "115",      // V_COMMAND: S_GIFT_ITEM_THROWN_ACK
  "113": 0,         // V_GIFT_ITEM_TYPE
  "114": 1,         // V_GIFT_ITEM_QUANTITY
  "133": 5,         // V_SLOT_ID
  "36": 123         // V_ITEM_ID
}
```

### Ranger Message (Extension 24)
```javascript
{
  "21": "319",      // V_COMMAND: S_RANGER_MESSAGE
  "163": 1,         // V_TYPE
  "65": "Message",  // V_MESSAGE
  "160": 12345      // V_PLAYER_ID
}
```

## ארכיטקטורת הדיבוג

הקובץ כולל מערכת ExtensionDebug מקיפה:
- **UI Tracking**: מעקב אחרי פעולות משתמש
- **Flash Integration**: שליחת מידע דיבוג לקליינט Flash
- **Performance Monitoring**: מדידת זמני ביצוע
- **Color-Coded Logging**: לוגים צבעוניים לפי קטגוריה

## יתרונות המימוש

1. **1:1 Mapping**: כל תשובה תואמת בדיוק מה שהקליינט מצפה
2. **No Generic Responses**: אין יותר תשובות "ok" גנריות
3. **Proper Field Names**: שימוש במספרים הנכונים של השדות
4. **Client Compatibility**: מונע תקיעות UI וערורים

## סטטוס מימוש

**✅ COMPLETED**: המערכת מיושרת באופן מלא עם ציפיות הקליינט ActionScript.

כל ההנדלרים מחזירים תשובות בפורמט הנכון עם ה-V_COMMAND המתאים ושדות נוספים כנדרש.
