/**
 * Extension Bypass System for VTweens Game
 * Single, unified router with comprehensive 1:1 minimal handlers
 *
 * Assumptions:
 * - `server` provides `sendExtensionResponse(socket, payload, messageType)`
 *   and possibly helpers like `broadcastUserVariableUpdate` and `handleJoinRoom`.
 * - Protocol constants are available under `server.PROTOCOL.COMMANDS` or `PROTOCOL.COMMANDS`.
 * - All handlers return `true` when they took care of a response.
 */

const USERVARIABLES = require("./jsclient/consts/USERVARIABLES");
const fs = require("fs");
const path = require("path");
// Minimal RESOURCEITEM constants (from AS3) for gift messages
const RESOURCEITEM = {
  ITEM: "0",
  INSTANCE_ID: "1",
  PX: "2",
  PY: "3",
  QUANTITY: "4",
  IS_SERVER_GIFT: "5",
  ITEM_FOR_DAYS: "6",
};

const RESOURCEITEMTYPES = {
  ITEM: "0",
  RECYCLE_ITEM: "1",
};

// ==================== DEBUG UTILITY CLASS ====================
class ExtensionDebug {
  static isEnabled = process.env.EXTENSION_DEBUG === 'true' || true; // Force enabled for now
  static verboseLevel = parseInt(process.env.EXTENSION_DEBUG_LEVEL) || 2; // 0=errors, 1=basic, 2=detailed, 3=verbose
  static timings = new Map();
  static indentLevel = 0;
  
  static colors = {
    RESET: '\x1b[0m',
    BRIGHT: '\x1b[1m',
    DIM: '\x1b[2m',
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    WHITE: '\x1b[37m'
  };

  static timestamp() {
    const iso = new Date().toISOString();
    return iso ? iso.substring(11, 23) : '00:00:00.000'; // HH:MM:SS.sss
  }

  static getIndent() {
    return '  '.repeat(this.indentLevel);
  }

  static format(level, category, message, color = '') {
    const ts = this.timestamp();
    const ind = this.getIndent();
    return `${color}[${ts}] ${ind}[${level.toUpperCase()}] [${category}] ${message}${this.colors.RESET}`;
  }

  // Main logging method
  static log(level, category, message, data = null, color = '') {
    if (!this.isEnabled) return;
    
    const levelNum = { error: 0, warn: 1, info: 2, debug: 3 }[level] || 2;
    if (levelNum > this.verboseLevel) return;

    console.log(this.format(level, category, message, color));
    
    if (data && this.verboseLevel >= 3) {
      try {
        const jsonData = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        console.log(`${this.colors.DIM}${this.getIndent()}  Data: ${jsonData}${this.colors.RESET}`);
      } catch (e) {
        console.log(`${this.colors.DIM}${this.getIndent()}  Data: [Unable to serialize: ${e.message}]${this.colors.RESET}`);
      }
    }
  }

  // UI interaction logging
  static ui(action, details = '', data = null) {
    this.log('info', 'UI', `${action} ${details}`, data, this.colors.CYAN);
  }

  // Extension handler logging
  static ext(extensionName, action, user = '', details = '') {
    const userInfo = user ? `[${user}]` : '';
    this.log('info', 'EXT', `${extensionName} -> ${action} ${userInfo} ${details}`, null, this.colors.MAGENTA);
  }

  // Network/protocol logging
  static net(direction, messageType, payload = null) {
    const arrow = direction === 'in' ? '→' : '←';
    this.log('info', 'NET', `${arrow} ${messageType}`, payload, this.colors.YELLOW);
  }

  // Track errors for performance stats
  static errorCount = 0;
  static recordError() {
    this.errorCount++;
  }

  // Error logging
  static error(category, message, error = null) {
    this.recordError(); // Track error count for performance stats
    this.log('error', category, message, error, this.colors.RED + this.colors.BRIGHT);
    if (error && error.stack) {
      console.log(`${this.colors.RED}${this.getIndent()}  Stack: ${error.stack}${this.colors.RESET}`);
    }
  }

  // Success/completion logging
  static success(category, message, details = null) {
    this.log('info', category, message, details, this.colors.GREEN);
  }

  // Warning logging
  static warn(category, message, details = null) {
    this.log('warn', category, message, details, this.colors.YELLOW);
  }

  // Timing utilities
  static startTimer(key, description = '') {
    this.timings.set(key, { start: Date.now(), description });
    this.log('debug', 'TIMER', `Started: ${key} ${description}`, null, this.colors.BLUE);
  }

  static endTimer(key) {
    const timer = this.timings.get(key);
    if (!timer) {
      this.warn('TIMER', `Timer '${key}' not found`);
      return 0;
    }
    
    const elapsed = Date.now() - timer.start;
    this.timings.delete(key);
    this.log('debug', 'TIMER', `Completed: ${key} ${timer.description} (${elapsed}ms)`, null, this.colors.BLUE);
    return elapsed;
  }

  // Indentation control for nested operations
  static indent() {
    this.indentLevel++;
  }

  static outdent() {
    if (this.indentLevel > 0) this.indentLevel--;
  }

  // Block execution with automatic indentation
  static block(category, title, fn) {
    this.log('debug', category, `▼ ${title}`, null, this.colors.BLUE);
    this.indentLevel++;
    
    try {
      const result = fn();
      this.indentLevel--;
      this.log('debug', category, `▲ ${title} completed`, null, this.colors.BLUE);
      return result;
    } catch (error) {
      this.indentLevel--;
      this.error(category, `▲ ${title} failed`, error);
      throw error;
    }
  }

  // Flash UI debugging - sends debug info to Flash client
  static flashDebug(socket, category, message, data = null) {
    if (!socket || !this.isEnabled) return;
    
    try {
      const debugPayload = {
        debug_category: category,
        debug_message: message,
        debug_timestamp: Date.now(),
        debug_data: data ? JSON.stringify(data) : null,
        debug_level: 'INFO',
        debug_color: this.getCategoryColor(category)
      };
      
      // Send as a special debug extension response
      if (socket.sendExtensionResponse || (socket.server && socket.server.sendExtensionResponse)) {
        const sendFn = socket.sendExtensionResponse || socket.server.sendExtensionResponse;
        sendFn(socket, debugPayload, 'debug');
      }
    } catch (e) {
      this.error('FLASH_DEBUG', 'Failed to send debug info to Flash client', e);
    }
  }

  // Flash error debugging - sends error info to Flash client with red styling
  static flashError(socket, category, message, error = null) {
    if (!socket || !this.isEnabled) return;
    
    try {
      const errorPayload = {
        debug_category: category,
        debug_message: message,
        debug_timestamp: Date.now(),
        debug_data: error ? JSON.stringify({ error: error.message, stack: error.stack }) : null,
        debug_level: 'ERROR',
        debug_color: 0xFF0000
      };
      
      if (socket.sendExtensionResponse || (socket.server && socket.server.sendExtensionResponse)) {
        const sendFn = socket.sendExtensionResponse || socket.server.sendExtensionResponse;
        sendFn(socket, errorPayload, 'debug');
      }
    } catch (e) {
      this.error('FLASH_DEBUG', 'Failed to send error info to Flash client', e);
    }
  }

  // Flash success debugging - sends success info to Flash client with green styling
  static flashSuccess(socket, category, message, data = null) {
    if (!socket || !this.isEnabled) return;
    
    try {
      const successPayload = {
        debug_category: category,
        debug_message: message,
        debug_timestamp: Date.now(),
        debug_data: data ? JSON.stringify(data) : null,
        debug_level: 'SUCCESS',
        debug_color: 0x00FF00
      };
      
      if (socket.sendExtensionResponse || (socket.server && socket.server.sendExtensionResponse)) {
        const sendFn = socket.sendExtensionResponse || socket.server.sendExtensionResponse;
        sendFn(socket, successPayload, 'debug');
      }
    } catch (e) {
      this.error('FLASH_DEBUG', 'Failed to send success info to Flash client', e);
    }
  }

  // Get color for category (for Flash display)
  static getCategoryColor(category) {
    const colors = {
      'UI': 0x00CCFF,      // Light blue for UI interactions
      'EXT': 0xFF00FF,     // Magenta for extensions
      'NET': 0xFFFF00,     // Yellow for network
      'ROOM': 0x00FFCC,    // Cyan for room operations
      'GAME': 0xFF6600,    // Orange for game operations
      'STORE': 0x66FF00,   // Green for store operations
      'USERVARS': 0xCC00FF, // Purple for user variables
      'TIMER': 0x0066FF,   // Blue for timers
      'BYPASS': 0xFFCC00,  // Gold for bypass operations
      'ERROR': 0xFF0000,   // Red for errors
      'SUCCESS': 0x00FF00  // Green for success
    };
    return colors[category] || 0xCCCCCC; // Default gray
  }

  // Send debug overlay to Flash - creates/updates a debug panel
  static flashOverlay(socket, title, items = []) {
    if (!socket || !this.isEnabled) return;
    
    try {
      const overlayPayload = {
        debug_overlay: true,
        debug_title: title,
        debug_items: items,
        debug_timestamp: Date.now()
      };
      
      if (socket.sendExtensionResponse || (socket.server && socket.server.sendExtensionResponse)) {
        const sendFn = socket.sendExtensionResponse || socket.server.sendExtensionResponse;
        sendFn(socket, overlayPayload, 'debug_overlay');
      }
    } catch (e) {
      this.error('FLASH_DEBUG', 'Failed to send overlay info to Flash client', e);
    }
  }

  // Performance monitoring
  static performanceStats = {
    extensionCalls: 0,
    totalProcessingTime: 0,
    averageProcessingTime: 0,
    peakProcessingTime: 0,
    extensionBreakdown: {},
    errorCount: 0,
    startTime: Date.now()
  };

  // Record extension performance
  static recordPerformance(extensionName, processingTime) {
    this.performanceStats.extensionCalls++;
    this.performanceStats.totalProcessingTime += processingTime;
    this.performanceStats.averageProcessingTime = this.performanceStats.totalProcessingTime / this.performanceStats.extensionCalls;
    
    if (processingTime > this.performanceStats.peakProcessingTime) {
      this.performanceStats.peakProcessingTime = processingTime;
    }
    
    if (!this.performanceStats.extensionBreakdown[extensionName]) {
      this.performanceStats.extensionBreakdown[extensionName] = {
        calls: 0,
        totalTime: 0,
        averageTime: 0,
        peakTime: 0
      };
    }
    
    const ext = this.performanceStats.extensionBreakdown[extensionName];
    ext.calls++;
    ext.totalTime += processingTime;
    ext.averageTime = ext.totalTime / ext.calls;
    if (processingTime > ext.peakTime) {
      ext.peakTime = processingTime;
    }
  }

  // Record error
  static recordError() {
    this.performanceStats.errorCount++;
  }

  // Get performance summary
  static getPerformanceSummary() {
    const uptime = Date.now() - this.performanceStats.startTime;
    const top5Extensions = Object.entries(this.performanceStats.extensionBreakdown)
      .sort(([,a], [,b]) => b.calls - a.calls)
      .slice(0, 5)
      .map(([name, stats]) => ({ name, ...stats }));

    return {
      uptime: uptime,
      uptimeFormatted: this.formatDuration(uptime),
      extensionCalls: this.performanceStats.extensionCalls,
      errorCount: this.performanceStats.errorCount,
      errorRate: (this.performanceStats.errorCount / this.performanceStats.extensionCalls * 100).toFixed(2),
      averageProcessingTime: this.performanceStats.averageProcessingTime.toFixed(2),
      peakProcessingTime: this.performanceStats.peakProcessingTime,
      callsPerSecond: (this.performanceStats.extensionCalls / (uptime / 1000)).toFixed(2),
      topExtensions: top5Extensions
    };
  }

  // Format duration in human readable format
  static formatDuration(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Print performance report
  static printPerformanceReport() {
    if (!this.isEnabled) return;
    
    const stats = this.getPerformanceSummary();
    
    this.log('info', 'PERF', '\n' + '='.repeat(80));
    this.log('info', 'PERF', 'EXTENSION BYPASS PERFORMANCE REPORT');
    this.log('info', 'PERF', '='.repeat(80));
    this.log('info', 'PERF', `Uptime: ${stats.uptimeFormatted}`);
    this.log('info', 'PERF', `Extension Calls: ${stats.extensionCalls}`);
    this.log('info', 'PERF', `Calls per Second: ${stats.callsPerSecond}`);
    this.log('info', 'PERF', `Average Processing Time: ${stats.averageProcessingTime}ms`);
    this.log('info', 'PERF', `Peak Processing Time: ${stats.peakProcessingTime}ms`);
    this.log('info', 'PERF', `Error Count: ${stats.errorCount} (${stats.errorRate}%)`);
    this.log('info', 'PERF', '');
    this.log('info', 'PERF', 'TOP 5 EXTENSIONS:');
    stats.topExtensions.forEach((ext, i) => {
      this.log('info', 'PERF', `  ${i+1}. ${ext.name}: ${ext.calls} calls, ${ext.averageTime.toFixed(2)}ms avg, ${ext.peakTime}ms peak`);
    });
    this.log('info', 'PERF', '='.repeat(80));
  }
}

const GameData = require('./data/game_data');

class ExtensionBypass {
  // Safely resolve protocol constants
  static _P(server, PROTOCOL) {
    return PROTOCOL || (server && server.PROTOCOL) || {};
  }

  // Entry point: Single unified router
  static handleExtension(
    socket,
    extensionName,
    params,
    messageType,
    server,
    PROTOCOL,
  ) {
    const P = this._P(server, PROTOCOL);
    const ext = String(extensionName);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const userId = socket?.sfsUser?.id ?? "N/A";
    const roomId = socket?.sfsUser?.currentRoom?.id ?? "N/A";
    
    // Create unique timer key for this extension call
    const timerKey = `ext_${ext}_${Date.now()}`;
    ExtensionDebug.startTimer(timerKey, `Extension ${ext}`);

    // Comprehensive debug logging
    ExtensionDebug.block('BYPASS', `Processing Extension ${ext}`, () => {
      ExtensionDebug.ui('CLICK/ACTION', `User clicked something in Flash UI`, {
        extension: ext,
        user: userName,
        userId: userId,
        roomId: roomId,
        messageType: messageType
      });
      
      ExtensionDebug.ext(ext, 'RECEIVED', userName, `Room: ${roomId}`);
      ExtensionDebug.net('in', messageType, params);
      
      // Log detailed parameter analysis
      let paramKeys = [];
      if (params && typeof params === 'object') {
        paramKeys = Object.keys(params);
        ExtensionDebug.log('debug', 'PARAMS', `Extension ${ext} has ${paramKeys.length} parameters: [${paramKeys.join(', ')}]`);
        
        // Log specific important parameters
        const importantParams = ['command', 'V_COMMAND', 'action', 'type', 'id'];
        importantParams.forEach(key => {
          if (params[key] !== undefined) {
            ExtensionDebug.log('debug', 'PARAMS', `${key} = ${params[key]}`);
          }
        });
      }

      // Flash debug info - send to client for visual debugging
      ExtensionDebug.flashDebug(socket, 'EXTENSION', `Processing ${ext}`, {
        extension: ext,
        user: userName,
        parameters: paramKeys,
        messageType: messageType
      });
    });

    // First pass: explicit routing based on ZONEEXTENSIONS
    switch (ext) {
      // Core
      case "1":
      case "RoomData":
        ExtensionDebug.ext(ext, 'ROUTING', userName, 'to handleRoomData');
        const roomResult = this.handleRoomData(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );
        const _elapsed1 = ExtensionDebug.endTimer(timerKey);
        ExtensionDebug.recordPerformance(ext, _elapsed1);
        ExtensionDebug.success('BYPASS', `Extension ${ext} completed (RoomData)`);
        return roomResult;

      case "0":
      case "LoginExtension":
        return this.handleLoginExtension(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "2":
      case "ItemData":
        return this.handleItemData(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "3":
      case "PlayerData":
        return this.handlePlayerData(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "6":
      case "Recycle":
        return this.handleRecycle(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "16":
      case "ShowGiftsExtension":
        return this.handleShowGifts(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "19":
      case "Chat":
        ExtensionDebug.ext(ext, 'ROUTING', userName, 'to handleChat');
        ExtensionDebug.ui('CHAT', `User typed/sent chat message`, params);
        const chatResult = this.handleChat(socket, params, messageType, server, PROTOCOL);
        const _elapsed2 = ExtensionDebug.endTimer(timerKey);
        ExtensionDebug.recordPerformance(ext, _elapsed2);
        ExtensionDebug.success('BYPASS', `Extension ${ext} completed (Chat)`);
        return chatResult;

      case "35":
      case "UserVarsChangeExtension":
        return this.handleUserVarsChange(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "36":
      case "StaticDataExtension":
        return this.handleStaticData(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "68":
      case "GetHouseStaticDataExtension":
        return this.handleHouseStaticData(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      // Cards and credits
      case "79":
      case "CardInventoryDataExtension":
        return this.handleCardInventory(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "80":
      case "CardPackWaitingDataExtension":
        return this.handleCardPackWaiting(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "90":
      case "GetCreditsStore":
        return this.handleCreditsStore(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "91":
      case "CreditsStoreStaticDataExtension":
        return this.handleCreditsStoreStaticData(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "95":
      case "CardsStaticDataExtension":
        return this.handleCardsStaticData(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      // NPC / Items / Potions
      case "8":
      case "NPCExtension":
        return this.handleNPCExtension(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "92":
      case "ItemsData":
        return this.handleItemsData(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "98":
      case "GetPotionStoreExtension":
        return this.handlePotionStore(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      // Animals
      case "29":
      case "AnimalEmoticon":
        return this.handleAnimalEmoticon(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "30":
      case "AnimalGamePlayed":
        return this.handleAnimalGamePlayed(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "31":
      case "BuyAnimal":
        return this.handleBuyAnimal(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "32":
      case "BuyAnimalFood":
        return this.handleBuyAnimalFood(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "33":
      case "CleanAnimal":
        return this.handleCleanAnimal(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "34":
      case "GetAnimalStore":
        return this.handleGetAnimalStore(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      // Security (new form/check/fill/verify)
      case "72":
      case "GetNewSecurityFormData":
        return this.handleSecurityNewForm(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "73":
      case "GetSecurityCheckData":
        return this.handleSecurityCheckData(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "74":
      case "FillSecurityFormData":
        return this.handleSecurityFillForm(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "75":
      case "CheckSecurityCheckData":
        return this.handleSecurityCheckVerify(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      // Cards/Albums + locks/credits
      case "76":
      case "AddAlbumExtension":
        return this.handleAddAlbum(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "77":
      case "AddCardPackExtension":
        return this.handleAddCardPack(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "78":
      case "CardDataExtension":
        return this.handleCardData(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "81":
      case "LockCardExtension":
        return this.handleLockCard(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "89":
      case "BuyCreditsStoreProductInstance":
        return this.handleBuyCreditsStoreProductInstance(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "99":
      case "LockPotionsExtension":
        return this.handleLockPotions(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      // Helper / Recycling / Days / Audit
      case "100":
      case "HelperFlowExtension":
        return this.handleHelperFlow(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "101":
      case "RecyclingCollectionTargetExtension":
        return this.handleRecyclingCollectionTarget(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "102":
      case "DaysPlayedRewardCompletedExtension":
        return this.handleDaysPlayedRewardCompleted(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "103":
      case "HelperAuditExtension":
        return this.handleHelperAudit(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      // Game + Quest + Messaging + Tutorial + Logout + Store
      case "9":
      case "GameExtension":
        return this.handleGameExtension(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "5":
      case "QuestController":
        return this.handleQuestController(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "7":
      case "MessagingExtension":
        return this.handleMessaging(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "22":
      case "Tutorial":
        return this.handleTutorial(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      case "21":
      case "Logout":
        return this.handleLogout(socket, params, messageType, server, PROTOCOL);

      case "12":
      case "Store":
        return this.handleStore(socket, params, messageType, server, PROTOCOL);

      case "11":
      case "RecyclingGame":
        return this.handleRecyclingGame(socket, params, messageType, server, PROTOCOL);

      // Trade request/accept/reject/cancel/abort (37-41)
      case "37":
      case "TradeRequestExtension":
        return this.handleTradeRequest(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );
      case "38":
      case "TradeAcceptExtension":
        return this.handleTradeAccept(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );
      case "39":
      case "TradeRejectExtension":
        return this.handleTradeReject(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );
      case "40":
      case "TradeCancelExtension":
        return this.handleTradeCancel(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );
      case "41":
      case "TradeTxAbort":
        return this.handleTradeAbort(
          socket,
          params,
          messageType,
          server,
          PROTOCOL,
        );

      // Trade transaction operations (42-49, 83)
      case "42":
      case "TradeTxClearSlot":
        return this.handleTradeTxClearSlot(socket, params, messageType, server, PROTOCOL);
      case "43":
      case "TradeTxComplete":
        return this.handleTradeTxComplete(socket, params, messageType, server, PROTOCOL);
      case "44":
      case "TradeTxPutInventoryItem":
        return this.handleTradeTxPutInventoryItem(socket, params, messageType, server, PROTOCOL);
      case "45":
      case "TradeTxPutRecycleItem":
        return this.handleTradeTxPutRecycleItem(socket, params, messageType, server, PROTOCOL);
      case "48":
      case "TradeTxExit":
        return this.handleTradeTxExit(socket, params, messageType, server, PROTOCOL);
      case "49":
      case "TradeTxLock":
        return this.handleTradeTxLock(socket, params, messageType, server, PROTOCOL);
      case "83":
      case "TradeTxPutCard":
        return this.handleTradeTxPutCard(socket, params, messageType, server, PROTOCOL);

      // Throwing game (4)
      case "4":
      case "ThrowingGame":
        return this.handleThrowingGame(socket, params, messageType, server, PROTOCOL);

      // OneOnOne (10)
      case "10":
      case "OneOnOne":
        return this.handleOneOnOne(socket, params, messageType, server, PROTOCOL);

      // Misc UI/extensions
      case "25":
      case "RemoveChatExtension":
        return this.handleRemoveChat(socket, params, messageType, server, PROTOCOL);
      case "17":
      case "CommunityDataExtension":
        return this.handleCommunityData(socket, params, messageType, server, PROTOCOL);
      case "18":
      case "MoneyDonationExtension":
        return this.handleMoneyDonation(socket, params, messageType, server, PROTOCOL);
      case "23":
      case "Newspapper":
        return this.handleNewspapper(socket, params, messageType, server, PROTOCOL);

      // Buddies (104-106) and GetUserVars (110)
      case "105":
      case "ApproveBuddyRequestExtension":
        return this.handleApproveBuddy(socket, params, messageType, server, PROTOCOL);
      case "106":
      case "AddBuddyExtension":
        return this.handleAddBuddy(socket, params, messageType, server, PROTOCOL);
      case "104":
      case "RemoveBuddyExtension":
        return this.handleRemoveBuddy(socket, params, messageType, server, PROTOCOL);
      case "110":
      case "GetUserVarsExtension":
        return this.handleGetUserVars(socket, params, messageType, server, PROTOCOL);

      // Set mood/image/skin (107-109)
      case "109":
      case "SetMoodExtension":
        return this.handleSetMood(socket, params, messageType, server, PROTOCOL);
      case "108":
      case "SetImageExtension":
        return this.handleSetImage(socket, params, messageType, server, PROTOCOL);
      case "107":
      case "SetSkinExtension":
        return this.handleSetSkin(socket, params, messageType, server, PROTOCOL);

      // Teleport
      case "20":
      case "TeleportPlayer":
        return this.handleTeleportPlayer(socket, params, messageType, server, PROTOCOL);

      // Gifts (throw/pick)
      case "14":
      case "GiftExtension":
        return this.handleGiftExtension(socket, params, messageType, server, PROTOCOL);
      case "15":
      case "PickGiftExtension":
        return this.handlePickGiftExtension(socket, params, messageType, server, PROTOCOL);

      // Security form (legacy)
      case "93":
      case "GetSecurityFormData":
        return this.handleGetSecurityFormData(socket, params, messageType, server, PROTOCOL);

      // Validate security code
      case "88":
      case "ValidateSecurityCode":
        return this.handleValidateSecurityCode(socket, params, messageType, server, PROTOCOL);

      // House room event
      case "70":
      case "HouseRoomEventExtension":
        return this.handleHouseRoomEvent(socket, params, messageType, server, PROTOCOL);

      // Additional extensions with exact 1:1 handlers
      case "13":
      case "Emoticons":
        return this.handleEmoticons(socket, params, messageType, server, PROTOCOL);
      case "24":
      case "RangerMessages":
        return this.handleRangerMessages(socket, params, messageType, server, PROTOCOL);
      case "26":
      case "PokeBlocked":
        return this.handlePokeBlocked(socket, params, messageType, server, PROTOCOL);
      case "27":
      case "Snitch":
        return this.handleSnitch(socket, params, messageType, server, PROTOCOL);
      case "28":
      case "PioneerStore":
        return this.handlePioneerStore(socket, params, messageType, server, PROTOCOL);
      case "46":
      case "HideAnimalExtension":
        return this.handleHideAnimal(socket, params, messageType, server, PROTOCOL);
      case "47":
      case "ShowAnimalExtension":
        return this.handleShowAnimal(socket, params, messageType, server, PROTOCOL);
      case "50":
      case "CampaignDonate":
        return this.handleCampaignDonate(socket, params, messageType, server, PROTOCOL);
      case "51":
      case "CampaignVote":
        return this.handleCampaignVote(socket, params, messageType, server, PROTOCOL);
      case "52":
      case "CampaignPromote":
        return this.handleCampaignPromote(socket, params, messageType, server, PROTOCOL);
      case "53":
      case "RandomEventCompletedExtension":
        return this.handleRandomEventCompleted(socket, params, messageType, server, PROTOCOL);
      case "54":
      case "RandomEventRejectedExtension":
        return this.handleRandomEventRejected(socket, params, messageType, server, PROTOCOL);
      case "55":
      case "CollectionRandomEventCompletedExtension":
        return this.handleCollectionRandomEventCompleted(socket, params, messageType, server, PROTOCOL);
      case "56":
      case "BuyHouseGardenPlantExtension":
        return this.handleBuyHouseGardenPlant(socket, params, messageType, server, PROTOCOL);
      case "57":
      case "HouseGardenPlantOperationExtension":
        return this.handleHouseGardenPlantOperation(socket, params, messageType, server, PROTOCOL);
      case "58":
      case "UpgradeHouseGardenLevelExtension":
        return this.handleUpgradeHouseGardenLevel(socket, params, messageType, server, PROTOCOL);
      case "59":
      case "BuyHouseItemExtension":
        return this.handleBuyHouseItem(socket, params, messageType, server, PROTOCOL);
      case "60":
      case "EnterHouseRoomExtension":
        return this.handleEnterHouseRoom(socket, params, messageType, server, PROTOCOL);
      case "61":
      case "GetHouseStorageExtension":
        return this.handleGetHouseStorage(socket, params, messageType, server, PROTOCOL);
      case "62":
      case "PlaceHouseItemExtension":
        return this.handlePlaceHouseItem(socket, params, messageType, server, PROTOCOL);
      case "63":
      case "ReplaceHouseExtension":
        return this.handleReplaceHouse(socket, params, messageType, server, PROTOCOL);
      case "64":
      case "SellHouseItemExtension":
        return this.handleSellHouseItem(socket, params, messageType, server, PROTOCOL);
      case "65":
      case "UpgradeHouseElectricLevelExtension":
        return this.handleUpgradeHouseElectricLevel(socket, params, messageType, server, PROTOCOL);
      case "66":
      case "UpgradeHouseSizeExtension":
        return this.handleUpgradeHouseSize(socket, params, messageType, server, PROTOCOL);
      case "67":
      case "BuyHouseExtension":
        return this.handleBuyHouse(socket, params, messageType, server, PROTOCOL);
      case "69":
      case "LockHouseExtension":
        return this.handleLockHouse(socket, params, messageType, server, PROTOCOL);
      case "71":
      case "BasicTutorialCompletedExtension":
        return this.handleBasicTutorialCompleted(socket, params, messageType, server, PROTOCOL);
      case "82":
      case "PingExtension":
        return this.handlePing(socket, params, messageType, server, PROTOCOL);
      case "84":
      case "OpenCardPackWaitingExtension":
        return this.handleOpenCardPackWaiting(socket, params, messageType, server, PROTOCOL);
      case "85":
      case "RandomEventCompletedAckExtension":
        return this.handleRandomEventCompletedAck(socket, params, messageType, server, PROTOCOL);
      case "86":
      case "DeactivateSecurityCode":
        return this.handleDeactivateSecurityCode(socket, params, messageType, server, PROTOCOL);
      case "87":
      case "GeneratePlayerSecurityCode":
        return this.handleGeneratePlayerSecurityCode(socket, params, messageType, server, PROTOCOL);
      case "94":
      case "ResetPlayerSecurityForm":
        return this.handleResetPlayerSecurityForm(socket, params, messageType, server, PROTOCOL);
      case "96":
      case "UsePotionExtension":
        return this.handleUsePotion(socket, params, messageType, server, PROTOCOL);
      case "97":
      case "BuyPotionExtension":
        return this.handleBuyPotion(socket, params, messageType, server, PROTOCOL);
      case "111":
      case "TeleportToUserExtension":
        return this.handleTeleportToUser(socket, params, messageType, server, PROTOCOL);
      case "112":
      case "InitMultiplayerTask":
        return this.handleInitMultiplayerTask(socket, params, messageType, server, PROTOCOL);
      case "113":
      case "JoinMultiplayerTask":
        return this.handleJoinMultiplayerTask(socket, params, messageType, server, PROTOCOL);
      case "114":
      case "LoadedMultiplayerTask":
        return this.handleLoadedMultiplayerTask(socket, params, messageType, server, PROTOCOL);
      case "115":
      case "ExitMultiplayerTask":
        return this.handleExitMultiplayerTask(socket, params, messageType, server, PROTOCOL);
      case "116":
      case "CompleteMultiplayerTask":
        return this.handleCompleteMultiplayerTask(socket, params, messageType, server, PROTOCOL);
      case "117":
      case "AcceptedToMultiplayerTask":
        return this.handleAcceptedToMultiplayerTask(socket, params, messageType, server, PROTOCOL);
      case "118":
      case "RejectFromMultiplayerTask":
        return this.handleRejectFromMultiplayerTask(socket, params, messageType, server, PROTOCOL);
      case "119":
      case "SendCommandToMPTask":
        return this.handleSendCommandToMPTask(socket, params, messageType, server, PROTOCOL);
      case "120":
      case "FailedMultiplayerTask":
        return this.handleFailedMultiplayerTask(socket, params, messageType, server, PROTOCOL);
      case "121":
      case "HitLifeTrapExtension":
        return this.handleHitLifeTrap(socket, params, messageType, server, PROTOCOL);
      case "122":
      case "RangerGiveGoldExtension":
        return this.handleRangerGiveGold(socket, params, messageType, server, PROTOCOL);

      default:
        // If not explicitly routed: try OneOnOne passthrough (1:1 game protocol object)
        if (
          this.tryOneOnOnePassthrough(
            socket,
            params,
            messageType,
            server,
            PROTOCOL,
          )
        ) {
          return true;
        }

        // Fallback: avoid sending generic 'ok' responses — no-op to match client that doesn't expect a payload here
        ExtensionDebug.warn('FALLBACK', `No specific handler found for extension ${ext}, skipping response to avoid generic OK`);
        const _elapsed3 = ExtensionDebug.endTimer(timerKey);
        ExtensionDebug.recordPerformance(ext, _elapsed3);
        ExtensionDebug.success('BYPASS', `Extension ${ext} completed (fallback no-op)`);
        return true;
    }

    // This should never be reached, but just in case
    ExtensionDebug.error('BYPASS', `Extension ${ext} reached end of function without returning - this should not happen!`);
    ExtensionDebug.endTimer(timerKey);
    return false;
  }

  // =============== Core Handlers ===============

  // =============== Helpers: user/session state ===============
  static _getUser(socket) {
    return socket?.sfsUser || null;
  }

  static _ensurePlayerData(socket) {
    const user = this._getUser(socket);
    if (!user) return null;
    if (!user.playerData) {
      user.playerData = { gold: 0, level: 1, storage: {}, inventory: {} };
    }
    if (!user.getVariable) {
      user._vars = user._vars || {};
      user.getVariable = (k) => user._vars[k];
      user.setVariable = (k, v) => { user._vars[k] = v; };
      user.getVariables = () => ({ ...user._vars });
    }
    return user.playerData;
  }

  static _addGold(socket, amount) {
    const pd = this._ensurePlayerData(socket);
    if (!pd) return 0;
    pd.gold = Math.max(0, (pd.gold || 0) + (amount || 0));
    return pd.gold;
  }

  static _hasGold(socket, amount) {
    const pd = this._ensurePlayerData(socket);
    if (!pd) return false;
    return (pd.gold || 0) >= (amount || 0);
  }

  static _spendGold(socket, amount) {
    const pd = this._ensurePlayerData(socket);
    if (!pd) return false;
    if ((pd.gold || 0) < (amount || 0)) return false;
    pd.gold -= amount;
    return true;
  }

  static _giveItem(socket, itemId, slotId = null, price = 0) {
    const pd = this._ensurePlayerData(socket);
    if (!pd) return null;
    pd.inventory = pd.inventory || {};
    const idStr = String(itemId);
    const item = pd.inventory[idStr] || { id: itemId, qty: 0, price: price || 0 };
    item.qty += 1;
    pd.inventory[idStr] = item;
    return item;
  }

  static _removeItem(socket, itemId) {
    const pd = this._ensurePlayerData(socket);
    if (!pd) return false;
    pd.inventory = pd.inventory || {};
    const idStr = String(itemId);
    const item = pd.inventory[idStr];
    if (!item || item.qty <= 0) return false;
    item.qty -= 1;
    if (item.qty === 0) delete pd.inventory[idStr];
    return true;
  }

  static _moveItemToStorage(socket, itemId, fromSlotId, toSlotId) {
    const pd = this._ensurePlayerData(socket);
    if (!pd) return false;
    pd.storage = pd.storage || {};
    pd.inventory = pd.inventory || {};
    const idStr = String(itemId);
    if (!pd.inventory[idStr]) return false;
    // transfer one unit
    this._removeItem(socket, itemId);
    pd.storage[idStr] = (pd.storage[idStr] || 0) + 1;
    return true;
  }

  // =============== Helpers: NPC loading ===============
  static _loadNpcList(server) {
    try {
      if (this._npcListCache && Array.isArray(this._npcListCache)) return this._npcListCache;
      const listPath = (server && server.gamePaths && server.gamePaths.npcListFile) 
        || path.join(__dirname, 'ekoloko', 'ekoloko', 'npcs', 'listNpcs_iw.action');
      if (!fs.existsSync(listPath)) {
        ExtensionDebug.warn('NPC', `NPC list file not found at ${listPath}`);
        this._npcListCache = [];
        return this._npcListCache;
      }
      const raw = fs.readFileSync(listPath, 'utf8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) {
        ExtensionDebug.warn('NPC', 'NPC list is not an array');
        this._npcListCache = [];
        return this._npcListCache;
      }
      this._npcListCache = data.map(entry => ({
        id: Number(entry.id),
        name: String(entry.name || ''),
        file: String(entry.file || ''),
        room_id: Number(entry.room_id),
        position_x: Number(entry.position_x || 0),
        position_y: Number(entry.position_y || 0),
      }));
      ExtensionDebug.log('info', 'NPC', `Loaded ${this._npcListCache.length} NPC definitions`);
      return this._npcListCache;
    } catch (e) {
      ExtensionDebug.warn('NPC', `Failed to load NPC list: ${e?.message || e}`);
      this._npcListCache = [];
      return this._npcListCache;
    }
  }

  static _getDefaultNpcPosition(roomId) {
    // Standardized placement: center-right of stage (tuned for ~960x540)
    return { x: 700, y: 440 };
  }

  static _getNpcsForRoom(roomId, P) {
    try {
      const list = this._loadNpcList();
      const rid = Number(roomId);
      const filtered = list.filter(n => Number(n.room_id) === rid);
      if (filtered.length === 0) return [];
      // Choose a single, primary NPC per room: smallest ID wins (deterministic)
      const primary = filtered.reduce((min, cur) => (min == null || Number(cur.id) < Number(min.id) ? cur : min), null);
      if (!primary) return [];
      const npc = {};
      npc[P.NPC?.ID || '0'] = Number(primary.id);
      npc[P.NPC?.NAME || '1'] = primary.name || '';
      npc[P.NPC?.HISTORY || '2'] = '';
      npc[P.NPC?.BLUBBLE || '3'] = '';
      const base = primary.file.endsWith('.swf') ? primary.file.slice(0, -4) : primary.file;
      npc[P.NPC?.URL || '4'] = base;
      const pos = this._getDefaultNpcPosition(rid);
      npc[P.NPC?.PX || '5'] = pos.x;
      npc[P.NPC?.PY || '6'] = pos.y;
      npc[P.NPC?.MSGS || '7'] = [];
      npc[P.NPC?.ROOM_ID || '8'] = rid;
      npc[P.NPC?.PREMIUM_ONLY || '9'] = false;
      return [npc];
    } catch (e) {
      ExtensionDebug.warn('NPC', `Failed to build NPCs for room ${roomId}: ${e?.message || e}`);
      return [];
    }
  }

  static _getAllNpcsStatic(P) {
    try {
      const list = this._loadNpcList();
      // One NPC per room in static data as well (primary = smallest ID)
      const byRoom = new Map();
      for (const n of list) {
        const rid = Number(n.room_id);
        const existing = byRoom.get(rid);
        if (!existing || Number(n.id) < Number(existing.id)) {
          byRoom.set(rid, n);
        }
      }
      const arr = [];
      for (const n of byRoom.values()) {
        const obj = {};
        obj[P.NPC?.ID || '0'] = Number(n.id);
        const base = n.file.endsWith('.swf') ? n.file.slice(0, -4) : n.file;
        obj[P.NPC?.URL || '4'] = base;
        obj[P.NPC?.ROOM_ID || '8'] = Number(n.room_id);
        obj[P.NPC?.PREMIUM_ONLY || '9'] = false;
        arr.push(obj);
      }
      return arr;
    } catch (e) {
      ExtensionDebug.warn('NPC', `Failed to build static NPC list: ${e?.message || e}`);
      return [];
    }
  }

  static handleLoginExtension(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    // Minimal OK to satisfy login extension handshakes
    server.sendExtensionResponse(
      socket,
      { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_LOGIN_OK },
      messageType,
    );
    return true;
  }

  static handleRoomData(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    // Determine intent (C_GET_ROOM or C_ROOM_ENTER) for parity with AS3 client
    const command = params?.[P.COMMANDS?.V_COMMAND] ?? params?.command ?? P.COMMANDS?.C_GET_ROOM;
    const roomTimer = `room_${userName}_${Date.now()}`;

    ExtensionDebug.startTimer(roomTimer, `RoomData processing for ${userName}`);

    // Resolve roomId early for logging/branching
    const roomId =
      params?.[P.COMMANDS?.V_ROOM_ID] ??
      params?.roomId ??
      socket?.sfsUser?.currentRoom?.id ??
      101;

    ExtensionDebug.block('ROOM', `Processing RoomData request`, () => {
      ExtensionDebug.ui('ROOM', `Command=${command} for roomId=${roomId}`);
    });

    // If this is C_ROOM_ENTER, the AS3 client does not expect a payload here.
    // WorldRoomData will issue C_GET_ROOM afterwards (with a listener attached).
    if (String(command) === String(P.COMMANDS?.C_ROOM_ENTER)) {
      ExtensionDebug.log('info', 'ROOM', `C_ROOM_ENTER acknowledged for ${userName} (room ${roomId}); no S_ROOM_DATA sent`);
      const elapsedEnter = ExtensionDebug.endTimer(roomTimer);
      ExtensionDebug.recordPerformance('RoomData', elapsedEnter);
      return true;
    }

    ExtensionDebug.log('info', 'ROOM', `Resolved room ID: ${roomId} for user ${userName}`);
    ExtensionDebug.flashDebug(socket, 'ROOM', `Loading room ${roomId}`, { roomId, user: userName });

    // Resolve ROOM constants with robust fallback to numeric-string indices
    const ROOM_CONSTS = (P && P.ROOM) ? P.ROOM : {
      ID: "0",
      SOUND: "1",
      SWF: "2",
      PORTALS: "3",
      MAX_TRASH_ITEMS: "4",
      ZONE_ID: "5",
      LEVEL: "6",
      LEADERSHIP: "7",
      ITEM: "8",
      MUST_EQUIP: "9",
      PREMIUM: "10",
      PIONEER_POINTS: "11",
      SENIORITY: "12",
      LIFE_LEVEL_TYPE: "13",
    };

    const roomData = {};
    roomData[ROOM_CONSTS.ID] = roomId;
    roomData[ROOM_CONSTS.SWF] = String(roomId);
    roomData[ROOM_CONSTS.SOUND] = "";

    // Build portals from paths.json so Flash sees correct neighbors
    // Uses PORTAL constants if available; falls back to numeric string keys
    const PORTAL_CONSTS = (P && P.PORTAL)
      ? P.PORTAL
      : { ID: "0", ROOM_A: "1", ROOM_B: "2", STATE: "3" };

    let portals = [];
    try {
      // Lazy-load and cache paths once
      if (!this._pathsCache) {
        let pathsFile = server?.gamePaths?.mapPathsFile;
        if (!pathsFile || !fs.existsSync(pathsFile)) {
          // Fallback to repository root paths.json next to this file
          pathsFile = path.join(__dirname, "paths.json");
        }
        if (fs.existsSync(pathsFile)) {
          const raw = fs.readFileSync(pathsFile, "utf8");
          this._pathsCache = JSON.parse(raw);
        } else {
          this._pathsCache = [];
        }
      }

      const neighbors = new Set();
      const roomKey = String(roomId);
      for (const obj of Array.isArray(this._pathsCache) ? this._pathsCache : []) {
        if (obj && obj[roomKey] && typeof obj[roomKey] === "object") {
          for (const [target, val] of Object.entries(obj[roomKey])) {
            if (val !== null && val !== "null") neighbors.add(String(target));
          }
        }
      }

      const neighborList = Array.from(neighbors);
      portals = neighborList.map((t, idx) => {
        const prt = {};
        prt[PORTAL_CONSTS.ID] = idx + 1;
        prt[PORTAL_CONSTS.ROOM_A] = Number(roomId);
        prt[PORTAL_CONSTS.ROOM_B] = Number(t) || t;
        prt[PORTAL_CONSTS.STATE] = 1; // open
        return prt;
      });
    } catch (e) {
      ExtensionDebug.warn('ROOM', `Failed to read neighbors from paths.json for room ${roomId}`, e?.message || e);
      portals = [];
    }

    // Fallback to self-loop portals if nothing found (ensures UI still shows a door)
    if (!Array.isArray(portals) || portals.length === 0) {
      const fallback = [];
      for (let i = 1; i <= 2; i++) {
        const prt = {};
        prt[PORTAL_CONSTS.ID] = i;
        prt[PORTAL_CONSTS.ROOM_A] = Number(roomId);
        prt[PORTAL_CONSTS.ROOM_B] = Number(roomId);
        prt[PORTAL_CONSTS.STATE] = 1;
        fallback.push(prt);
      }
      portals = fallback;
    }

    roomData[ROOM_CONSTS.PORTALS] = portals;
    roomData[ROOM_CONSTS.ZONE_ID] = 1;
    roomData[ROOM_CONSTS.LEVEL] = 0;
    roomData[ROOM_CONSTS.SENIORITY] = 0;
    roomData[ROOM_CONSTS.LEADERSHIP] = 0;
    roomData[ROOM_CONSTS.PIONEER_POINTS] = 0;
    roomData[ROOM_CONSTS.MUST_EQUIP] = false;
    roomData[ROOM_CONSTS.PREMIUM] = false;
    roomData[ROOM_CONSTS.LIFE_LEVEL_TYPE] = null;
    roomData[ROOM_CONSTS.ITEM] = null;
    roomData[ROOM_CONSTS.MAX_TRASH_ITEMS] = 0;

    // Build NPCs for this room from configured list
    const npcsArr = this._getNpcsForRoom(roomId, P);
    ExtensionDebug.flashDebug(socket, 'ROOM_NPCS', `Placed ${npcsArr.length} NPC(s) in room ${roomId}`, { roomId, count: npcsArr.length });

    const response = {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_ROOM_DATA,
      [P.COMMANDS?.V_ROOM_ID]: roomId,
      [P.COMMANDS?.V_ROOM_NPCS]: npcsArr,
      [P.COMMANDS?.V_ROOM_DATA]: roomData,
      [P.COMMANDS?.V_PORTALS]: roomData[ROOM_CONSTS.PORTALS],
      // Some clients also read flat fields
      [P.COMMANDS?.V_ROOM_SWF]: String(roomId),
      [P.COMMANDS?.V_ROOM_SOUND]: "",
    };

    ExtensionDebug.net('out', messageType, response);
    ExtensionDebug.success('ROOM', `Sending room data for room ${roomId}`);
    server.sendExtensionResponse(socket, response, messageType);

    const elapsed = ExtensionDebug.endTimer(roomTimer);
    ExtensionDebug.success('ROOM', `RoomData processing completed in ${elapsed}ms`);
    return true;
  }

  static handleItemData(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    // ItemData requests from AS3 send ITEM.ID ("0") in the payload; also support V_ITEM_ID
    const itemId =
      params?.[P.COMMANDS?.V_ITEM_ID] ??
      params?.[P.ITEM?.ID || "0"] ??
      params?.itemId ??
      0;

    const itemObj = GameData.getItem(itemId);

    // Respond with S_ITEM_DATA and include both V_ITEM_ID and top-level ITEM.ID for AS3 filters
    const response = {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_ITEM_DATA,
      [P.COMMANDS?.V_ITEM_ID]: itemId,
      [P.ITEM?.ID || "0"]: itemId,
      [P.COMMANDS?.V_ITEM]: itemObj,
    };

    server.sendExtensionResponse(
      socket,
      response,
      messageType,
    );
    return true;
  }

  static handlePlayerData(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const command = params?.[P.COMMANDS?.V_COMMAND] ?? params?.command ?? null;

    switch (command) {
      case P.COMMANDS?.C_GET_INVENTORY:
        {
          const pd = this._ensurePlayerData(socket);
          const inv = pd?.inventory || {};
          // Build array of inventory slots matching AS3 INVETORYITEM schema
          const INV = (P && P.INVETORYITEM) ? P.INVETORYITEM : { ITEM: "0", IS_EQUIPED: "1", SLOT: "2", DAYS_LEFT: "3", PIONEER: "4", NO_LIMITS: "5" };
          const itemsArr = [];
          let slotCounter = 0;
          const invSlotMap = {};
          for (const idStr of Object.keys(inv)) {
            const entry = inv[idStr];
            const qty = Math.max(1, Number(entry?.qty || 1));
            for (let i = 0; i < qty; i++) {
              const rec = {};
              rec[INV.ITEM] = Number(idStr);
              rec[INV.IS_EQUIPED] = 0;
              const thisSlot = slotCounter++;
              rec[INV.SLOT] = thisSlot;
              rec[INV.DAYS_LEFT] = -1;
              rec[INV.PIONEER] = 0;
              rec[INV.NO_LIMITS] = 0;
              itemsArr.push(rec);
              invSlotMap[thisSlot] = Number(idStr);
            }
          }
          // cache slot->item map for trade flows
          if (socket) socket._invSlots = invSlotMap;
          server.sendExtensionResponse(
            socket,
            {
              [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_INVENTORY_DATA,
              [P.COMMANDS?.V_ITEMS]: itemsArr,
              [P.COMMANDS?.V_GOLD]: pd?.gold ?? 0,
              [P.COMMANDS?.V_LEVEL]: pd?.level ?? 1,
            },
            messageType,
          );
        }
        return true;

      case P.COMMANDS?.C_GET_PLAYER_PUBLIC_DATA: {
        // Return public variables for a requested player; fallback to current user
        const targetId = params?.[P.COMMANDS?.V_PLAYER_ID]
          ?? params?.[P.COMMANDS?.V_SFS_UID]
          ?? socket?.sfsUser?.id
          ?? 1;
        // If server provides user lookup, prefer that; otherwise use current user
        const targetUser = socket?.sfsUser; // Fallback due to environment constraints
        const targetVars = targetUser?.getVariables?.() ?? {};
        server.sendExtensionResponse(
          socket,
          {
            [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_PLAYER_PUBLIC_DATA,
            [P.COMMANDS?.V_PLAYER_ID]: targetId,
            [P.COMMANDS?.V_USER_VARS]: targetVars,
          },
          messageType,
        );
        return true;
      }

      case P.COMMANDS?.S_GET_POTION_INVENTORY:
        // Some clients request potions via this command value
        server.sendExtensionResponse(
          socket,
          {
            [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_POTION_INVENTORY_DATA,
            [P.COMMANDS?.V_ITEMS]: [],
          },
          messageType,
        );
        return true;

      default:
        // Send S_PLAYERS_DATA with user variables needed for avatar display
        const userVars = socket?.sfsUser?.getVariables?.() ?? {};
        server.sendExtensionResponse(
          socket,
          {
            [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_PLAYERS_DATA,
            [P.COMMANDS?.V_USER_VARS]: userVars,
            [P.COMMANDS?.V_PLAYER_ID]: socket?.sfsUser?.id ?? 1,
          },
          messageType,
        );
        return true;
    }
  }

  static handleShowGifts(socket, _params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    
    ExtensionDebug.ui('SHOW_GIFTS', `User requesting room gifts`);
    ExtensionDebug.log('info', 'GIFTS', `Show gifts request from ${userName}`);
    ExtensionDebug.flashDebug(socket, 'GIFTS', `Loading room gifts`, { user: userName });
    
    // According to AS, server responds with S_ROOM_GIFT_ITEMS with V_ITEMS array
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_ROOM_GIFT_ITEMS,
        [P.COMMANDS?.V_ITEMS]: [], // Empty array - no gifts in room currently
      },
      messageType,
    );
    ExtensionDebug.success('GIFTS', `Room gifts data sent (0 items)`);
    return true;
  }

  static handleRecycle(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const command =
      params?.[P.COMMANDS?.V_COMMAND] ??
      params?.command ??
      P.COMMANDS?.C_GET_ROOM_RECYCLE_ITEMS;

    if (String(command) === String(P.COMMANDS?.C_GET_ROOM_RECYCLE_ITEMS)) {
      // Main.as expects S_ROOM_RECYCLE_ITEMS with V_ITEMS
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_ROOM_RECYCLE_ITEMS,
          [P.COMMANDS?.V_ITEMS]: [],
        },
        messageType,
      );
    } else if (String(command) === String(P.COMMANDS?.C_GET_PLAYER_RECYCLE_ITEMS)) {
      // Main.as expects S_GET_PLAYER_RECYCLE_ITEMS with V_ITEMS
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GET_PLAYER_RECYCLE_ITEMS,
          [P.COMMANDS?.V_ITEMS]: [],
        },
        messageType,
      );
    } else if (String(command) === String(P.COMMANDS?.C_DEPOSIT_RECYCLE_ITEMS)) {
      // Acknowledge deposit with empty data and zero value
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_DEPOSIT_RECYCLE_ITEMS,
          [P.COMMANDS?.V_DEPOSIT_ITEMS_DATA]: [],
          [P.COMMANDS?.V_DEPOSIT_VAULE]: 0,
        },
        messageType,
      );
    } else {
      // Fallback minimal dataset for other recycle-related queries
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_RECYCLE_ITEMS_DATA,
          [P.COMMANDS?.V_RECYCLE_ITEMS_DATA]: [],
        },
        messageType,
      );
    }
    return true;
  }

  // RecyclingGame (11) – send exact reward update structure
  static handleRecyclingGame(
    socket,
    params,
    messageType,
    server,
    PROTOCOL,
  ) {
    const P = this._P(server, PROTOCOL);
    // The client expects S_RECYCLE_GAME_REWARD_UPDATE with reward fields
    // Use params if present, else safe defaults; also add small gold to user state
    const score = Number(params?.[P.COMMANDS?.V_GAME_SCORE] ?? 0);
    const activity = Math.max(0, Math.min(10, Math.floor(score / 10)));
    const gold = Math.max(0, Math.floor(score / 20));
    try { this._addGold(socket, gold); } catch (_) {}

    const payload = {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_RECYCLE_GAME_REWARD_UPDATE,
      [P.COMMANDS?.V_GAME_SCORE]: score,
      [P.COMMANDS?.V_REWARD_ACTIVITY_POINTS]: activity,
      [P.COMMANDS?.V_REWARD_ITEM]: 0,
      [P.COMMANDS?.V_REWARD_GOLD]: gold,
      [P.COMMANDS?.V_REWARD_LEADERSHIP]: 0,
      [P.COMMANDS?.V_GAME_LEVEL]: 1,
      [P.COMMANDS?.V_LEVEL_UP]: 0,
      [P.COMMANDS?.V_REWARD_CREDITS]: 0,
      [P.COMMANDS?.V_REWARD_RECYCLE_ITEM]: null,
      [P.COMMANDS?.V_REWARD_RECYCLE_ITEM_QUANTITY]: 0,
      [P.COMMANDS?.V_REWARD_POTION]: null,
      [P.COMMANDS?.V_REWARD_POTION_QUANTITY]: 0,
    };

    server.sendExtensionResponse(socket, payload, messageType);
    return true;
  }

  static handleChat(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const userId = socket?.sfsUser?.id ?? 1;
    const roomId = socket?.sfsUser?.currentRoom?.id ?? 101;
    
    ExtensionDebug.block('CHAT', `Processing chat message`, () => {
      ExtensionDebug.ui('CHAT', `User sent chat message`);
      ExtensionDebug.log('info', 'CHAT', `Chat message from ${userName} in room ${roomId}: "${params?.[P.COMMANDS?.V_MESSAGE] ?? ""}"`);
    });
    
    const message = params?.[P.COMMANDS?.V_MESSAGE] ?? params?.["65"] ?? "";
    
    ExtensionDebug.flashDebug(socket, 'CHAT', `Chat: ${message.substring(0, 50)}`, { 
      user: userName, 
      room: roomId,
      messageLength: message.length 
    });
    
    // According to ActionScript Main.as:
    // Chat extension doesn't get a direct extension response
    // Instead the message is broadcast via SmartFoxServer's built-in chat system
    // The server should use sendPublicMessage which triggers onPublicMessage event
    
    if (server.sendPublicMessage) {
      server.sendPublicMessage(socket, message, roomId);
    } else if (server.broadcastToRoom) {
      // Fallback: broadcast as extension response to all users in room
      const chatBroadcast = {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_PUBLIC_MESSAGE,
        [P.COMMANDS?.V_MESSAGE]: message,
        [P.COMMANDS?.V_PLAYER_ID]: userId,
        [P.COMMANDS?.V_USER_NAME]: userName,
      };
      server.broadcastToRoom(roomId, chatBroadcast, messageType);
    }
    
    ExtensionDebug.success('CHAT', `Chat message processed successfully for ${userName}`);
    return true;
  }

  static handleUserVarsChange(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    
    if (!socket?.sfsUser) {
      ExtensionDebug.error('USERVARS', 'No sfsUser found on socket - cannot update variables');
      return false;
    }

    ExtensionDebug.block('USERVARS', `Processing user variable changes`, () => {
      ExtensionDebug.ui('VARIABLE_CHANGE', `User variables being updated (avatar/status/position changes)`);
    });

    const changedVars = [];
    // Update user variables
    for (const key of Object.keys(params ?? {})) {
      if (key !== P.COMMANDS?.V_COMMAND && key !== "command") {
        const oldValue = socket.sfsUser.getVariable?.(key);
        socket.sfsUser.setVariable?.(key, params[key]);
        changedVars.push({ key, oldValue, newValue: params[key] });
        ExtensionDebug.log('debug', 'USERVARS', `${key}: ${oldValue} → ${params[key]}`);
      }
    }
    
    ExtensionDebug.log('info', 'USERVARS', `Updated ${changedVars.length} user variables for ${userName}`);
    ExtensionDebug.flashDebug(socket, 'USERVARS', `Updated ${changedVars.length} variables`, { user: userName, changes: changedVars });

    // Broadcast to current room if available
    if (socket.sfsUser.currentRoom && server.broadcastUserVariableUpdate) {
      server.broadcastUserVariableUpdate(
        socket.sfsUser.currentRoom,
        socket.sfsUser,
        Object.keys(params ?? {}),
      );
    }

    return true;
  }

  static handleStaticData(socket, _params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";

    ExtensionDebug.ui('STATIC_DATA', `User ${userName} requesting static game data`);
    ExtensionDebug.log('info', 'STATIC', `Loading static data for ${userName}`);
    ExtensionDebug.flashDebug(socket, 'STATIC', `Loading game static data`, { user: userName });

    // According to AS: S_STATIC_DATA with all game configuration data
    // CRITICAL: Provide V_NPCS_DATA so ItemCache.SetNpcData has URL base names for NPC swfs
    const response = {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_STATIC_DATA,
      [P.COMMANDS?.V_RECYCLE_ITEMS_DATA]: [],
      [P.COMMANDS?.V_GAMES_1_1_DATA]: [],
      [P.COMMANDS?.V_GAMES_SINGLE_DATA]: [],
      [P.COMMANDS?.V_GAMES_IN_WORLD_DATA]: [],
      [P.COMMANDS?.V_QUIZ_DATA]: [],
      [P.COMMANDS?.V_NPCS_DATA]: this._getAllNpcsStatic(P),
      [P.COMMANDS?.V_EMOTICONS_DATA]: [],
      [P.COMMANDS?.V_ANIMAL_GAMES]: [],
      [P.COMMANDS?.V_SENIORITY_LEVELS]: [],
      [P.COMMANDS?.V_PLAYER_ICONS]: [],
      [P.COMMANDS?.V_PLAYER_MOODS]: [],
      [P.COMMANDS?.V_PLAYER_COLORS]: [],
      [P.COMMANDS?.V_POTIONS_DATA]: [],
      [P.COMMANDS?.V_MULTIPLAYER_TASKS]: [],
      [P.COMMANDS?.V_STORE_DATA]: { id: 1, items: [], itemCount: 0 },
    };

    server.sendExtensionResponse(socket, response, messageType);
    ExtensionDebug.success('STATIC', `Static data sent to ${userName}`);

    // Do not auto-join here; the ActionScript client calls joinRoom itself
    // after WorldRoomData has loaded. Auto-joining can cause a race that hides the avatar.
    return true;
  }




  // Legacy security form data (93) – provide minimal questions list
  static handleGetSecurityFormData(socket, _params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(socket, {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GET_SECURITY_FORM_DATA,
      [P.COMMANDS?.V_SECURITY_FORM_Q_DATA]: [1,2,3],
      [P.COMMANDS?.V_SECURITY_FORM_A_DATA]: [],
    }, messageType);
    return true;
  }

  // Validate security code
  static handleValidateSecurityCode(socket, _params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_SECURITY_CODE_VALID }, messageType);
    return true;
  }


static handleHouseStaticData(socket, _params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_HOUSE_STATIC_DATA,
        [P.COMMANDS?.V_HOUSE_TYPES]: [],
        [P.COMMANDS?.V_HOUSE_ITEM_TYPES]: [],
        [P.COMMANDS?.V_HOUSE_ITEMS]: [],
        [P.COMMANDS?.V_HOUSE_GARDEN_PLANT_TYPES]: [],
        [P.COMMANDS?.V_HOUSE_GARDEN_PLANTS]: [],
        [P.COMMANDS?.V_HOUSE_ELECTRIC_LEVELS]: [],
        [P.COMMANDS?.V_HOUSE_GARDEN_LEVELS]: [],
        [P.COMMANDS?.V_GARDENER_LEVELS]: [],
        [P.COMMANDS?.V_HOUSE_ITEM_EVENTS]: [],
        [P.COMMANDS?.V_MAX_ELECTRIC_UNITS]: 0,
        [P.COMMANDS?.V_MAX_GARDEN_TILES]: 0,
      },
      messageType,
    );
    return true;
  }

  static handleCardInventory(socket, _params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CARD_INVENTORY_ITEMS,
        [P.COMMANDS?.V_CARD_INVENTORY_ITEMS]: [],
        [P.COMMANDS?.V_PLAYER_ALBUMS]: [],
      },
      messageType,
    );
    return true;
  }

  static handleCardPackWaiting(socket, _params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CARD_PACK_WAITING_ITEMS,
        [P.COMMANDS?.V_CARD_PACK_WAITING_ITEMS]: [],
      },
      messageType,
    );
    return true;
  }

  static handleCreditsStore(socket, _params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CREDITS_STORE_DATA,
        [P.COMMANDS?.V_CREDITS_STORE_PRODUCTS_LEFT]: [],
        [P.COMMANDS?.V_CREDITS_STORE_DISCOUNTS]: [],
        [P.COMMANDS?.V_CREDITS_STORE_PRODUCTS]: [],
      },
      messageType,
    );
    return true;
  }

  static handleCreditsStoreStaticData(
    socket,
    _params,
    messageType,
    server,
    PROTOCOL,
  ) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CREDITS_STORE_STATIC_DATA,
        [P.COMMANDS?.V_CREDITS_STORE_PRODUCTS_DATA]: [],
        [P.COMMANDS?.V_CREDITS_STORE_PRODUCTS]: [],
        [P.COMMANDS?.V_CREDITS_STORE_DATA]: [],
        [P.COMMANDS?.V_CREDITS_STORE_VERSION]: Date.now(),
      },
      messageType,
    );
    return true;
  }

  static handleCardsStaticData(socket, _params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CARDS_STATIC_DATA,
        [P.COMMANDS?.V_ALL_ALBUMS_DATA]: [],
        [P.COMMANDS?.V_ALL_CARD_SETS]: [],
        [P.COMMANDS?.V_ACTIVE_CARD_PACKS_SERIES_IDS]: [],
        [P.COMMANDS?.V_ALL_CARDS]: [],
      },
      messageType,
    );
    return true;
  }

  // =============== Extra Minimal Handlers ===============

  static handleItemsData(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const instanceId = params?.[P.COMMANDS?.V_INSTANCE_ID] ?? null;
    const itemsIdsRaw = params?.[P.COMMANDS?.V_ITEMS_IDS] ?? [];
    const ids = Array.isArray(itemsIdsRaw) ? itemsIdsRaw : [];
    
    ExtensionDebug.ui('ITEMS_DATA_REQUEST', `User requesting data for ${ids.length} items`);
    ExtensionDebug.log('info', 'ITEMS', `Instance: ${instanceId}, Item IDs: [${ids.join(', ')}], User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'ITEMS', `Loading ${ids.length} items`, { instanceId, itemCount: ids.length, user: userName });
    
    const itemsArr = [];
    for (const id of ids) {
      itemsArr.push(GameData.getItem(id));
    }
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_ITEMS_DATA,
        [P.COMMANDS?.V_ITEMS]: itemsArr,
        [P.COMMANDS?.V_INSTANCE_ID]: instanceId,
      },
      messageType,
    );
    ExtensionDebug.success('ITEMS', `Items data sent successfully`);
    return true;
  }

  static handleNPCExtension(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const command = params?.[P.COMMANDS?.V_COMMAND] ?? params?.command ?? null;

    // NPC.ID is used in ActionScript via NPC constants
    const npcId = params?.[P.NPC?.ID || "0"] ?? params?.id ?? 0;

    ExtensionDebug.ui('NPC', `User interacting with NPC (ID: ${npcId})`);
    ExtensionDebug.log('info', 'NPC', `NPC Extension - Command: ${command}, NPC ID: ${npcId}, User: ${userName}`);

    if (command === P.COMMANDS?.C_GET_NPC_GAMES) {
      ExtensionDebug.flashDebug(socket, 'NPC', `Getting games for NPC ${npcId}`, { npcId, user: userName });

      // 1:1 with AS3: respond with S_NPC_GAMES, include NPC.ID and V_NPC_GAMES
      // The client cross-references ItemCache.GetGamesData(npcId) (from StaticData)
      // and marks those present in V_NPC_GAMES as available.
      const response = {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_NPC_GAMES,
        [P.NPC?.ID || "0"]: Number(npcId),
        [P.COMMANDS?.V_NPC_GAMES]: [],
      };
      server.sendExtensionResponse(socket, response, messageType);
      ExtensionDebug.success('NPC', `Sent S_NPC_GAMES for NPC ${npcId}`);
      return true;
    }

    server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: command ?? 0 }, messageType);
    return true;
  }

  // Animals
  static handleBuyAnimal(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const animalData = params?.[P.COMMANDS?.V_ANIMAL_DATA] ?? {};
    const animalType = animalData?.type ?? 'unknown';
    
    ExtensionDebug.ui('BUY_ANIMAL', `User purchasing animal (type: ${animalType})`);
    ExtensionDebug.log('info', 'ANIMAL', `Buy animal - Type: ${animalType}, User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'ANIMAL', `Purchasing animal`, { animalType, user: userName });
    
    // EXACT AS CLIENT EXPECTS: S_BUY_ANIMAL="277" with V_ANIMAL_DATA
    // From Main.as line 5861-5866: setMyAnimal(), uiLayer.substructGold(), FacebookEventDispatcher.adoptAnimal()
    server.sendExtensionResponse(
      socket,
      {
        "21": "277", // V_COMMAND: S_BUY_ANIMAL
        "285": animalData // V_ANIMAL_DATA = "285"
      },
      messageType
    );
    ExtensionDebug.success('ANIMAL', `Animal purchase completed`);
    return true;
  }

  static handleBuyAnimalFood(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const foodId = params?.[P.COMMANDS?.V_ANIMAL_FOOD] ?? 0;
    
    ExtensionDebug.ui('BUY_ANIMAL_FOOD', `User buying animal food (ID: ${foodId})`);
    ExtensionDebug.log('info', 'ANIMAL', `Buy animal food - Food ID: ${foodId}, User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'ANIMAL', `Buying animal food`, { foodId, user: userName });
    
    // Build V_ANIMAL_FOOD object so AS3 can deduct price: { ANIMALFOOD.ID, ANIMALFOOD.PRICE }
    const animalFood = (() => {
      try {
        return GameData.getAnimalFood(Number(foodId));
      } catch (e) {
        const idn = Number(foodId) || 0;
        const price = 10 + (idn % 5) * 5;
        return { "0": idn, "1": price };
      }
    })();

    // EXACT AS CLIENT EXPECTS: include V_ANIMAL_FOOD payload
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_BUY_ANIMAL_FOOD,
        [P.COMMANDS?.V_ANIMAL_FOOD]: animalFood,
      },
      messageType
    );
    ExtensionDebug.success('ANIMAL', `Animal food purchase completed`);
    return true;
  }

  static handleCleanAnimal(socket, _params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    
    ExtensionDebug.ui('CLEAN_ANIMAL', `User cleaning their animal`);
    ExtensionDebug.log('info', 'ANIMAL', `Clean animal - User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'ANIMAL', `Cleaning animal`, { user: userName });
    
    // Provide V_GAME_ID so the client can start the cleaning mini-game
    const gameId = 1; // minimal default; can be mapped to a concrete animal-cleaning game ID

    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CLEAN_ANIMAL,
        [P.COMMANDS?.V_GAME_ID]: gameId,
      },
      messageType
    );
    ExtensionDebug.success('ANIMAL', `Animal cleaned successfully`);
    return true;
  }

  static handleAnimalEmoticon(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const emoticon = params?.[P.COMMANDS?.V_ANIMAL_EMOTICON] ?? 0;
    
    ExtensionDebug.ui('ANIMAL_EMOTICON', `Animal showing emoticon (ID: ${emoticon})`);
    ExtensionDebug.log('info', 'ANIMAL', `Animal emoticon - Emoticon ID: ${emoticon}, User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'ANIMAL', `Animal emoticon`, { emoticonId: emoticon, user: userName });
    
    // EXACT AS CLIENT EXPECTS: S_ANIMAL_ACTION="283" with V_ANIMAL_EMOTICON
    // From Main.as line 5858-5860: room.playerAnimalAction(uid, emoticon, animationId)
    server.sendExtensionResponse(
      socket,
      {
        "21": "283", // V_COMMAND: S_ANIMAL_ACTION = "283"
        "286": emoticon, // V_ANIMAL_EMOTICON = "286"
        "25": socket?.sfsUser?.id ?? 0, // V_SFS_UID = "25"
        "288": 0 // V_ANIMATION_ID = "288"
      },
      messageType
    );
    ExtensionDebug.success('ANIMAL', `Animal emoticon displayed`);
    return true;
  }

  static handleAnimalGamePlayed(
    _socket,
    _params,
    _messageType,
    _server,
    _PROTOCOL,
  ) {
    // No response required
    return true;
  }

  static handleGetAnimalStore(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const storeId = params?.[P.COMMANDS?.V_STORE_ID] ?? 0;

    ExtensionDebug.ui('ANIMAL_STORE', `User opened animal store (ID: ${storeId})`);
    ExtensionDebug.log('info', 'ANIMAL', `Get animal store - Store ID: ${storeId}, User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'ANIMAL', `Opening animal store`, { storeId, user: userName });

    // Build payload exactly as AnimalStoreData.as expects:
    // V_STORE_DATA must contain ANIMALSTORE.ANIMALS array with each animal shaped per ANIMALS.* keys
    const A = (P && P.ANIMALS) ? P.ANIMALS : {
      ID: "0", TYPE_LEVEL: "1", MAX_AGE: "2", PRICE: "3", QUIZ_ID: "4",
      FOOD_GROUP: "5", CLEAN_PRICE: "6", ITEM: "7", PLAYER_LEVEL: "8", PIONEER_POINTS: "9"
    };
    const AFG = (P && P.ANIMALFOODGROUP) ? P.ANIMALFOODGROUP : { ID: "0", ITEMS: "1" };
    const AF = (P && P.ANIMALFOOD) ? P.ANIMALFOOD : { ID: "0", PRICE: "1" };
    const AS = (P && P.ANIMALSTORE) ? P.ANIMALSTORE : { ID: "0", ANIMALS: "1" };
    const IC = (P && P.ITEM) ? P.ITEM : { ID: "0" };

    // Derive a deterministic set of animal entries using GameData as source for item ids and food lists
    const itemCandidates = (() => {
      try { return GameData.getAnimalStoreItems(storeId) || []; } catch (_) { return []; }
    })();

    const foodsList = (() => {
      try { return GameData.getAnimalFoodItems(storeId) || []; } catch (_) { return []; }
    })();

    const animals = [];
    const count = Math.max(3, Math.min(12, itemCandidates.length || 6));
    for (let i = 0; i < count; i++) {
      const src = itemCandidates[i] || {};
      const itemId = src[IC.ID] ?? src["0"] ?? (Number(storeId) * 2000 + 500 + i);

      const fg = {};
      fg[AFG.ID] = Number(storeId) || 0;
      // Ensure each element in food items has ANIMALFOOD.ID/PRICE keys
      fg[AFG.ITEMS] = Array.isArray(foodsList) ? foodsList.map((f, idx) => {
        const obj = {};
        obj[AF.ID] = f[AF.ID] ?? f["0"] ?? (Number(storeId) * 10 + idx + 1);
        obj[AF.PRICE] = f[AF.PRICE] ?? f["1"] ?? (10 + ((idx + Number(storeId)) % 5) * 5);
        return obj;
      }) : [];

      const animal = {};
      animal[A.ID] = Number(itemId);
      animal[A.TYPE_LEVEL] = 100 + (i % 3); // arbitrary stable mapping
      animal[A.MAX_AGE] = 100;
      animal[A.PRICE] = 150 + i * 25; // stable, increasing price
      animal[A.QUIZ_ID] = 0;
      animal[A.FOOD_GROUP] = fg;
      animal[A.CLEAN_PRICE] = 5;
      const itemObj = {}; itemObj[IC.ID] = Number(itemId); animal[A.ITEM] = itemObj;
      animal[A.PLAYER_LEVEL] = 1;
      animal[A.PIONEER_POINTS] = 0;

      animals.push(animal);
    }

    const storePayload = {};
    storePayload[AS.ID] = Number(storeId);
    storePayload[AS.ANIMALS] = animals;

    server.sendExtensionResponse(
      socket,
      {
        // COMMANDS.V_COMMAND is "21" in numeric form
        "21": "284", // S_GET_AMNIMAL_STORE_DATA
        "230": Number(storeId), // V_STORE_ID
        "229": storePayload,    // V_STORE_DATA
      },
      messageType,
    );
    ExtensionDebug.success('ANIMAL', `Animal store data sent`);
    return true;
  }

  // Security 72-75
  static handleSecurityNewForm(socket, _params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    
    ExtensionDebug.ui('SECURITY_FORM', `User requesting new security form`);
    ExtensionDebug.log('info', 'SECURITY', `Get security form - User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'SECURITY', `Loading security form`, { user: userName });
    
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GET_SECURITY_FORM_DATA,
        [P.COMMANDS?.V_SECURITY_FORM_Q_DATA]: [],
        [P.COMMANDS?.V_SECURITY_FORM_A_DATA]: [],
      },
      messageType,
    );
    ExtensionDebug.success('SECURITY', `Security form sent`);
    return true;
  }

  static handleSecurityCheckData(
    socket,
    _params,
    messageType,
    server,
    PROTOCOL,
  ) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GET_SECURITY_FORM_CHECK_DATA,
        [P.COMMANDS?.V_SECURITY_FORM_Q_DATA]: [],
      },
      messageType,
    );
    return true;
  }

  static handleSecurityFillForm(
    socket,
    _params,
    messageType,
    server,
    PROTOCOL,
  ) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    
    ExtensionDebug.ui('SECURITY_FILL', `User filling security form`);
    ExtensionDebug.log('info', 'SECURITY', `Fill security form - User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'SECURITY', `Submitting security form`, { user: userName });
    
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_SECURITY_FROM_FILL_DATA_SUCCESS,
      },
      messageType,
    );
    ExtensionDebug.success('SECURITY', `Security form filled successfully`);
    return true;
  }

  static handleSecurityCheckVerify(
    socket,
    _params,
    messageType,
    server,
    PROTOCOL,
  ) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_SECURITY_FORM_CHECK_DATA_SUCCESS,
      },
      messageType,
    );
    return true;
  }

  // Cards/Albums
  static handleAddAlbum(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const albumCode = params?.[P.COMMANDS?.V_ALBUM_CODE] ?? null;
    
    ExtensionDebug.ui('ADD_ALBUM', `User adding album (Code: ${albumCode})`);
    ExtensionDebug.log('info', 'CARD', `Add album - Album code: ${albumCode}, User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'CARD', `Adding album`, { albumCode, user: userName });
    
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_ADD_PLAYER_CARD_ALBUM,
        [P.COMMANDS?.V_ALBUM_CODE]: albumCode,
        // Main.as expects these arrays on success
        [P.COMMANDS?.V_PLAYER_ALBUMS]: [],
        [P.COMMANDS?.V_CARD_PACK_WAITING_ITEMS]: [],
      },
      messageType,
    );
    ExtensionDebug.success('CARD', `Album added successfully`);
    return true;
  }

  static handleAddCardPack(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const packCode = params?.[P.COMMANDS?.V_CARD_PACK_CODE] ?? null;
    
    ExtensionDebug.ui('ADD_CARD_PACK', `User opening card pack (Code: ${packCode})`);
    ExtensionDebug.log('info', 'CARD', `Add card pack - Pack code: ${packCode}, User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'CARD', `Opening card pack`, { packCode, user: userName });
    
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_ADD_PLAYER_CARD_PACK,
        [P.COMMANDS?.V_CARD_PACK_CODE]: packCode,
      },
      messageType,
    );
    ExtensionDebug.success('CARD', `Card pack opened successfully`);
    return true;
  }

  static handleCardData(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const hasPack =
      params?.[P.COMMANDS?.V_CARD_PACK] != null ||
      params?.[P.COMMANDS?.V_CARD_PACK_CODE] != null;
    if (hasPack) {
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CARD_PACK_DATA,
          [P.COMMANDS?.V_CARDS]: [], // client loops on this
          // optional product info can be omitted to avoid unintended side-effects
        },
        messageType,
      );
    } else {
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CARD_DATA,
          [P.COMMANDS?.V_CARD]: params?.[P.COMMANDS?.V_CARD] ?? null,
        },
        messageType,
      );
    }
    return true;
  }

  static handleLockCard(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const card = params?.[P.COMMANDS?.V_CARD] ?? null;
    const cardId = card?.id ?? 'unknown';
    
    ExtensionDebug.ui('LOCK_CARD', `User locking card (ID: ${cardId})`);
    ExtensionDebug.log('info', 'CARD', `Lock card - Card ID: ${cardId}, User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'CARD', `Locking card`, { cardId, user: userName });
    
    // EXACT AS CLIENT EXPECTS: S_CARD_LOCKED="458" with V_ALBUM_ID and V_CARD
    // From Main.as line 6072-6075: uiLayer.cardLocked() and InventoriesManager.lockCard()
    const albumId = params?.[P.COMMANDS?.V_ALBUM_ID || "446"] ?? 0;
    server.sendExtensionResponse(
      socket,
      {
        "21": "458", // V_COMMAND: S_CARD_LOCKED = "458"
        "446": albumId, // V_ALBUM_ID = "446"
        "438": card // V_CARD = "438"
      },
      messageType
    );
    ExtensionDebug.success('CARD', `Card locked successfully`);
    return true;
  }

  static handleBuyCreditsStoreProductInstance(
    socket,
    _params,
    messageType,
    server,
    PROTOCOL,
  ) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CREDITS_STORE_DATA,
        [P.COMMANDS?.V_CREDITS_STORE_PRODUCTS_LEFT]: [],
        [P.COMMANDS?.V_CREDITS_STORE_DISCOUNTS]: [],
        [P.COMMANDS?.V_CREDITS_STORE_PRODUCTS]: [],
        [P.COMMANDS?.V_CREDITS_STORE_CREDITS]:
          socket?.sfsUser?.playerData?.credits_store_credits ?? 0,
      },
      messageType,
    );
    return true;
  }

  static handlePotionStore(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const storeId = params?.[P.COMMANDS?.V_STORE_ID] ?? 1;

    ExtensionDebug.ui('POTION_STORE', `User opened potion store (ID: ${storeId})`);
    ExtensionDebug.log('info', 'POTION', `Potion store accessed - Store ID: ${storeId}, User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'POTION', `Opening potion store ${storeId}`, { storeId, user: userName });

    const storeData = GameData.getPotionStore(storeId);

    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GET_POTION_STORE_DATA,
        [P.COMMANDS?.V_STORE_ID]: storeId,
        [P.COMMANDS?.V_STORE_DATA]: storeData,
      },
      messageType,
    );
    ExtensionDebug.success('POTION', `Potion store ${storeId} data sent`);
    return true;
  }
  // Helper, Recycling, Days, Audit
  static handleHelperFlow(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const ordinal = params?.[P.COMMANDS?.V_ORDINAL] ?? null;
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_REMOVE_HELPER_STEP,
        [P.COMMANDS?.V_STAGE_ID]: ordinal,
      },
      messageType,
    );
    return true;
  }

  static handleRecyclingCollectionTarget(
    socket,
    _params,
    messageType,
    server,
    PROTOCOL,
  ) {
    const P = this._P(server, PROTOCOL);
    server.sendExtensionResponse(
      socket,
      { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_COMMUNITY_RECYCLE_ITEM_OK },
      messageType,
    );
    return true;
  }

  static handleDaysPlayedRewardCompleted(
    socket,
    params,
    messageType,
    server,
    PROTOCOL,
  ) {
    const P = this._P(server, PROTOCOL);
    const rewardId = params?.[P.COMMANDS?.V_REWARD_ID] ?? null;
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_DAYS_PLAYED_REWARD_REDEEMED,
        [P.COMMANDS?.V_REWARD_ID]: rewardId,
      },
      messageType,
    );
    return true;
  }

  static handleHelperAudit(socket, _params, messageType, server, _PROTOCOL) {
    // Client does not expect a payload for audit events; avoid sending generic OK
    return true;
  }

  // OneOnOne passthrough
  static tryOneOnOnePassthrough(
    socket,
    params,
    messageType,
    server,
    _PROTOCOL,
  ) {
    try {
      if (!params || typeof params !== "object") return false;
      const keys = Object.keys(params);
      let inner = null;

      // Check nested PARAMS objects that contain "0"/"COMMAND"
      for (const k of keys) {
        const v = params[k];
        if (
          v &&
          typeof v === "object" &&
          (Object.prototype.hasOwnProperty.call(v, "0") ||
            Object.prototype.hasOwnProperty.call(v, "COMMAND"))
        ) {
          inner = v;
          break;
        }
      }

      // Or the params themselves
      if (
        !inner &&
        (Object.prototype.hasOwnProperty.call(params, "0") ||
          Object.prototype.hasOwnProperty.call(params, "COMMAND"))
      ) {
        inner = params;
      }

      if (inner) {
        server.sendExtensionResponse(socket, inner, messageType);
        return true;
      }
    } catch (e) {
      // ignore and fallback
    }
    return false;
  }

  // GameExtension (9)
  static handleGameExtension(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const cmd = params?.[P.COMMANDS?.V_COMMAND] ?? params?.command ?? null;
    
    ExtensionDebug.block('GAME', `Processing game operation`, () => {
      ExtensionDebug.ui('GAME_INTERACTION', `User interacting with game (start/exit/play)`);
      ExtensionDebug.log('info', 'GAME', `Game command: ${cmd}, User: ${userName}`);
    });

    switch (cmd) {
      case P.COMMANDS?.C_GAME_ENTER:
      case P.COMMANDS?.C_GAME_START: {
        const gameId = params?.[P.COMMANDS?.V_GAME_ID] ?? null;
        const level = params?.[P.COMMANDS?.V_GAME_LEVEL] ?? 1;
        ExtensionDebug.ui('GAME_START', `User starting game ${gameId} at level ${level}`);
        ExtensionDebug.flashDebug(socket, 'GAME', `Starting game ${gameId}`, { gameId, level, user: userName });
        
        // Generate a game token as expected by AS client
        const token = `t_${gameId || 0}_${Date.now()}`;
        if (socket) socket._gameToken = token;

        const startResponse = {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GAME_START,
          [P.COMMANDS?.V_GAME_ID]: gameId,
          [P.COMMANDS?.V_GAME_LEVEL]: level,
          [P.COMMANDS?.V_GAME_TOKEN]: token,
        };
        ExtensionDebug.net('out', messageType, startResponse);
        server.sendExtensionResponse(socket, startResponse, messageType);
        ExtensionDebug.success('GAME', `Game ${gameId} started successfully`);
        return true;
      }

      case P.COMMANDS?.C_GAME_EXIT:
      case P.COMMANDS?.C_GAME_OVER: {
        const gameId = params?.[P.COMMANDS?.V_GAME_ID] ?? null;
        const score = params?.[P.COMMANDS?.V_GAME_SCORE] ?? 0;
        // derive minimal rewards to keep flows
        const activity = Math.max(0, Math.min(10, Math.floor(score / 10)));
        const rewardItem = 0;
        const rewardGold = Math.max(0, Math.floor(score / 20));
        const rewardLeadership = 0;
        // add small gold reward to server-side state as well
        this._addGold(socket, rewardGold);
        
        ExtensionDebug.ui('GAME_OVER', `User finished game ${gameId} with score ${score}`);
        ExtensionDebug.log('info', 'GAME', `Game ${gameId} completed - Score: ${score}, Activity: ${activity}, Gold: ${rewardGold}, RewardItem: ${rewardItem}`);
        ExtensionDebug.flashDebug(socket, 'GAME', `Game ${gameId} completed`, { gameId, score, activity, rewardGold, rewardItem, user: userName });
        
        // Primary game-over payload
        const gameOverResponse = {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GAME_OVER_DATA,
          [P.COMMANDS?.V_GAME_ID]: gameId,
          [P.COMMANDS?.V_GAME_SCORE]: score,
          [P.COMMANDS?.V_REWARD_ACTIVITY_POINTS]: activity,
          [P.COMMANDS?.V_REWARD_ITEM]: rewardItem,
          [P.COMMANDS?.V_REWARD_GOLD]: rewardGold,
          [P.COMMANDS?.V_REWARD_LEADERSHIP]: rewardLeadership,
          [P.COMMANDS?.V_GAME_LEVEL]: 1,
          [P.COMMANDS?.V_LEVEL_UP]: 0,
          [P.COMMANDS?.V_REWARD_CREDITS]: 0,
          [P.COMMANDS?.V_REWARD_RECYCLE_ITEM]: null,
          [P.COMMANDS?.V_REWARD_RECYCLE_ITEM_QUANTITY]: 0,
          [P.COMMANDS?.V_REWARD_POTION]: null,
          [P.COMMANDS?.V_REWARD_POTION_QUANTITY]: 0,
        };
        ExtensionDebug.net('out', messageType, gameOverResponse);
        server.sendExtensionResponse(socket, gameOverResponse, messageType);

        // Also emit a reward update packet which the AS client certainly handles
        const rewardUpdateResponse = {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GAME_REWARD_UPDATE,
          [P.COMMANDS?.V_GAME_ID]: gameId,
          [P.COMMANDS?.V_GAME_SCORE]: score,
          [P.COMMANDS?.V_REWARD_ACTIVITY_POINTS]: activity,
          [P.COMMANDS?.V_REWARD_ITEM]: rewardItem,
          [P.COMMANDS?.V_REWARD_GOLD]: rewardGold,
          [P.COMMANDS?.V_REWARD_LEADERSHIP]: rewardLeadership,
          [P.COMMANDS?.V_GAME_LEVEL]: 1,
          [P.COMMANDS?.V_LEVEL_UP]: 0,
          [P.COMMANDS?.V_REWARD_CREDITS]: 0,
          [P.COMMANDS?.V_REWARD_RECYCLE_ITEM]: null,
          [P.COMMANDS?.V_REWARD_RECYCLE_ITEM_QUANTITY]: 0,
          [P.COMMANDS?.V_REWARD_POTION]: null,
          [P.COMMANDS?.V_REWARD_POTION_QUANTITY]: 0,
        };
        ExtensionDebug.net('out', messageType, rewardUpdateResponse);
        server.sendExtensionResponse(socket, rewardUpdateResponse, messageType);

        ExtensionDebug.success('GAME', `Game ${gameId} completion processed`);
        return true;
      }

      default:
        // Generic start to keep the flow going
        server.sendExtensionResponse(
          socket,
          { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GAME_START },
          messageType,
        );
        return true;
    }
  }

  // Quest Controller (5)
  static handleQuestController(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const command = params?.[P.COMMANDS?.V_COMMAND] ?? params?.command ?? null;

    if (command === P.COMMANDS?.C_QUEST_STAGE_ACCEPTED) {
      // Acknowledge acceptance; client already has quest data cached
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_QUEST_STAGES_UPDATE,
          [P.COMMANDS?.V_QUESTS_TASKS]: [],
        },
        messageType,
      );
      return true;
    }

    if (command === P.COMMANDS?.C_QUEST_STAGE_FINISHED) {
      // Minimal reward on stage finish to keep UI flows; send proper reward structure
      const rewardGold = 5;
      this._addGold(socket, rewardGold);
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_QUEST_STAGE_FINISHED,
          [P.COMMANDS?.V_QUESTS_TASKS]: [],
        },
        messageType,
      );
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_QUEST_REWARD_UPDATE,
          [P.COMMANDS?.V_REWARD_ACTIVITY_POINTS]: 0,
          [P.COMMANDS?.V_REWARD_GOLD]: rewardGold,
          [P.COMMANDS?.V_REWARD_ITEM]: null,
          [P.COMMANDS?.V_REWARD_CARD]: null,
          [P.COMMANDS?.V_LEVEL_UP]: 0,
          [P.COMMANDS?.V_GAME_SCORE]: 0,
          [P.COMMANDS?.V_GAME_LEVEL]: 1,
          [P.COMMANDS?.V_REWARD_CREDITS]: 0,
          [P.COMMANDS?.V_REWARD_RECYCLE_ITEM]: null,
          [P.COMMANDS?.V_REWARD_RECYCLE_ITEM_QUANTITY]: 0,
          [P.COMMANDS?.V_REWARD_POTION]: null,
          [P.COMMANDS?.V_REWARD_POTION_QUANTITY]: 0,
          [P.COMMANDS?.V_REWARD_LEADERSHIP]: 0,
        },
        messageType,
      );
      return true;
    }

    // Default benign update for other quest-related ops
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_QUEST_STAGES_UPDATE,
        [P.COMMANDS?.V_QUESTS_TASKS]: [],
      },
      messageType,
    );
    return true;
  }

  // Messaging (7) - Poke/Request Chat
  static handleMessaging(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const cmd = params?.[P.COMMANDS?.V_COMMAND] ?? params?.command ?? null;

    if (cmd === P.COMMANDS?.C_POKE_USER) {
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_POKE_ACK,
          [P.COMMANDS?.V_REQUEST_ID]: params?.[P.COMMANDS?.V_REQUEST_ID] ?? null,
        },
        messageType,
      );
      return true;
    }

    if (cmd === P.COMMANDS?.C_REQUEST_CHAT) {
      // Minimal 2-step: request ack + open
      server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CHAT_REQUEST, [P.COMMANDS?.V_REQUEST_ID]: params?.[P.COMMANDS?.V_REQUEST_ID] ?? null }, messageType);
      server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CHAT_OPEN, [P.COMMANDS?.V_REQUEST_ID]: params?.[P.COMMANDS?.V_REQUEST_ID] ?? null }, messageType);
      return true;
    }

    if (cmd === P.COMMANDS?.C_ACCEPT_CHAT) {
      server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CHAT_OPEN, [P.COMMANDS?.V_REQUEST_ID]: params?.[P.COMMANDS?.V_REQUEST_ID] ?? null }, messageType);
      return true;
    }
    if (cmd === P.COMMANDS?.C_REJECT_CHAT) {
      server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CHAT_REJECT, [P.COMMANDS?.V_REQUEST_ID]: params?.[P.COMMANDS?.V_REQUEST_ID] ?? null }, messageType);
      return true;
    }
    if (cmd === P.COMMANDS?.C_CANCEL_CHAT) {
      server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CHAT_CANCEL, [P.COMMANDS?.V_REQUEST_ID]: params?.[P.COMMANDS?.V_REQUEST_ID] ?? null }, messageType);
      return true;
    }

    // No generic OK fallback here
    return true;
  }

  // Tutorial (22)
  static handleTutorial(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const tutorialId = params?.[P.COMMANDS?.V_TUTORIAL_ID] ?? null;
    
    ExtensionDebug.ui('TUTORIAL', `User ${userName} completed tutorial ${tutorialId}`);
    ExtensionDebug.log('info', 'TUTORIAL', `Tutorial audit - ID: ${tutorialId}, User: ${userName}`);
    ExtensionDebug.flashDebug(socket, 'TUTORIAL', `Tutorial ${tutorialId} completed`, { tutorialId, user: userName });
    
    // According to AS: When tutorial completes, server responds with S_TUTORIAL_OVER_GOLD_LEFT
    // This resets/confirms the gold amount after tutorial
    const currentGold = socket?.sfsUser?.playerData?.gold ?? 0;
    
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TUTORIAL_OVER_GOLD_LEFT,
        [P.COMMANDS?.V_GOLD]: currentGold,
        [P.COMMANDS?.V_TUTORIAL_ID]: tutorialId,
      },
      messageType,
    );
    ExtensionDebug.success('TUTORIAL', `Tutorial ${tutorialId} completed for ${userName}`);
    return true;
  }

  // Logout (21)
  static handleLogout(socket, _params, messageType, server, _PROTOCOL) {
    ExtensionDebug.ui('LOGOUT', `User requested logout`);
    // No extension payload expected by client here; avoid sending generic OK
    return true;
  }

  // Store (12)
  static handleStore(socket, params, messageType, server, PROTOCOL) {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const cmd = params?.[P.COMMANDS?.V_COMMAND] ?? params?.command ?? null;
    const storeId = params?.[P.COMMANDS?.V_STORE_ID] ?? 0;
    
    const storeTimer = `store_${userName}_${cmd}_${Date.now()}`;
    ExtensionDebug.startTimer(storeTimer, `Store operation ${cmd} for ${userName}`);
    
    ExtensionDebug.block('STORE', `Processing store operation`, () => {
      ExtensionDebug.ui('STORE_INTERACTION', `User interacting with store (buy/sell/browse)`);
      ExtensionDebug.log('info', 'STORE', `Command: ${cmd}, Store ID: ${storeId}, User: ${userName}`);
    });
    
    ExtensionDebug.flashDebug(socket, 'STORE', `Store operation: ${cmd}`, { storeId, command: cmd, user: userName });

    if (cmd === P.COMMANDS?.C_GET_STORE_DATA || cmd == null) {
      const storePayload = GameData.getStore(storeId);
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GET_STORE_DATA,
          [P.COMMANDS?.V_STORE_ID]: storeId,
          [P.COMMANDS?.V_STORE_DATA]: storePayload,
        },
        messageType,
      );
      ExtensionDebug.endTimer(storeTimer);
      ExtensionDebug.success('STORE', `Store get data completed`);
      return true;
    }

    if (cmd === P.COMMANDS?.C_BUY_ITEM) {
      const itemId = params?.[P.COMMANDS?.V_ITEM_ID] ?? null;
      const fallbackItem = GameData.getItem(itemId);
      const derivedPrice = Number(fallbackItem?.['9'] || 0); // ITEM.PRICE
      const price = Number(params?.[P.COMMANDS?.V_PRICE] ?? derivedPrice) || 0;
      if (price > 0 && !GameData.canAfford(socket, price)) {
        server.sendExtensionResponse(
          socket,
          {
            [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_BUY_ITEM_DENY,
            [P.COMMANDS?.V_STORE_ID]: storeId,
            [P.COMMANDS?.V_ITEM_ID]: itemId,
            // Client expects amount to subtract when deny UI shows; send current gold for info is acceptable
            [P.COMMANDS?.V_GOLD]: this._ensurePlayerData(socket)?.gold ?? 0,
          },
          messageType,
        );
        ExtensionDebug.endTimer(storeTimer);
        ExtensionDebug.warn('STORE', `Not enough gold to buy item ${itemId}`);
        return true;
      }
      if (price > 0) GameData.spendGold(socket, price);
      GameData.giveItem(socket, itemId, price);
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_BUY_ITEM,
          [P.COMMANDS?.V_STORE_ID]: storeId,
          [P.COMMANDS?.V_ITEM_ID]: itemId,
          // Client subtracts this amount: uiLayer.addGold(-V_GOLD)
          [P.COMMANDS?.V_GOLD]: price,
          // Explicitly include days left for non-expiring items
          [P.COMMANDS?.V_DAYS_LEFT]: -1,
        },
        messageType,
      );
      ExtensionDebug.endTimer(storeTimer);
      ExtensionDebug.success('STORE', `Store buy item completed`);
      return true;
    }

    if (cmd === P.COMMANDS?.C_SELL_ITEM) {
      const itemId = params?.[P.COMMANDS?.V_ITEM_ID] ?? null;
      const slotId = params?.[P.COMMANDS?.V_SLOT_ID] ?? null;
      const fallbackItem = GameData.getItem(itemId);
      const derivedSell = Number(fallbackItem?.['10'] || 0); // ITEM.SELL_PRICE
      const price = Number(params?.[P.COMMANDS?.V_PRICE] ?? derivedSell) || 0;
      const removed = GameData.removeItem(socket, itemId);
      const itemObj = { [P.ITEM?.ID || '0']: itemId };
      if (!removed) {
        ExtensionDebug.warn('STORE', `Tried to sell missing item ${itemId} - acknowledging sell to satisfy client UI`);
        server.sendExtensionResponse(
          socket,
          {
            [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_SELL_ITEM,
            [P.COMMANDS?.V_STORE_ID]: storeId,
            [P.COMMANDS?.V_ITEM_ID]: itemId,
            [P.COMMANDS?.V_SLOT_ID]: slotId,
            [P.COMMANDS?.V_ITEM]: itemObj,
            // Client adds this amount to gold: uiLayer.addGold(V_GOLD)
            [P.COMMANDS?.V_GOLD]: price,
          },
          messageType,
        );
        ExtensionDebug.endTimer(storeTimer);
        return true;
      }
      if (price > 0) GameData.addGold(socket, price);
      server.sendExtensionResponse(
        socket,
        {
          [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_SELL_ITEM,
          [P.COMMANDS?.V_STORE_ID]: storeId,
          [P.COMMANDS?.V_ITEM_ID]: itemId,
          [P.COMMANDS?.V_SLOT_ID]: slotId,
          [P.COMMANDS?.V_ITEM]: itemObj,
          [P.COMMANDS?.V_GOLD]: price,
        },
        messageType,
      );
      ExtensionDebug.endTimer(storeTimer);
      ExtensionDebug.success('STORE', `Store sell item completed`);
      return true;
    }

    // Default: return store data
    const storePayload2 = GameData.getStore(storeId);
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GET_STORE_DATA,
        [P.COMMANDS?.V_STORE_ID]: storeId,
        [P.COMMANDS?.V_STORE_DATA]: storePayload2 || {
          id: storeId,
          items: [],
          itemCount: 0,
        },
      },
      messageType,
    );
    ExtensionDebug.endTimer(storeTimer);
    ExtensionDebug.success('STORE', `Store default case completed`);
    return true;
  }
};

// RecyclingGame (11)
ExtensionBypass.handleRecyclingGame = function (socket, params, messageType, server, PROTOCOL) {
  const P = ExtensionBypass._P(server, PROTOCOL);
  const cmd = params?.[P.COMMANDS?.V_COMMAND] ?? params?.command;
  const userName = socket?.sfsUser?.name ?? "unknown";
  const gameId = params?.[P.COMMANDS?.V_GAME_ID] ?? 0;
  
  ExtensionDebug.ui('RECYCLING_GAME', `User interacting with recycling game (Game ID: ${gameId})`);
  ExtensionDebug.log('info', 'GAME', `Recycling game - Command: ${cmd}, Game ID: ${gameId}, User: ${userName}`);
  
  if (cmd === P.COMMANDS?.C_RECYCLE_GAME_START || cmd === P.COMMANDS?.C_THROWING_GAME_START) {
    ExtensionDebug.flashDebug(socket, 'GAME', `Starting recycling game ${gameId}`, { gameId, user: userName });
    server.sendExtensionResponse(
      socket,
      { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_RECYCLE_GAME_START, [P.COMMANDS?.V_GAME_ID]: gameId },
      messageType,
    );
    ExtensionDebug.success('GAME', `Recycling game ${gameId} started`);
    return true;
  }
  if (cmd === P.COMMANDS?.C_RECYCLE_GAME_OVER || cmd === P.COMMANDS?.C_GAME_OVER) {
    const score = params?.[P.COMMANDS?.V_GAME_SCORE] ?? 0;
    ExtensionDebug.flashDebug(socket, 'GAME', `Recycling game ${gameId} completed`, { gameId, score, user: userName });
    server.sendExtensionResponse(
      socket,
      { 
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_RECYCLE_GAME_OVER,
        [P.COMMANDS?.V_GAME_ID]: gameId,
        [P.COMMANDS?.V_GAME_SCORE]: score
      },
      messageType,
    );
    ExtensionDebug.success('GAME', `Recycling game ${gameId} completed with score ${score}`);
    return true;
  }
  if (cmd === P.COMMANDS?.C_THROW_ITEM) {
    const px = params?.[P.COMMANDS?.V_PX] ?? 0;
    const py = params?.[P.COMMANDS?.V_PY] ?? 0;
    const hit = params?.[P.COMMANDS?.V_HIT] ?? 0;
    ExtensionDebug.log('debug', 'GAME', `Throw item - PX: ${px}, PY: ${py}, Hit: ${hit}`);
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_THROW_ITEM,
        [P.COMMANDS?.V_PX]: px,
        [P.COMMANDS?.V_PY]: py,
        [P.COMMANDS?.V_HIT]: hit
      },
      messageType,
    );
    return true;
  }
// No generic OK; default path unused
  return true;
};

// Add trade transaction minimal handlers
ExtensionBypass.handleTradeTxClearSlot = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  const slotId = Number(params?.[P.COMMANDS?.V_SLOT_ID] ?? 0);
  const txId = params?.[P.COMMANDS?.V_TRADE_TRANSACTION_ID] ?? 0;
  const userId = socket?.sfsUser?.id ?? 0;
  // free mapping
  if (socket?._trade && socket._trade.slotToInv) {
    const inv = socket._trade.slotToInv[slotId];
    if (inv != null) {
      delete socket._trade.invToSlot[inv];
    }
    delete socket._trade.slotToInv[slotId];
  }
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TRADE_TX_CLEAR_SLOT,
      [P.COMMANDS?.V_SLOT_ID]: slotId,
      [P.COMMANDS?.V_TRADE_TRANSACTION_ID]: txId,
      [P.COMMANDS?.V_SFS_UID]: userId,
    },
    messageType,
  );
  return true;
};

ExtensionBypass.handleTradeTxComplete = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  // ack complete regardless of lock state to keep client flow
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TRADE_TX_COMPLETE,
      [P.COMMANDS?.V_TRADE_TRANSACTION_ID]: params?.[P.COMMANDS?.V_TRADE_TRANSACTION_ID] ?? 0,
    },
    messageType,
  );
  return true;
};

ExtensionBypass.handleTradeTxPutInventoryItem = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  const txId = params?.[P.COMMANDS?.V_TRADE_TRANSACTION_ID] ?? 0;
  const invSlot = Number(params?.[P.COMMANDS?.V_SLOT_ID] ?? 0);
  const userId = socket?.sfsUser?.id ?? 0;
  // initialize trade state if missing
  socket._trade = socket._trade || { id: txId, locked: false, nextSlot: 0, invToSlot: {}, slotToInv: {} };
  const state = socket._trade;
  // allocate a trade slot (0..8)
  let slotIndex = state.invToSlot[invSlot];
  if (slotIndex == null) {
    // find first free
    const used = new Set(Object.values(state.invToSlot));
    slotIndex = 0;
    while (used.has(slotIndex) && slotIndex < 9) slotIndex++;
    if (slotIndex >= 9) slotIndex = 0; // fallback overwrite first slot
    state.invToSlot[invSlot] = slotIndex;
    state.slotToInv[slotIndex] = invSlot;
  }
  const itemId = socket?._invSlots?.[invSlot] ?? 0;
  const TRADESLOT = { ID: "0", TYPE: "1", INVENTORY_SLOT_ID: "2", ITEM_ID: "3", RECYCLE_ITEM_ID: "4", COUNT: "5", NO_LIMITS: "6", PIONEERS: "7", DAYS_LEFT: "8", CARD_ORDINAL: "9", CARD_ALBUM: "10" };
  const tradeSlotObj = {};
  tradeSlotObj[TRADESLOT.ID] = slotIndex;
  tradeSlotObj[TRADESLOT.TYPE] = "1"; // ITEM
  tradeSlotObj[TRADESLOT.INVENTORY_SLOT_ID] = invSlot;
  tradeSlotObj[TRADESLOT.ITEM_ID] = itemId;
  tradeSlotObj[TRADESLOT.NO_LIMITS] = 0;
  tradeSlotObj[TRADESLOT.PIONEERS] = 0;
  tradeSlotObj[TRADESLOT.DAYS_LEFT] = -1;
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TRADE_TX_SLOT_DATA,
      [P.COMMANDS?.V_TRADE_TRANSACTION_ID]: txId,
      [P.COMMANDS?.V_TRADE_SLOT]: tradeSlotObj,
      [P.COMMANDS?.V_SFS_UID]: userId,
    },
    messageType,
  );
  return true;
};

ExtensionBypass.handleTradeTxPutRecycleItem = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  const txId = params?.[P.COMMANDS?.V_TRADE_TRANSACTION_ID] ?? 0;
  const recycleItemId = Number(params?.[P.COMMANDS?.V_ITEM_ID] ?? 0);
  const count = Number(params?.[P.COMMANDS?.V_COUNT] ?? 1);
  const userId = socket?.sfsUser?.id ?? 0;
  socket._trade = socket._trade || { id: txId, locked: false, nextSlot: 0, invToSlot: {}, slotToInv: {} };
  const state = socket._trade;
  // allocate next free slot
  const used = new Set(Object.keys(state.slotToInv).map((k)=>Number(k)));
  let slotIndex = 0;
  while (used.has(slotIndex) && slotIndex < 9) slotIndex++;
  if (slotIndex >= 9) slotIndex = 0;
  state.slotToInv[slotIndex] = null;
  const TRADESLOT = { ID: "0", TYPE: "1", INVENTORY_SLOT_ID: "2", ITEM_ID: "3", RECYCLE_ITEM_ID: "4", COUNT: "5", NO_LIMITS: "6", PIONEERS: "7", DAYS_LEFT: "8", CARD_ORDINAL: "9", CARD_ALBUM: "10" };
  const tradeSlotObj = {};
  tradeSlotObj[TRADESLOT.ID] = slotIndex;
  tradeSlotObj[TRADESLOT.TYPE] = "2"; // RECYCLE_ITEM
  tradeSlotObj[TRADESLOT.RECYCLE_ITEM_ID] = recycleItemId;
  tradeSlotObj[TRADESLOT.COUNT] = count;
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TRADE_TX_SLOT_DATA,
      [P.COMMANDS?.V_TRADE_TRANSACTION_ID]: txId,
      [P.COMMANDS?.V_TRADE_SLOT]: tradeSlotObj,
      [P.COMMANDS?.V_SFS_UID]: userId,
    },
    messageType,
  );
  return true;
};

ExtensionBypass.handleTradeTxExit = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  const txId = params?.[P.COMMANDS?.V_TRADE_TRANSACTION_ID] ?? 0;
  // reset trade state
  if (socket) socket._trade = null;
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TRADE_TX_EXIT,
      [P.COMMANDS?.V_TRADE_TRANSACTION_ID]: txId,
    },
    messageType,
  );
  return true;
};

ExtensionBypass.handleTradeTxLock = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  if (socket._trade) socket._trade.locked = true;
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TRADE_TX_LOCK,
      [P.COMMANDS?.V_TRADE_TRANSACTION_ID]: params?.[P.COMMANDS?.V_TRADE_TRANSACTION_ID] ?? 0,
    },
    messageType,
  );
  return true;
};

ExtensionBypass.handleTradeTxPutCard = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  const txId = params?.[P.COMMANDS?.V_TRADE_TRANSACTION_ID] ?? 0;
  const album = Number(params?.["438"]?.["0"] ?? params?.["438"]?.album ?? params?.["0"] ?? params?.["CARD.ALBUM"] ?? params?.["CARD"]?.album ?? params?.["CARD_ALBUM"] ?? 0);
  const ordinal = Number(params?.["438"]?.["1"] ?? params?.["438"]?.ordinal ?? params?.["1"] ?? params?.["CARD.ORDINAL"] ?? params?.["CARD"]?.ordinal ?? params?.["CARD_ORDINAL"] ?? 0);
  const userId = socket?.sfsUser?.id ?? 0;
  socket._trade = socket._trade || { id: txId, locked: false, nextSlot: 0, invToSlot: {}, slotToInv: {} };
  const state = socket._trade;
  const used = new Set(Object.keys(state.slotToInv).map((k)=>Number(k)));
  let slotIndex = 0;
  while (used.has(slotIndex) && slotIndex < 9) slotIndex++;
  if (slotIndex >= 9) slotIndex = 0;
  state.slotToInv[slotIndex] = null;
  const TRADESLOT = { ID: "0", TYPE: "1", INVENTORY_SLOT_ID: "2", ITEM_ID: "3", RECYCLE_ITEM_ID: "4", COUNT: "5", NO_LIMITS: "6", PIONEERS: "7", DAYS_LEFT: "8", CARD_ORDINAL: "9", CARD_ALBUM: "10" };
  const tradeSlotObj = {};
  tradeSlotObj[TRADESLOT.ID] = slotIndex;
  tradeSlotObj[TRADESLOT.TYPE] = "3"; // CARD
  tradeSlotObj[TRADESLOT.CARD_ALBUM] = album;
  tradeSlotObj[TRADESLOT.CARD_ORDINAL] = ordinal;
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TRADE_TX_SLOT_DATA,
      [P.COMMANDS?.V_TRADE_TRANSACTION_ID]: txId,
      [P.COMMANDS?.V_TRADE_SLOT]: tradeSlotObj,
      [P.COMMANDS?.V_SFS_UID]: userId,
    },
    messageType,
  );
  return true;
};

// ThrowingGame (4)
ExtensionBypass.handleThrowingGame = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  const command = params?.[P.COMMANDS?.V_COMMAND] ?? params?.command;
  const userName = socket?.sfsUser?.name ?? "unknown";
  const gameId = params?.[P.COMMANDS?.V_GAME_ID] ?? 0;
  
  ExtensionDebug.ui('THROWING_GAME', `User interacting with throwing game (Game ID: ${gameId})`);
  ExtensionDebug.log('info', 'GAME', `Throwing game - Command: ${command}, Game ID: ${gameId}, User: ${userName}`);
  
  if (command === P.COMMANDS?.C_THROWING_GAME_START) {
    // Generate game token (timestamp-based unique token)
    const gameToken = Date.now() + Math.floor(Math.random() * 10000);
    
    ExtensionDebug.flashDebug(socket, 'GAME', `Starting throwing game ${gameId}`, { gameId, gameToken, user: userName });
    
    // According to AS, server responds with S_THROWING_GAME_START and sets gameToken
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_THROWING_GAME_START,
        [P.COMMANDS?.V_GAME_TOKEN]: gameToken,
        [P.COMMANDS?.V_GAME_ID]: gameId,
      },
      messageType,
    );
    ExtensionDebug.success('GAME', `Throwing game ${gameId} started with token ${gameToken}`);
    return true;
  }
  if (command === P.COMMANDS?.C_THROW_ITEM) {
    const px = params?.[P.COMMANDS?.V_PX] ?? 0;
    const py = params?.[P.COMMANDS?.V_PY] ?? 0;
    const topX = params?.[P.COMMANDS?.V_TOP_X] ?? 0;
    const topY = params?.[P.COMMANDS?.V_TOP_Y] ?? 0;
    const hit = params?.[P.COMMANDS?.V_HIT] ?? 0;
    const count = params?.[P.COMMANDS?.V_COUNT] ?? 0;
    const targetId = params?.[P.COMMANDS?.V_TARGET_ID] ?? 0;
    const gameToken = params?.[P.COMMANDS?.V_GAME_TOKEN] ?? 0;
    const playerId = socket?.sfsUser?.id ?? 0;
    
    ExtensionDebug.log('debug', 'GAME', `Throw item - PX: ${px}, PY: ${py}, Hit: ${hit}, Count: ${count}`);
    
    // According to AS, server responds with S_THROW_ITEM and includes gameToken for the player
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_THROW_ITEM,
        [P.COMMANDS?.V_PX]: px,
        [P.COMMANDS?.V_PY]: py,
        [P.COMMANDS?.V_TOP_X]: topX,
        [P.COMMANDS?.V_TOP_Y]: topY,
        [P.COMMANDS?.V_HIT]: hit,
        [P.COMMANDS?.V_COUNT]: count,
        [P.COMMANDS?.V_PLAYER_ID]: playerId,
        [P.COMMANDS?.V_TARGET_ID]: targetId,
        [P.COMMANDS?.V_GAME_TOKEN]: gameToken,
      },
      messageType,
    );
    return true;
  }
  if (command === P.COMMANDS?.C_THROW_GAME_TIMEOUT) {
    // On timeout, acknowledge throwing session end with a reward update packet
    const gameId = params?.[P.COMMANDS?.V_GAME_ID] ?? 0;
    const rewardUpdate = {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_THROWING_GAME_REWARD_UPDATE,
      [P.COMMANDS?.V_GAME_ID]: gameId,
      [P.COMMANDS?.V_GAME_SCORE]: params?.[P.COMMANDS?.V_GAME_SCORE] ?? 0,
      [P.COMMANDS?.V_REWARD_ACTIVITY_POINTS]: 0,
      [P.COMMANDS?.V_REWARD_ITEM]: 0,
      [P.COMMANDS?.V_REWARD_GOLD]: 0,
      [P.COMMANDS?.V_REWARD_LEADERSHIP]: 0,
      [P.COMMANDS?.V_GAME_LEVEL]: params?.[P.COMMANDS?.V_GAME_LEVEL] ?? 1,
      [P.COMMANDS?.V_LEVEL_UP]: 0,
      [P.COMMANDS?.V_REWARD_CREDITS]: 0,
    };
    server.sendExtensionResponse(socket, rewardUpdate, messageType);
    return true;
  }
  // no explicit payload expected here; avoid generic OK
  return true;
};

// GameExtension (9)

// OneOnOne (10)
ExtensionBypass.handleOneOnOne = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  const command = params?.[P.COMMANDS?.V_COMMAND] ?? params?.command;
  const userName = socket?.sfsUser?.name ?? "unknown";
  const requestId = params?.[P.COMMANDS?.V_REQUEST_ID] ?? Date.now() % 1000000;
  const targetUid = params?.[P.COMMANDS?.V_SFS_UID] ?? 0;
  const gameId = params?.["0"] ?? 0; // GAME.ID uses key "0"
  
  ExtensionDebug.ui('ONE_ON_ONE', `User ${userName} - 1v1 game action`);
  ExtensionDebug.log('info', '1V1', `OneOnOne - Command: ${command}, Request ID: ${requestId}, Game ID: ${gameId}, User: ${userName}`);
  
  if (command === P.COMMANDS?.C_1_1_GAME_REQUEST) {
    ExtensionDebug.flashDebug(socket, '1V1', `Requesting 1v1 game ${gameId}`, { requestId, gameId, targetUid, user: userName });
    
    // According to AS: S_1_1_GAME_REQUEST_ACK with V_REQUEST_ID, V_USER_NAME, V_SFS_UID, GAME.ID
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_1_1_GAME_REQUEST_ACK,
        [P.COMMANDS?.V_REQUEST_ID]: requestId,
        [P.COMMANDS?.V_SFS_UID]: targetUid,
        [P.COMMANDS?.V_USER_NAME]: userName,
        "0": gameId, // GAME.ID
      },
      messageType,
    );
    ExtensionDebug.success('1V1', `1v1 game request acknowledged`);
    return true;
  }
  
  if (command === P.COMMANDS?.C_1_1_GAME_ACCEPT) {
    ExtensionDebug.flashDebug(socket, '1V1', `Accepting 1v1 game request ${requestId}`, { requestId, user: userName });
    
    // According to AS: S_1_1_GAME_JOIN with V_REQUEST_ID, V_ROOM_ID, GAME.ID
    const gameRoomId = 1000 + Math.floor(Math.random() * 9000); // Generate game room ID
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_1_1_GAME_JOIN,
        [P.COMMANDS?.V_REQUEST_ID]: requestId,
        [P.COMMANDS?.V_ROOM_ID]: gameRoomId,
        "0": gameId, // GAME.ID
      },
      messageType,
    );
    ExtensionDebug.success('1V1', `1v1 game accepted, joining room ${gameRoomId}`);
    return true;
  }
  
  if (
    command === P.COMMANDS?.C_1_1_GAME_REJECT ||
    command === P.COMMANDS?.C_1_1_GAME_CANCEL ||
    command === P.COMMANDS?.C_1_1_GAME_EXIT
  ) {
    ExtensionDebug.flashDebug(socket, '1V1', `${command === P.COMMANDS?.C_1_1_GAME_REJECT ? 'Rejecting' : command === P.COMMANDS?.C_1_1_GAME_CANCEL ? 'Canceling' : 'Exiting'} 1v1 game ${requestId}`, { requestId, user: userName });
    
    // Simple acknowledgment for reject/cancel/exit
    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_1_1_GAME_RESPONSE,
        [P.COMMANDS?.V_REQUEST_ID]: requestId,
      },
      messageType,
    );
    ExtensionDebug.success('1V1', `1v1 game ${command} completed`);
    return true;
  }
  
  // no explicit payload expected for other ops; avoid generic OK
  return true;
};

// Removed redundant sendDefaultResponse override (merged into main router)

// Trade request/accept/reject/cancel/abort (37-41)
ExtensionBypass.handleTradeRequest = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const targetUserId = params?.[P.COMMANDS?.V_SFS_UID || "25"] ?? 0;
  const requestId = params?.[P.COMMANDS?.V_REQUEST_ID || "62"] ?? Date.now() % 100000;
  
  socket._trade = socket._trade || { id: Date.now() % 100000, locked: false };
  
  ExtensionDebug.ui('TRADE_REQUEST', `User sending trade request (Target: ${targetUserId})`);
  ExtensionDebug.flashDebug(socket, 'TRADE', `Sending trade request`, { targetUserId, requestId, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_TRADE_REQUEST_ACK="194"
  // From Main.as line 5892-5894: uiLayer.addTradeRequest(requestId, SENT, userName, uid)
  server.sendExtensionResponse(
    socket,
    {
      "21": "194", // V_COMMAND: S_TRADE_REQUEST_ACK
      "62": requestId, // V_REQUEST_ID = "62"
      "25": targetUserId, // V_SFS_UID = "25"
      "27": userName // V_USER_NAME = "27"
    },
    messageType
  );
  ExtensionDebug.success('TRADE', `Trade request sent to user ${targetUserId}`);
  return true;
};

ExtensionBypass.handleTradeAccept = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const requestId = params?.[P.COMMANDS?.V_REQUEST_ID || "62"] ?? 0;
  const txId = (socket._trade?.id) || (Date.now() % 100000);
  
  socket._trade = { id: txId, locked: false, nextSlot: 0, invToSlot: {}, slotToInv: {} };
  
  ExtensionDebug.ui('TRADE_ACCEPT', `User accepting trade request (Request: ${requestId})`);
  ExtensionDebug.flashDebug(socket, 'TRADE', `Accepting trade request`, { requestId, txId, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_TRADE_JOIN="195"
  // From Main.as line 5895-5897: startTradeTranaction(uid, userName, requestId, tradeTransactionId)
  server.sendExtensionResponse(
    socket,
    {
      "21": "195", // V_COMMAND: S_TRADE_JOIN
      "62": requestId, // V_REQUEST_ID = "62"
      "210": txId, // V_TRADE_TRANSACTION_ID = "210"
      "25": socket?.sfsUser?.id ?? 0, // V_SFS_UID = "25"
      "27": userName // V_USER_NAME = "27"
    },
    messageType
  );
  ExtensionDebug.success('TRADE', `Trade session ${txId} started`);
  return true;
};

ExtensionBypass.handleTradeReject = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TRADE_RESPONSE,
    },
    messageType,
  );
  return true;
};

ExtensionBypass.handleTradeCancel = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TRADE_TX_ABORTED,
    },
    messageType,
  );
  return true;
};

ExtensionBypass.handleTradeAbort = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TRADE_TX_ABORTED,
    },
    messageType,
  );
  return true;
};

// Messaging/Poke (7)

// Chat extension (19) - Handle chat messages
ExtensionBypass.handleChat = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  try {
    const P = this._P(server, PROTOCOL);
    const userName = socket?.sfsUser?.name ?? "unknown";
    const message = params?.[P.COMMANDS?.V_MESSAGE] ?? params?.message ?? params?.msg ?? "";
    const roomId = socket?.sfsUser?.currentRoom?.id ?? 101;
    
    ExtensionDebug.ui('CHAT', `User sent chat message`, { user: userName, roomId, messageLength: message.length });
    ExtensionDebug.log('info', 'CHAT', `Chat message from ${userName} in room ${roomId}: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
    ExtensionDebug.flashDebug(socket, 'CHAT', `Message sent`, { message: message.substring(0, 100), user: userName, roomId });

    // Emit a public message so the AS3 client handles it via onPublicMessage
    if (server.sendPublicMessage) {
      server.sendPublicMessage(socket, message, roomId);
    }

    // No extension ack needed; SmartFox public message already informs the client

    ExtensionDebug.success('CHAT', `Chat message processed successfully for ${userName}`);
    return true;
  } catch (error) {
    ExtensionDebug.error('CHAT', `Error processing chat message`, error);
    server.sendExtensionResponse(socket, { status: "error", error: "Failed to process chat" }, messageType);
    return true;
  }
};

// Remove chat bubble (25)
ExtensionBypass.handleRemoveChat = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  // No payload required
  return true;
};

// Community data (17) and donation (18)
ExtensionBypass.handleCommunityData = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_COMMUNITY_ALL_PLAYER_DATA,
      [P.COMMANDS?.V_COMMUNITY_TARGETS_DATA]: [],
      [P.COMMANDS?.V_IS_EVENT_OPEN]: 0,
    },
    messageType,
  );
  return true;
};
ExtensionBypass.handleMoneyDonation = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_MONEY_DONATION_OK,
      [P.COMMANDS?.V_COMMINITY_TARGET_ID]: params?.[P.COMMANDS?.V_COMMINITY_TARGET_ID] ?? null,
      [P.COMMANDS?.V_COMMINITY_TARGET_SCORE]: params?.[P.COMMANDS?.V_COMMINITY_TARGET_SCORE] ?? null,
    },
    messageType,
  );
  return true;
};

// Newspapper (23) / Tutorial (22)
ExtensionBypass.handleNewspapper = function (socket, params, messageType, server, PROTOCOL) {
  // No payload expected; UI fetches content separately
  return true;
};

// Enhanced generic handler with better client compatibility
// Provides structured responses instead of simple "ok"
ExtensionBypass.handleGenericOk = function (
  socket,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const extName = String(params?.extension || messageType || "unknown");
  
  ExtensionDebug.warn('BYPASS', `Using enhanced generic handler for extension ${extName}`);
  ExtensionDebug.flashDebug(socket, 'GENERIC', `Generic extension handler`, { extension: extName, user: userName });
  
  // Provide a more structured response that mimics expected client formats
  const response = {
    [P.COMMANDS?.V_COMMAND]: "generic_ack",
    [P.COMMANDS?.V_SFS_UID]: socket?.sfsUser?.id ?? 0,
    [P.COMMANDS?.V_USER_NAME]: userName,
    status: "ok",
    extension: extName,
    timestamp: Date.now()
  };
  
  // Add common fields that many extensions expect
  if (params?.[P.COMMANDS?.V_ITEM_ID]) {
    response[P.COMMANDS?.V_ITEM_ID] = params[P.COMMANDS.V_ITEM_ID];
  }
  if (params?.[P.COMMANDS?.V_ROOM_ID]) {
    response[P.COMMANDS?.V_ROOM_ID] = params[P.COMMANDS.V_ROOM_ID];
  }
  
  server.sendExtensionResponse(socket, response, messageType);
  ExtensionDebug.success('GENERIC', `Enhanced generic response sent for ${extName}`);
  return true;
};

// Buddies (104-106) and GetUserVars (110)
ExtensionBypass.handleApproveBuddy = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const buddyId = params?.[P.COMMANDS?.V_SFS_UID] ?? 'unknown';
  
  ExtensionDebug.ui('APPROVE_BUDDY', `User approving buddy request (Buddy ID: ${buddyId})`);
  ExtensionDebug.log('info', 'BUDDY', `Approve buddy - Buddy ID: ${buddyId}, User: ${userName}`);
  ExtensionDebug.flashDebug(socket, 'BUDDY', `Approving buddy request`, { buddyId, user: userName });
  
  server.sendExtensionResponse(
    socket,
    { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_BUDDY_REQUEST_ACCEPTED },
    messageType,
  );
  ExtensionDebug.success('BUDDY', `Buddy request approved`);
  return true;
};
ExtensionBypass.handleAddBuddy = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const buddyId = params?.[P.COMMANDS?.V_SFS_UID] ?? 'unknown';
  
  ExtensionDebug.ui('ADD_BUDDY', `User sending buddy request (Buddy ID: ${buddyId})`);
  ExtensionDebug.log('info', 'BUDDY', `Add buddy - Buddy ID: ${buddyId}, User: ${userName}`);
  ExtensionDebug.flashDebug(socket, 'BUDDY', `Sending buddy request`, { buddyId, user: userName });
  
  server.sendExtensionResponse(
    socket,
    { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_BUDDY_REQUEST_ACK },
    messageType,
  );
  ExtensionDebug.success('BUDDY', `Buddy request sent`);
  return true;
};
ExtensionBypass.handleRemoveBuddy = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const buddyId = params?.[P.COMMANDS?.V_SFS_UID] ?? 'unknown';
  
  ExtensionDebug.ui('REMOVE_BUDDY', `User removing buddy (Buddy ID: ${buddyId})`);
  ExtensionDebug.log('info', 'BUDDY', `Remove buddy - Buddy ID: ${buddyId}, User: ${userName}`);
  ExtensionDebug.flashDebug(socket, 'BUDDY', `Removing buddy`, { buddyId, user: userName });
  
  server.sendExtensionResponse(
    socket,
    { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_BUDDY_REMOVED_FROM_LIST, [P.COMMANDS?.V_SFS_UID]: buddyId },
    messageType,
  );
  ExtensionDebug.success('BUDDY', `Buddy removed successfully`);
  return true;
};
ExtensionBypass.handleGetUserVars = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  try {
    const targetId = parseInt(
      params?.[P.COMMANDS?.V_SFS_UID] ?? params?.userId ?? socket?.sfsUser?.id ?? 0,
      10,
    );
    let targetUser = null;
    if (server && server.users && typeof server.users.get === 'function') {
      targetUser = server.users.get(targetId) || null;
    }
    if (!targetUser && socket?.sfsUser) targetUser = socket.sfsUser;

    const outVars = targetUser?.getVariables?.() || {};
    // Ensure UID and NAME are present as the AS client relies on them
    if (outVars[USERVARIABLES.UID] == null && targetUser) outVars[USERVARIABLES.UID] = targetUser.id;
    if (outVars[USERVARIABLES.NAME] == null && targetUser) outVars[USERVARIABLES.NAME] = targetUser.name;

    server.sendExtensionResponse(
      socket,
      {
        [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_OTHER_USER_DATA,
        [P.COMMANDS?.V_SFS_UID]: targetId,
        [P.COMMANDS?.V_USER_VARS]: outVars,
      },
      messageType,
    );
    return true;
  } catch (e) {
    server.sendExtensionResponse(
      socket,
      { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_OTHER_USER_DATA, [P.COMMANDS?.V_USER_VARS]: {} },
      messageType,
    );
    return true;
  }
};

// Set mood/image/skin (107-109)
ExtensionBypass.handleSetMood = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const value = params?.[P.COMMANDS?.V_ITEM_ID] ?? params?.value ?? 0;
  
  ExtensionDebug.ui('SET_MOOD', `User changing mood (Value: ${value})`);
  ExtensionDebug.flashDebug(socket, 'PROFILE', `Changing mood`, { value, user: userName });
  
  if (socket?.sfsUser) {
    socket.sfsUser.setVariable?.(USERVARIABLES.MOOD, value);
    if (socket.sfsUser.currentRoom && server.broadcastUserVariableUpdate) {
      server.broadcastUserVariableUpdate(socket.sfsUser.currentRoom, socket.sfsUser, [USERVARIABLES.MOOD]);
    }
  }
  return true;
};
ExtensionBypass.handleSetImage = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const value = params?.[P.COMMANDS?.V_ITEM_ID] ?? params?.value ?? 0;
  
  ExtensionDebug.ui('SET_IMAGE', `User changing profile image (Value: ${value})`);
  ExtensionDebug.flashDebug(socket, 'PROFILE', `Changing profile image`, { value, user: userName });
  
  if (socket?.sfsUser) {
    socket.sfsUser.setVariable?.(USERVARIABLES.IMAGE, value);
    if (socket.sfsUser.currentRoom && server.broadcastUserVariableUpdate) {
      server.broadcastUserVariableUpdate(socket.sfsUser.currentRoom, socket.sfsUser, [USERVARIABLES.IMAGE]);
    }
  }
  return true;
};
ExtensionBypass.handleSetSkin = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const value = params?.[P.COMMANDS?.V_ITEM_ID] ?? params?.value ?? 0;
  
  ExtensionDebug.ui('SET_SKIN', `User changing skin/avatar (Value: ${value})`);
  ExtensionDebug.flashDebug(socket, 'PROFILE', `Changing skin`, { value, user: userName });
  
  if (socket?.sfsUser) {
    socket.sfsUser.setVariable?.(USERVARIABLES.SKIN, value);
    if (socket.sfsUser.currentRoom && server.broadcastUserVariableUpdate) {
      server.broadcastUserVariableUpdate(socket.sfsUser.currentRoom, socket.sfsUser, [USERVARIABLES.SKIN]);
    }
  }
  return true;
};

// Route above extensions
const _origSendDefault6 = ExtensionBypass.sendDefaultResponse;
ExtensionBypass.sendDefaultResponse = function (
  socket,
  extensionName,
  params,
  messageType,
  server,
  PROTOCOL,
) {
  const ext = String(extensionName);
  // Trade basic flow
  if (ext === "37" || ext === "TradeRequestExtension") {
    return ExtensionBypass.handleTradeRequest(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "38" || ext === "TradeAcceptExtension") {
    return ExtensionBypass.handleTradeAccept(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "39" || ext === "TradeRejectExtension") {
    return ExtensionBypass.handleTradeReject(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "40" || ext === "TradeCancelExtension") {
    return ExtensionBypass.handleTradeCancel(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "41" || ext === "TradeTxAbort") {
    return ExtensionBypass.handleTradeAbort(socket, params, messageType, server, PROTOCOL);
  }
  // Messaging / misc
  if (ext === "7" || ext === "MessagingExtension") {
    return ExtensionBypass.handleMessaging(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "25" || ext === "RemoveChatExtension") {
    return ExtensionBypass.handleRemoveChat(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "17" || ext === "CommunityDataExtension") {
    return ExtensionBypass.handleCommunityData(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "18" || ext === "MoneyDonationExtension") {
    return ExtensionBypass.handleMoneyDonation(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "23" || ext === "Newspapper") {
    return ExtensionBypass.handleNewspapper(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "22" || ext === "Tutorial") {
    return ExtensionBypass.handleTutorial(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "105" || ext === "ApproveBuddyRequestExtension") {
    return ExtensionBypass.handleApproveBuddy(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "106" || ext === "AddBuddyExtension") {
    return ExtensionBypass.handleAddBuddy(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "104" || ext === "RemoveBuddyExtension") {
    return ExtensionBypass.handleRemoveBuddy(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "110" || ext === "GetUserVarsExtension") {
    return ExtensionBypass.handleGetUserVars(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "109" || ext === "SetMoodExtension") {
    return ExtensionBypass.handleSetMood(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "108" || ext === "SetImageExtension") {
    return ExtensionBypass.handleSetImage(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "107" || ext === "SetSkinExtension") {
    return ExtensionBypass.handleSetSkin(socket, params, messageType, server, PROTOCOL);
  }
  // Newly added minimal handlers
  if (ext === "13" || ext === "Emoticons") {
    return ExtensionBypass.handleEmoticons(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "14" || ext === "GiftExtension") {
    return ExtensionBypass.handleGiftExtension(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "15" || ext === "PickGiftExtension") {
    return ExtensionBypass.handlePickGiftExtension(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "20" || ext === "TeleportPlayer") {
    return ExtensionBypass.handleTeleportPlayer(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "24" || ext === "RangerMessages") {
    return ExtensionBypass.handleRangerMessages(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "26" || ext === "PokeBlocked") {
    return ExtensionBypass.handlePokeBlocked(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "27" || ext === "Snitch") {
    return ExtensionBypass.handleSnitch(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "28" || ext === "PioneerStore") {
    return ExtensionBypass.handlePioneerStore(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "46" || ext === "HideAnimalExtension") {
    return ExtensionBypass.handleHideAnimal(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "47" || ext === "ShowAnimalExtension") {
    return ExtensionBypass.handleShowAnimal(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "50" || ext === "CampaignDonate") {
    return ExtensionBypass.handleCampaignDonate(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "51" || ext === "CampaignVote") {
    return ExtensionBypass.handleCampaignVote(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "52" || ext === "CampaignPromote") {
    return ExtensionBypass.handleCampaignPromote(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "53" || ext === "RandomEventCompletedExtension") {
    return ExtensionBypass.handleRandomEventCompleted(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "54" || ext === "RandomEventRejectedExtension") {
    return ExtensionBypass.handleRandomEventRejected(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "55" || ext === "CollectionRandomEventCompletedExtension") {
    return ExtensionBypass.handleCollectionRandomEventCompleted(socket, params, messageType, server, PROTOCOL);
  }
  // House operations (56-67, 69-71)
  if (ext === "56" || ext === "BuyHouseGardenPlantExtension") {
    return ExtensionBypass.handleBuyHouseGardenPlant(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "57" || ext === "HouseGardenPlantOperationExtension") {
    return ExtensionBypass.handleHouseGardenPlantOperation(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "58" || ext === "UpgradeHouseGardenLevelExtension") {
    return ExtensionBypass.handleUpgradeHouseGardenLevel(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "59" || ext === "BuyHouseItemExtension") {
    return ExtensionBypass.handleBuyHouseItem(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "60" || ext === "EnterHouseRoomExtension") {
    return ExtensionBypass.handleEnterHouseRoom(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "61" || ext === "GetHouseStorageExtension") {
    return ExtensionBypass.handleGetHouseStorage(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "62" || ext === "PlaceHouseItemExtension") {
    return ExtensionBypass.handlePlaceHouseItem(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "63" || ext === "ReplaceHouseExtension") {
    return ExtensionBypass.handleReplaceHouse(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "64" || ext === "SellHouseItemExtension") {
    return ExtensionBypass.handleSellHouseItem(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "65" || ext === "UpgradeHouseElectricLevelExtension") {
    return ExtensionBypass.handleUpgradeHouseElectricLevel(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "66" || ext === "UpgradeHouseSizeExtension") {
    return ExtensionBypass.handleUpgradeHouseSize(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "67" || ext === "BuyHouseExtension") {
    return ExtensionBypass.handleBuyHouse(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "69" || ext === "LockHouseExtension") {
    return ExtensionBypass.handleLockHouse(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "70" || ext === "HouseRoomEventExtension") {
    return ExtensionBypass.handleHouseRoomEvent(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "71" || ext === "BasicTutorialCompletedExtension") {
    return ExtensionBypass.handleBasicTutorialCompleted(socket, params, messageType, server, PROTOCOL);
  }
  // Ping and cards
  if (ext === "82" || ext === "PingExtension") {
    return ExtensionBypass.handlePing(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "84" || ext === "OpenCardPackWaitingExtension") {
    return ExtensionBypass.handleOpenCardPackWaiting(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "85" || ext === "RandomEventCompletedAckExtension") {
    return ExtensionBypass.handleRandomEventCompletedAck(socket, params, messageType, server, PROTOCOL);
  }
  // Security code ops
  if (ext === "86" || ext === "DeactivateSecurityCode") {
    return ExtensionBypass.handleDeactivateSecurityCode(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "87" || ext === "GeneratePlayerSecurityCode") {
    return ExtensionBypass.handleGeneratePlayerSecurityCode(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "88" || ext === "ValidateSecurityCode") {
    return ExtensionBypass.handleValidateSecurityCode(socket, params, messageType, server, PROTOCOL);
  }
  // Potions
  if (ext === "96" || ext === "UsePotionExtension") {
    return ExtensionBypass.handleUsePotion(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "97" || ext === "BuyPotionExtension") {
    return ExtensionBypass.handleBuyPotion(socket, params, messageType, server, PROTOCOL);
  }
  // Security forms (extra)
  if (ext === "93" || ext === "GetSecurityFormData") {
    return ExtensionBypass.handleGetSecurityFormData(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "94" || ext === "ResetPlayerSecurityForm") {
    return ExtensionBypass.handleResetPlayerSecurityForm(socket, params, messageType, server, PROTOCOL);
  }
  // Teleport to user
  if (ext === "111" || ext === "TeleportToUserExtension") {
    return ExtensionBypass.handleTeleportToUser(socket, params, messageType, server, PROTOCOL);
  }
  // Multiplayer tasks
  if (ext === "112" || ext === "InitMultiplayerTask") {
    return ExtensionBypass.handleInitMultiplayerTask(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "113" || ext === "JoinMultiplayerTask") {
    return ExtensionBypass.handleJoinMultiplayerTask(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "114" || ext === "LoadedMultiplayerTask") {
    return ExtensionBypass.handleLoadedMultiplayerTask(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "115" || ext === "ExitMultiplayerTask") {
    return ExtensionBypass.handleExitMultiplayerTask(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "116" || ext === "CompleteMultiplayerTask") {
    return ExtensionBypass.handleCompleteMultiplayerTask(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "117" || ext === "AcceptedToMultiplayerTask") {
    return ExtensionBypass.handleAcceptedToMultiplayerTask(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "118" || ext === "RejectFromMultiplayerTask") {
    return ExtensionBypass.handleRejectFromMultiplayerTask(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "119" || ext === "SendCommandToMPTask") {
    return ExtensionBypass.handleSendCommandToMPTask(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "120" || ext === "FailedMultiplayerTask") {
    return ExtensionBypass.handleFailedMultiplayerTask(socket, params, messageType, server, PROTOCOL);
  }
  // Life trap / ranger gold
  if (ext === "121" || ext === "HitLifeTrapExtension") {
    return ExtensionBypass.handleHitLifeTrap(socket, params, messageType, server, PROTOCOL);
  }
  if (ext === "122" || ext === "RangerGiveGoldExtension") {
    return ExtensionBypass.handleRangerGiveGold(socket, params, messageType, server, PROTOCOL);
  }

  if (typeof _origSendDefault6 === 'function') {
    return _origSendDefault6.call(
      ExtensionBypass,
      socket,
      extensionName,
      params,
      messageType,
      server,
      PROTOCOL,
    );
  }
  // No original fallback available; avoid generic OKs and return success
  return true;
};

// Additional minimal handlers for remaining extensions
ExtensionBypass.handlePing = function (socket, params, messageType, server, PROTOCOL) {
  // Simple ping payload without generic status
  server.sendExtensionResponse(socket, { ping: "pong", ts: Date.now() }, messageType);
  return true;
};

ExtensionBypass.handleEmoticons = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const emoticonId = params?.[P.COMMANDS?.V_EMOTICON_ID] ?? 0;
  
  ExtensionDebug.ui('EMOTICON', `User sending emoticon (ID: ${emoticonId})`);
  ExtensionDebug.log('info', 'EMOTICON', `Emoticon - ID: ${emoticonId}, User: ${userName}`);
  
  // Broadcast as public message recognized by UVarsUpdater.onPublicMessage (prefix @@)
  if (server.sendPublicMessage) {
    server.sendPublicMessage(socket, `@@${emoticonId}`);
  }
  
// No extension ack required; public message is enough
  ExtensionDebug.success('EMOTICON', `Emoticon ${emoticonId} sent`);
  return true;
};

ExtensionBypass.handleGiftExtension = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const giftType = params?.[P.COMMANDS?.V_GIFT_ITEM_TYPE || "113"] ?? 0;
  const quantity = params?.[P.COMMANDS?.V_GIFT_ITEM_QUANTITY || "114"] ?? 1;
  const slotId = params?.[P.COMMANDS?.V_SLOT_ID || "133"] ?? 0;
  const itemId = params?.[P.COMMANDS?.V_ITEM_ID || "36"] ?? 0;
  
  ExtensionDebug.ui('GIFT', `User throwing gift (Type: ${giftType}, Qty: ${quantity})`);
  ExtensionDebug.log('info', 'GIFT', `Gift thrown - Type: ${giftType}, Quantity: ${quantity}, User: ${userName}`);
  ExtensionDebug.flashDebug(socket, 'GIFT', `Throwing gift type ${giftType}`, { giftType, quantity, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_GIFT_ITEM_THROWN_ACK="115" 
  // From Main.as line 5669-5680: client removes item from inventory based on gift type
  server.sendExtensionResponse(
    socket,
    {
      "21": "115", // V_COMMAND: S_GIFT_ITEM_THROWN_ACK
      "113": giftType, // V_GIFT_ITEM_TYPE 
      "114": quantity, // V_GIFT_ITEM_QUANTITY
      "133": slotId, // V_SLOT_ID (for item removal)
      "36": itemId, // V_ITEM_ID (for recycle item type)
      "35": itemId > 0 ? { "36": itemId } : null // V_ITEM (if item type)
    },
    messageType
  );

  // And send S_GIFT_ITEM_THROWN so the room can spawn the resource (client listens to it)
  const px = socket?.sfsUser?.getVariable?.(USERVARIABLES.PX) ?? 0;
  const py = socket?.sfsUser?.getVariable?.(USERVARIABLES.PY) ?? 0;
  const instanceId = Date.now();
  const thrownPayload = {
    [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GIFT_ITEM_THROWN,
  };
  // RESOURCEITEM keys as numeric strings
  thrownPayload["1"] = instanceId; // INSTANCE_ID
  thrownPayload["2"] = px; // PX
  thrownPayload["3"] = py; // PY
  thrownPayload["5"] = 0; // IS_SERVER_GIFT

  server.sendExtensionResponse(socket, thrownPayload, messageType);

  ExtensionDebug.success('GIFT', `Gift thrown successfully`);
  return true;
};

ExtensionBypass.handlePickGiftExtension = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const instanceId = params?.[P.COMMANDS?.V_ITEM_INSTANCE_ID || "156"] ?? 0;
  
  ExtensionDebug.ui('GIFT_PICK', `User picking gift (Instance: ${instanceId})`);
  ExtensionDebug.log('info', 'GIFT', `Pick gift - Instance ID: ${instanceId}, User: ${userName}`);
  ExtensionDebug.flashDebug(socket, 'GIFT', `Picking gift ${instanceId}`, { instanceId, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_GIFT_ITEM_PICKED="116"
  // From Main.as line 5685-5691: client adds item to inventory and removes gift from room
  const itemData = { "36": instanceId }; // Basic item structure
  server.sendExtensionResponse(
    socket,
    { 
      "21": "116", // V_COMMAND: S_GIFT_ITEM_PICKED
      "156": instanceId, // V_ITEM_INSTANCE_ID = "156"
      "133": 0, // V_SLOT_ID = "133" (inventory slot)
      "35": itemData, // V_ITEM = "35" (full item data)
      "336": -1, // V_DAYS_LEFT = "336"
      "348": 0, // V_PIONEERS = "348"
      "349": 0 // V_NO_LIMITS = "349"
    },
    messageType
  );
  ExtensionDebug.success('GIFT', `Gift ${instanceId} picked successfully`);
  return true;
};

ExtensionBypass.handleTeleportPlayer = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const toRoomName = params?.[P.COMMANDS?.V_TO_ROOM_NAME] ?? socket?.sfsUser?.currentRoom?.id ?? 101;
  
  ExtensionDebug.ui('TELEPORT', `User teleporting to room ${toRoomName}`);
  ExtensionDebug.log('info', 'TELEPORT', `Teleport request - To Room: ${toRoomName}, User: ${userName}`);
  ExtensionDebug.flashDebug(socket, 'TELEPORT', `Teleporting to room ${toRoomName}`, { toRoomName, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_TELEPORT="307" with V_TO_ROOM_NAME and V_GOLD
  // From Main.as line 5708-5726: client checks V_GOLD != null to subtract gold, then teleports
  server.sendExtensionResponse(
    socket,
    { 
      "21": "307", // V_COMMAND: S_TELEPORT
      "300": toRoomName, // V_TO_ROOM_NAME = "300"
      "235": 0 // V_GOLD = "235" - 0 for free teleport
    },
    messageType
  );
  ExtensionDebug.success('TELEPORT', `Teleport response sent for room ${toRoomName}`);
  return true;
};

ExtensionBypass.handleRangerMessages = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const message = params?.[P.COMMANDS?.V_MESSAGE || "65"] ?? "Ranger message";
  const messageType_param = params?.[P.COMMANDS?.V_TYPE || "163"] ?? 1;
  const playerId = socket?.sfsUser?.id ?? 0;
  
  ExtensionDebug.ui('RANGER_MSG', `User requesting ranger message (Type: ${messageType_param})`);
  ExtensionDebug.flashDebug(socket, 'RANGER', `Processing ranger message`, { messageType: messageType_param, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_RANGER_MESSAGE="319" 
  // From Main.as line 5779: onRangerMessage(V_TYPE, V_MESSAGE, V_PLAYER_ID)
  server.sendExtensionResponse(
    socket,
    {
      "21": "319", // V_COMMAND: S_RANGER_MESSAGE
      "163": messageType_param, // V_TYPE
      "65": message, // V_MESSAGE = "65"
      "160": playerId // V_PLAYER_ID
    },
    messageType
  );
  ExtensionDebug.success('RANGER', `Ranger message sent`);
  return true;
};

ExtensionBypass.handlePokeBlocked = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const targetUser = params?.[P.COMMANDS?.V_USER_NAME || "27"] ?? "Unknown";
  
  ExtensionDebug.ui('POKE_BLOCKED', `User poke blocked (Target: ${targetUser})`);
  ExtensionDebug.flashDebug(socket, 'POKE', `Poke blocked`, { targetUser, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_POKE_BLOCKED="213"
  // From Main.as line 5838-5841: popup with GENERAL_STR_KEYS.poked_is_blocked
  server.sendExtensionResponse(
    socket,
    {
      "21": "213", // V_COMMAND: S_POKE_BLOCKED
      "27": targetUser // V_USER_NAME
    },
    messageType
  );
  ExtensionDebug.success('POKE', `Poke blocked response sent`);
  return true;
};

ExtensionBypass.handleSnitch = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const targetUser = params?.[P.COMMANDS?.V_USER_NAME] ?? "Unknown";
  const snitchType = params?.[P.COMMANDS?.V_TYPE] ?? 1;
  
  ExtensionDebug.ui('SNITCH', `User snitching (Target: ${targetUser}, Type: ${snitchType})`);
  ExtensionDebug.flashDebug(socket, 'SNITCH', `Processing snitch`, { targetUser, snitchType, user: userName });
  
  // Based on AS: Generic acknowledgment for snitch actions
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CHAT_BLOCKED_OK || "snitch_ack",
      [P.COMMANDS?.V_USER_NAME]: targetUser
    },
    messageType
  );
  ExtensionDebug.success('SNITCH', `Snitch response sent`);
  return true;
};

ExtensionBypass.handleTeleportToUser = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const roomId = params?.[P.COMMANDS?.V_ROOM_ID] ?? socket?.sfsUser?.currentRoom?.id ?? 101;
  server.sendExtensionResponse(
    socket,
    { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TELEPORT_TO_USER_ROOM_ID, [P.COMMANDS?.V_ROOM_NAME]: String(roomId) },
    messageType,
  );
  return true;
};

// Duplicate handlers removed - using original definitions above (lines 3702-3770)

ExtensionBypass.handlePioneerStore = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const storeId = params?.[P.COMMANDS?.V_STORE_ID] ?? 28;
  const itemId = params?.[P.COMMANDS?.V_ITEM_ID] ?? 0;
  
  ExtensionDebug.ui('PIONEER_STORE', `User accessing pioneer store (Store: ${storeId}, Item: ${itemId})`);
  ExtensionDebug.flashDebug(socket, 'STORE', `Pioneer store access`, { storeId, itemId, user: userName });
  
  // Based on AS: Pioneer store operations - return appropriate store response
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GET_STORE_DATA || "pioneer_store_data",
      [P.COMMANDS?.V_STORE_ID]: storeId,
      [P.COMMANDS?.V_STORE_DATA]: { id: storeId, items: [], itemCount: 0 },
      [P.COMMANDS?.V_ITEM_ID]: itemId
    },
    messageType
  );
  ExtensionDebug.success('STORE', `Pioneer store response sent`);
  return true;
};

ExtensionBypass.handleHideAnimal = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  try {
    if (socket?.sfsUser) {
      const prev = socket.sfsUser.getVariable?.(USERVARIABLES.ANIMAL);
      socket.sfsUser.setVariable?.(USERVARIABLES.ANIMAL, null);
      if (socket.sfsUser.currentRoom && server.broadcastUserVariableUpdate) {
        server.broadcastUserVariableUpdate(socket.sfsUser.currentRoom, socket.sfsUser, [USERVARIABLES.ANIMAL]);
      }
    }
  } catch (_) {}
  // Send a minimal animal action to confirm operation
  server.sendExtensionResponse(
    socket,
    { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_ANIMAL_ACTION, [P.COMMANDS?.V_ANIMAL_EMOTICON]: 0 },
    messageType,
  );
  return true;
};

ExtensionBypass.handleShowAnimal = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  try {
    if (socket?.sfsUser) {
      const current = socket.sfsUser.getVariable?.(USERVARIABLES.ANIMAL);
      const newVal = current || 1; // fall back to 1 if none
      socket.sfsUser.setVariable?.(USERVARIABLES.ANIMAL, newVal);
      if (socket.sfsUser.currentRoom && server.broadcastUserVariableUpdate) {
        server.broadcastUserVariableUpdate(socket.sfsUser.currentRoom, socket.sfsUser, [USERVARIABLES.ANIMAL]);
      }
    }
  } catch (_) {}
  server.sendExtensionResponse(
    socket,
    { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_ANIMAL_ACTION, [P.COMMANDS?.V_ANIMAL_EMOTICON]: 0 },
    messageType,
  );
  return true;
};

ExtensionBypass.handleCampaignDonate = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(
    socket,
    { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CAMPAIGN_DONATE, [P.COMMANDS?.V_DONATION_CAMPAIGN]: params?.[P.COMMANDS?.V_DONATION_CAMPAIGN] ?? null },
    messageType,
  );
  return true;
};

ExtensionBypass.handleCampaignVote = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(
    socket,
    { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CAMPAIGN_VOTE, [P.COMMANDS?.V_VOTE_DATA]: params?.[P.COMMANDS?.V_VOTE_DATA] ?? null },
    messageType,
  );
  return true;
};

ExtensionBypass.handleCampaignPromote = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_PROMOTE_TARGET }, messageType);
  return true;
};

ExtensionBypass.handleRandomEventCompleted = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const eventId = params?.[P.COMMANDS?.V_EVENT_ID] ?? 0;
  const goldReward = params?.[P.COMMANDS?.V_GOLD] ?? 10;
  const activityPoints = params?.[P.COMMANDS?.V_ACTIVITY_POINTS] ?? 5;
  
  ExtensionDebug.ui('RANDOM_EVENT', `User completed random event (ID: ${eventId})`);
  ExtensionDebug.flashDebug(socket, 'EVENT', `Random event completed`, { eventId, goldReward, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_RANDOM_EVENT_REWARD from Main.as line 5950-5953
  // Client calls: randomEventsManager.onEventReward(V_REWARD_GOLD, V_REWARD_ACTIVITY_POINTS)
  server.sendExtensionResponse(
    socket,
    {
      "21": "347", // V_COMMAND: S_RANDOM_EVENT_REWARD = "347"
      "90": goldReward, // V_REWARD_GOLD = "90"
      "89": activityPoints // V_REWARD_ACTIVITY_POINTS = "89"
    },
    messageType
  );
  ExtensionDebug.success('EVENT', `Random event reward sent: ${goldReward} gold, ${activityPoints} AP`);
  return true;
};

ExtensionBypass.handleRandomEventRejected = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const eventId = params?.[P.COMMANDS?.V_RANDOM_EVENT_ID] ?? params?.[P.COMMANDS?.V_ITEM_ID] ?? 0;
  
  ExtensionDebug.ui('RANDOM_EVENT_REJECT', `User rejected random event (ID: ${eventId})`);
  ExtensionDebug.flashDebug(socket, 'EVENT', `Random event rejected`, { eventId, user: userName });
  
  // Based on AS: Random event rejection - simple acknowledgment
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: "random_event_rejected",
      [P.COMMANDS?.V_RANDOM_EVENT_ID]: eventId,
      [P.COMMANDS?.V_SFS_UID]: socket?.sfsUser?.id ?? 0
    },
    messageType
  );
  ExtensionDebug.success('EVENT', `Random event rejection response sent`);
  return true;
};

ExtensionBypass.handleCollectionRandomEventCompleted = function (socket, params, messageType, server, PROTOCOL) {
  return ExtensionBypass.handleRandomEventCompleted(socket, params, messageType, server, PROTOCOL);
};

// House operations
ExtensionBypass.handleBuyHouseGardenPlant = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const gold = params?.[P.COMMANDS?.V_GOLD] ?? 0;
  const invPlant = params?.[P.COMMANDS?.V_HOUSE_GARDEN_INVENTORY_PLANT] ?? null;
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_HOUSE_BUY_PLANT, [P.COMMANDS?.V_HOUSE_GARDEN_INVENTORY_PLANT]: invPlant, [P.COMMANDS?.V_GOLD]: gold }, messageType);
  return true;
};

ExtensionBypass.handleHouseGardenPlantOperation = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const op = params?.[P.COMMANDS?.V_HOUSE_GARDEN_OP] ?? 0;
  const plantId = params?.[P.COMMANDS?.V_HOUSE_GARDEN_PLANT_ID] ?? 0;
  // Maintain basic gardener progression values
  const gardenerLevel = socket?.sfsUser?.playerData?.gardenerLevel ?? 1;
  const gardenerPoints = socket?.sfsUser?.playerData?.gardenerPoints ?? 0;
  server.sendExtensionResponse(socket, { 
    [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_HOUSE_GARDEN_PALNT_OP, 
    [P.COMMANDS?.V_HOUSE_GARDEN_OP]: op, 
    [P.COMMANDS?.V_HOUSE_GARDEN_PLANT_ID]: plantId,
    [P.COMMANDS?.V_GARDENER_LEVEL]: gardenerLevel,
    [P.COMMANDS?.V_GARDENER_POINTS]: gardenerPoints,
    [P.COMMANDS?.V_LEVEL_UP]: 0
  }, messageType);
  return true;
};

ExtensionBypass.handleUpgradeHouseGardenLevel = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(
    socket,
    { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_HOUSE_GARDEN_LEVEL_BUY, [P.COMMANDS?.V_GOLD]: 0 },
    messageType,
  );
  return true;
};

ExtensionBypass.handleBuyHouseItem = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const instanceId = params?.[P.COMMANDS?.V_INSTANCE_ID] ?? Date.now();
  const invItem = params?.[P.COMMANDS?.V_HOUSE_INVENTORY_ITEM] ?? 0;
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_HOUSE_BUY_ITEM,
      [P.COMMANDS?.V_INSTANCE_ID]: instanceId,
      [P.COMMANDS?.V_HOUSE_INVENTORY_ITEM]: invItem,
      [P.COMMANDS?.V_GOLD]: 0,
    },
    messageType,
  );
  return true;
};

ExtensionBypass.handleEnterHouseRoom = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const targetUserId = params?.[P.COMMANDS?.V_SFS_UID] ?? socket?.sfsUser?.id ?? 0;
  // Provide a deterministic room id for house
  const roomId = 900000 + Number(targetUserId);
  server.sendExtensionResponse(socket, { 
    [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_HOUSE_MAY_JOIN_ROOM,
    [P.COMMANDS?.V_SFS_UID]: targetUserId,
    [P.COMMANDS?.V_ROOM_ID]: roomId
  }, messageType);
  return true;
};

ExtensionBypass.handleGetHouseStorage = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const pd = this._ensurePlayerData(socket);
  const storageItems = pd?.storage || {};
  
  ExtensionDebug.ui('HOUSE_STORAGE', `User getting house storage items`);
  ExtensionDebug.flashDebug(socket, 'HOUSE', `Getting house storage`, { itemCount: Object.keys(storageItems).length, user: userName });
  
  // Convert storage to expected format
  const items = Object.keys(storageItems).map((id) => ({
    "36": Number(id), // V_ITEM_ID
    "quantity": storageItems[id]
  }));
  
  // EXACT AS CLIENT EXPECTS: S_HOUSE_GET_STORAGE_ITEMS="362"
  // From Main.as line 5970-5972: house.setStorageData(V_HOUSE_ITEMS)
  server.sendExtensionResponse(
    socket, 
    { 
      "21": "362", // V_COMMAND: S_HOUSE_GET_STORAGE_ITEMS
      "378": items // V_HOUSE_ITEMS = "378"
    }, 
    messageType
  );
  ExtensionDebug.success('HOUSE', `House storage items sent (${items.length} items)`);
  return true;
};

ExtensionBypass.handlePlaceHouseItem = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  // accept placement without validations to keep UI moving
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_HOUSE_ITEMS_PLACED, [P.COMMANDS?.V_HOUSE_CHANGES]: [] }, messageType);
  return true;
};

ExtensionBypass.handleReplaceHouse = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const gold = params?.[P.COMMANDS?.V_GOLD] ?? 0;
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_HOUSE_REPLACED, [P.COMMANDS?.V_GOLD]: gold }, messageType);
  return true;
};

ExtensionBypass.handleSellHouseItem = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_HOUSE_SELL_ITEM,
      [P.COMMANDS?.V_GOLD]: 0,
    },
    messageType,
  );
  return true;
};

ExtensionBypass.handleUpgradeHouseElectricLevel = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(
    socket,
    { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_HOUSE_ELECTRIC_LEVEL_BUY, [P.COMMANDS?.V_GOLD]: 0 },
    messageType,
  );
  return true;
};

ExtensionBypass.handleUpgradeHouseSize = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const size = params?.[P.COMMANDS?.V_HOUSE_SIZE] ?? 0;
  const gold = params?.[P.COMMANDS?.V_GOLD] ?? 0;
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_HOUSE_SIZE_CHANGE, [P.COMMANDS?.V_HOUSE_SIZE]: size, [P.COMMANDS?.V_GOLD]: gold }, messageType);
  return true;
};

ExtensionBypass.handleBuyHouse = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const houseId = params?.[P.COMMANDS?.V_HOUSE_TYPE_ID || "369"] ?? 1;
  const goldCost = params?.[P.COMMANDS?.V_GOLD || "70"] ?? 1000;
  
  ExtensionDebug.ui('BUY_HOUSE', `User buying house (ID: ${houseId}, Cost: ${goldCost})`);
  ExtensionDebug.flashDebug(socket, 'HOUSE', `Buying house ${houseId}`, { houseId, goldCost, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_HOUSE_BOUGHT="352"
  // From Main.as line 5986-5990: uiLayer.addGold(-V_GOLD), ownsHouse=true, enterMyHouse()
  server.sendExtensionResponse(
    socket, 
    { 
      "21": "352", // V_COMMAND: S_HOUSE_BOUGHT
      "235": goldCost // V_GOLD = "235" (cost to subtract)
    }, 
    messageType
  );
  ExtensionDebug.success('HOUSE', `House ${houseId} purchased for ${goldCost} gold`);
  return true;
};

ExtensionBypass.handleLockHouse = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const isLocked = params?.[P.COMMANDS?.V_HOUSE_LOCKED] ?? true;
  
  ExtensionDebug.ui('LOCK_HOUSE', `User ${isLocked ? 'locking' : 'unlocking'} house`);
  ExtensionDebug.flashDebug(socket, 'HOUSE', `House lock status change`, { isLocked, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_HOUSE_LOCKED="366"
  // From Main.as line 5965-5969: LayerController.ShowRoom() and popup with locked message
  server.sendExtensionResponse(
    socket, 
    { 
      "21": "366" // V_COMMAND: S_HOUSE_LOCKED
    }, 
    messageType
  );
  ExtensionDebug.success('HOUSE', `House lock status updated`);
  return true;
};

ExtensionBypass.handleHouseRoomEvent = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const eventId = params?.[P.COMMANDS?.V_HOUSE_ROOM_EVENT_ID || "407"] ?? 0;
  const eventType = params?.[P.COMMANDS?.V_HOUSE_ROOM_EVENT_TYPE || "408"] ?? 0;
  
  ExtensionDebug.ui('HOUSE_EVENT', `House room event (ID: ${eventId}, Type: ${eventType})`);
  ExtensionDebug.flashDebug(socket, 'HOUSE', `House room event`, { eventId, eventType, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_HOUSE_ROOM_EVENT="406"
  // From Main.as line 6020-6025: house.execRoomEvent(V_HOUSE_ROOM_EVENT_ID, V_HOUSE_ROOM_EVENT_TYPE)
  server.sendExtensionResponse(
    socket, 
    { 
      "21": "406", // V_COMMAND: S_HOUSE_ROOM_EVENT
      "407": eventId, // V_HOUSE_ROOM_EVENT_ID
      "408": eventType // V_HOUSE_ROOM_EVENT_TYPE
    }, 
    messageType
  );
  ExtensionDebug.success('HOUSE', `House room event ${eventId} executed`);
  return true;
};

ExtensionBypass.handleBasicTutorialCompleted = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TUTORIAL_OVER_GOLD_LEFT, [P.COMMANDS?.V_GOLD]: 0, [P.COMMANDS?.V_TUTORIAL_ID]: params?.[P.COMMANDS?.V_TUTORIAL_ID] ?? null }, messageType);
  return true;
};

ExtensionBypass.handleOpenCardPackWaiting = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  // Return empty cards array to satisfy UI loop; product optional
  server.sendExtensionResponse(
    socket,
    {
      [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CARD_PACK_DATA,
      [P.COMMANDS?.V_CARDS]: [],
    },
    messageType,
  );
  return true;
};

ExtensionBypass.handleRandomEventCompletedAck = function (socket, params, messageType, server, PROTOCOL) {
  // No explicit payload required; client UI proceeds after reward event
  return true;
};

ExtensionBypass.handleDeactivateSecurityCode = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_CODE_INVALIDATED }, messageType);
  return true;
};

ExtensionBypass.handleGeneratePlayerSecurityCode = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const code = params?.[P.COMMANDS?.V_CODE] ?? "0000";
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_NEW_SECURITY_CODE, [P.COMMANDS?.V_CODE]: code }, messageType);
  return true;
};

ExtensionBypass.handleValidateSecurityCode = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_SECURITY_CODE_VALID }, messageType);
  return true;
};

// Potions
ExtensionBypass.handleUsePotion = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const potionId = params?.[P.COMMANDS?.V_POTION_ID] ?? 0;
  const consumerId = params?.[P.COMMANDS?.V_CONSUMER_ID] ?? (socket?.sfsUser?.id ?? 0);
  const userName = socket?.sfsUser?.name ?? "unknown";
  
  ExtensionDebug.ui('USE_POTION', `User using potion (ID: ${potionId}) on consumer ${consumerId}`);
  ExtensionDebug.log('info', 'POTION', `Use potion - Potion ID: ${potionId}, Consumer ID: ${consumerId}, User: ${userName}`);
  ExtensionDebug.flashDebug(socket, 'POTION', `Using potion ${potionId}`, { potionId, consumerId, user: userName });

  // Broadcast a public message recognized by UVarsUpdater (prefix $<userId>$<potionId>)
  if (server.sendPublicMessage) {
    server.sendPublicMessage(socket, `$${consumerId}$${potionId}`);
  }
  
  server.sendExtensionResponse(socket, { 
    "21": "557", // V_COMMAND: S_USE_POTION
    "561": potionId // V_POTION_ID = "561"
  }, messageType);
  ExtensionDebug.success('POTION', `Potion ${potionId} used successfully`);
  return true;
};

ExtensionBypass.handleBuyPotion = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const potionId = params?.[P.COMMANDS?.V_POTION_ID] ?? 0;
  const quantity = params?.[P.COMMANDS?.V_POTIONS_QUANTITY] ?? 1;
  const userName = socket?.sfsUser?.name ?? "unknown";
  
  ExtensionDebug.ui('BUY_POTION', `User buying potion (ID: ${potionId}, Qty: ${quantity})`);
  ExtensionDebug.log('info', 'POTION', `Buy potion - Potion ID: ${potionId}, Quantity: ${quantity}, User: ${userName}`);
  ExtensionDebug.flashDebug(socket, 'POTION', `Buying potion ${potionId}`, { potionId, quantity, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_BUY_POTION="562" with V_POTION_ID
  // From Main.as line 6194-6198: PotionsCache.GetPotionData(), uiLayer.addGold(-price), uiLayer.addPotion()
  server.sendExtensionResponse(socket, { 
    "21": "562", // V_COMMAND: S_BUY_POTION
    "561": potionId // V_POTION_ID = "561"
  }, messageType);
  ExtensionDebug.success('POTION', `Potion ${potionId} purchased successfully`);
  return true;
};

ExtensionBypass.handleLockPotions = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const allowPotions = params?.[P.COMMANDS?.V_ALLOW_POTIONS] ?? true;
  
  ExtensionDebug.ui('LOCK_POTIONS', `User ${allowPotions ? 'enabling' : 'disabling'} potions`);
  ExtensionDebug.log('info', 'POTION', `Lock potions - Allow: ${allowPotions}, User: ${userName}`);
  ExtensionDebug.flashDebug(socket, 'POTION', `${allowPotions ? 'Enabling' : 'Disabling'} potions`, { allowPotions, user: userName });
  
  // Store the potion lock state on the user
  if (socket?.sfsUser) {
    socket.sfsUser._allowPotions = allowPotions;
  }
  
  // No explicit payload required by client
  ExtensionDebug.success('POTION', `Potions ${allowPotions ? 'enabled' : 'disabled'} successfully`);
  return true;
};

ExtensionBypass.handleGetSecurityFormData = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_GET_SECURITY_FORM_DATA, [P.COMMANDS?.V_SECURITY_FORM_Q_DATA]: [], [P.COMMANDS?.V_SECURITY_FORM_A_DATA]: [] }, messageType);
  return true;
};

ExtensionBypass.handleResetPlayerSecurityForm = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_SECURITY_FORM_RESET_DATA_OK }, messageType);
  return true;
};

// Multiplayer tasks
ExtensionBypass.handleInitMultiplayerTask = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const taskId = params?.[P.COMMANDS?.V_TASK_ID || "632"] ?? 0;
  const instanceId = params?.[P.COMMANDS?.V_TASK_INSTANCE_ID || "633"] ?? Date.now();
  
  ExtensionDebug.ui('MP_TASK_INIT', `User initiating multiplayer task (ID: ${taskId})`);
  ExtensionDebug.flashDebug(socket, 'MP_TASK', `Initiating multiplayer task`, { taskId, instanceId, user: userName });
  
  // store basic mp task state on socket
  socket._mpTask = { taskId, instanceId, users: [socket?.sfsUser?.id ?? 0] };
  
  // EXACT AS CLIENT EXPECTS: S_MULTIPLAYER_TASK_INIT="635"
  server.sendExtensionResponse(
    socket, 
    { 
      "21": "635", // V_COMMAND: S_MULTIPLAYER_TASK_INIT = "635"
      "632": taskId, // V_TASK_ID = "632"
      "633": instanceId, // V_TASK_INSTANCE_ID = "633"
      "634": [] // V_USERS_STATE = "634"
    }, 
    messageType
  );
  ExtensionDebug.success('MP_TASK', `Multiplayer task ${taskId} initialized`);
  return true;
};

ExtensionBypass.handleJoinMultiplayerTask = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const taskId = socket?._mpTask?.taskId ?? 0;
  
  ExtensionDebug.ui('MP_TASK_JOIN', `User joining multiplayer task (ID: ${taskId})`);
  ExtensionDebug.flashDebug(socket, 'MP_TASK', `Joining multiplayer task`, { taskId, user: userName });
  
  if (socket._mpTask && socket?.sfsUser?.currentRoom && server.broadcastUserVariableUpdate) {
    // simple broadcast via userVar update hook
    server.broadcastUserVariableUpdate(socket.sfsUser.currentRoom, socket.sfsUser, ['joined_mp_task']);
  }
  
  // EXACT AS CLIENT EXPECTS: S_MULTIPLAYER_TASK_START="642"
  server.sendExtensionResponse(
    socket, 
    { "21": "642" }, // V_COMMAND: S_MULTIPLAYER_TASK_START = "642"
    messageType
  );
  ExtensionDebug.success('MP_TASK', `Multiplayer task ${taskId} joined`);
  return true;
};

ExtensionBypass.handleLoadedMultiplayerTask = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const taskId = socket?._mpTask?.taskId ?? 0;
  
  ExtensionDebug.ui('MP_TASK_LOADED', `User loaded multiplayer task (ID: ${taskId})`);
  ExtensionDebug.flashDebug(socket, 'MP_TASK', `Multiplayer task loaded`, { taskId, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_MULTIPLAYER_TASK_LOADED_ACK="641"
  server.sendExtensionResponse(
    socket, 
    { "21": "641" }, // V_COMMAND: S_MULTIPLAYER_TASK_LOADED_ACK = "641"
    messageType
  );
  ExtensionDebug.success('MP_TASK', `Multiplayer task ${taskId} loaded acknowledged`);
  return true;
};

ExtensionBypass.handleExitMultiplayerTask = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const taskId = socket?._mpTask?.taskId ?? 0;
  
  ExtensionDebug.ui('MP_TASK_EXIT', `User exiting multiplayer task (ID: ${taskId})`);
  ExtensionDebug.flashDebug(socket, 'MP_TASK', `Exiting multiplayer task`, { taskId, user: userName });
  
  socket._mpTask = null;
  
  // EXACT AS CLIENT EXPECTS: S_MULTIPLAYER_TASK_EXIT="638"
  server.sendExtensionResponse(
    socket, 
    { "21": "638" }, // V_COMMAND: S_MULTIPLAYER_TASK_EXIT = "638"
    messageType
  );
  ExtensionDebug.success('MP_TASK', `Multiplayer task ${taskId} exited`);
  return true;
};

ExtensionBypass.handleCompleteMultiplayerTask = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const taskId = socket?._mpTask?.taskId ?? params?.[P.COMMANDS?.V_TASK_ID] ?? 0;
  const reward = params?.[P.COMMANDS?.V_GOLD] ?? 3;
  
  ExtensionDebug.ui('MP_TASK_COMPLETE', `User completed multiplayer task (ID: ${taskId})`);
  ExtensionDebug.flashDebug(socket, 'MP_TASK', `Multiplayer task completed`, { taskId, reward, user: userName });
  
  // Grant small rewards for completion to keep flows
  this._addGold(socket, reward);
  
  // EXACT AS CLIENT EXPECTS: S_MULTIPLAYER_TASK_COMPLETED="639"
  server.sendExtensionResponse(
    socket, 
    { 
      "21": "639", // V_COMMAND: S_MULTIPLAYER_TASK_COMPLETED = "639"
      "632": taskId, // V_TASK_ID = "632"
      "235": reward // V_GOLD = "235"
    }, 
    messageType
  );
  ExtensionDebug.success('MP_TASK', `Multiplayer task ${taskId} completed successfully`);
  return true;
};

ExtensionBypass.handleAcceptedToMultiplayerTask = function (socket, params, messageType, server, PROTOCOL) {
  // Simple ack – actual flow handled by start/loaded
  // No generic OK; rely on other MP task events
  return true;
};

ExtensionBypass.handleRejectFromMultiplayerTask = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_MULTIPLAYER_TASK_EXIT_INIT_REJECT }, messageType);
  return true;
};

ExtensionBypass.handleSendCommandToMPTask = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const cmd = params?.[P.COMMANDS?.V_MP_TASK_COMMAND] ?? null;
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_MULTIPLAYER_USER_COMMAND, [P.COMMANDS?.V_MP_TASK_COMMAND]: cmd }, messageType);
  return true;
};

ExtensionBypass.handleFailedMultiplayerTask = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_MULTIPLAYER_TASK_EXIT_FAILED }, messageType);
  return true;
};

ExtensionBypass.handleHitLifeTrap = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const trapId = params?.[P.COMMANDS?.V_TRAP_ID] ?? 0;
  server.sendExtensionResponse(socket, { [P.COMMANDS?.V_COMMAND]: P.COMMANDS?.S_TELEPORT_LOST_LIFE, [P.COMMANDS?.V_TRAP_ID]: trapId }, messageType);
  return true;
};

ExtensionBypass.handleRangerGiveGold = function (socket, params, messageType, server, PROTOCOL) {
  const P = this._P(server, PROTOCOL);
  const userName = socket?.sfsUser?.name ?? "unknown";
  const gold = params?.[P.COMMANDS?.V_GOLD || "235"] ?? 10;
  const rangerName = params?.[P.COMMANDS?.V_USER_NAME || "27"] ?? "Ranger";
  
  ExtensionDebug.ui('RANGER_GOLD', `Ranger giving ${gold} gold to user`);
  ExtensionDebug.flashDebug(socket, 'RANGER', `Ranger gold reward`, { gold, rangerName, user: userName });
  
  // EXACT AS CLIENT EXPECTS: S_ADD_GOLD="311"
  // From Main.as line 5728-5734: uiLayer.addGold() and popup with gold amount
  server.sendExtensionResponse(
    socket, 
    { 
      "21": "311", // V_COMMAND: S_ADD_GOLD
      "235": gold, // V_GOLD = "235"
      "27": rangerName // V_USER_NAME = "27"
    }, 
    messageType
  );
  ExtensionDebug.success('RANGER', `Gold reward of ${gold} sent from ${rangerName}`);
  return true;
};

module.exports = ExtensionBypass;
module.exports.ExtensionDebug = ExtensionDebug;

// Auto-start performance reporting (every 5 minutes)
if (ExtensionDebug.isEnabled) {
  // Delay initialization logging to ensure proper setup
  process.nextTick(() => {
    ExtensionDebug.success('DEBUG', 'Extension debugging system initialized');
    ExtensionDebug.log('info', 'DEBUG', `Debug level: ${ExtensionDebug.verboseLevel} (0=errors, 1=basic, 2=detailed, 3=verbose)`);
    ExtensionDebug.log('info', 'DEBUG', 'Performance reporting will occur every 5 minutes');
  });
  
  setInterval(() => {
    ExtensionDebug.printPerformanceReport();
  }, 5 * 60 * 1000); // 5 minutes
}
