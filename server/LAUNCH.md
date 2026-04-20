# Ekoloko Revived — הוראות הפעלה

## הפעלה בלחיצה אחת

כפל-קליק על **`start.bat`**. זה פותח חלון terminal עם השרת, מחכה שהוא יעלה,
ואז מפעיל את Flash Projector על `http://localhost:8766/shell.swf`.

## איפה Flash Projector?

השרת מחפש אותו בשני מקומות:
1. `best\flashplayer_32_sa.exe` (אם שמת אחד כאן)
2. `..\עבודות\ekoloko-authentic\bin\flashplayer_debug.exe` (קיים, גרסת debug)

אם אין אצלך — הורד מ-[archive.org/details/flashplayer_32_sa](https://archive.org/details/flashplayer_32_sa)
ושמור ב-`best\flashplayer_32_sa.exe`.

## פורטים

- **HTTP 8766** — מגיש SWFs, XMLs, ועונה ל-`.action` endpoints
- **SFS TCP 9339** — שרת SmartFoxServer 1.6.6 (המשחק עצמו)

Flash Projector הוא Flash Player אמיתי — פותח TCP נייטיבי ישירות ל-9339. אין
צורך ב-WebSocket proxy.

## ארכיטקטורה

```
                                   ┌─────────────┐
                                   │  shell.swf  │
                                   │   (Flash)   │
                                   └──┬──────┬───┘
                         HTTP 8766 │      │ TCP 9339
                                   ▼      ▼
                        ┌─────────────────────────┐
                        │       s.js (Node)       │
                        ├─────────────────────────┤
                        │ • static files          │
                        │ • .action stubs         │
                        │ • Wayback cleanup       │
                        │ • SFS Pro 1.6.6 emu     │
                        │ • 80+ extensions        │
                        └─────────────────────────┘
```

## מה במשחק

- **51 חדרים** נטענים כברירת מחדל (מ-DB אם יש Postgres)
- **80+ SFS extensions** מוכנים ב-[extension_bypass.js](extension_bypass.js)
- **נכסים**: 584MB, 6,000+ SWFs, NPCs, פריטים, מיני-משחקים
- **ללא DB**: השרת ממשיך לעבוד עם פונקציונליות בסיסית

## Debug

- לוגים חיים ב-terminal של השרת (צבעוניים, עם זמנים)
- כל בקשת HTTP נרשמת
- SFS messages נרשמים כש-`LOG_EXTENSION_DATA=true` (ברירת מחדל)

## אם משהו לא עובד

1. **Projector נפתח אבל נתקע**: בדוק ב-terminal של השרת מה הבקשה האחרונה. 404
   יראה לך איזה נתיב חסר.
2. **"Cannot connect"**: ודא ש-`netstat -ano | findstr ":8766"` מראה LISTEN.
3. **Projector חוסם localhost**: לחיצה ימנית בתוך Projector → Settings → Privacy → Allow.

## רכיבים עיקריים

- [s.js](s.js) — SFS + HTTP server (~9,700 שורות)
- [extension_bypass.js](extension_bypass.js) — 80+ extension handlers (~4,900 שורות)
- [jsclient/consts/](jsclient/consts/) — קבועי ActionScript מפוענחים
- [data/game_data.js](data/game_data.js) — game data
- [start.bat](start.bat) — Launcher אחד לכל
- [run-ekoloko.bat](run-ekoloko.bat) — רק מפעיל Projector (מניח שהשרת רץ)
