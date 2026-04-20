#!/usr/bin/env node
/**
 * SmartFoxServer Pro 1.6.6 Complete Node.js Implementation
 * A 1:1 recreation of SmartFoxServer for VTweens game
 *
 * Enhanced Debug Features:
 * - Detailed XML message parsing and analysis
 * - Full message content logging (when enabled)
 * - User variable change tracking
 * - Extension message debugging
 * - Authentication process logging
 * - Connection details monitoring
 * - Color-coded console output
 * - Structured data visualization
 */

const net = require("net");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const ExtensionBypass = require("./extension_bypass");
const USERVARIABLES = require("./jsclient/consts/USERVARIABLES");
const { UsersStore } = require("./users_store");

// Local fallback user store. Used when no PostgreSQL is configured so the
// game still has working register + login.
const usersStore = new UsersStore();

// Debug configuration - Simplified and focused
const DEBUG_CONFIG = {
  ENABLED: true,
  LOG_LEVEL: "DEBUG", // ERROR, WARN, INFO, DEBUG
  LOG_SOCKET_DATA: true, // Only log socket connections, not every data packet
  LOG_DATABASE: true,
  LOG_EXTENSIONS: true, // Only log extension errors
  LOG_USER_ACTIONS: true,
  LOG_ROOM_EVENTS: true, // Only log important room events
  LOG_PERFORMANCE: false, // Only log performance issues, not every operation
  COLORIZE: true,
  CONCISE: true, // Use concise one-line logging

  // Detailed message logging (disabled for less noise)
  LOG_MESSAGE_CONTENT: true,
  LOG_MESSAGE_PARSING: true,
  LOG_XML_ATTRIBUTES: true,
  LOG_EXTENSION_DATA: true,
  LOG_USER_VARIABLES: true,
  LOG_ROOM_VARIABLES: true,
  LOG_AUTHENTICATION: true, // Keep auth logging for security
  LOG_CONNECTION_DETAILS: true,

  // Advanced debugging (mostly disabled)
  LOG_STATE_TRANSITIONS: true,
  LOG_ERROR_CONTEXT: true,
  LOG_MESSAGE_FLOW: true,
  LOG_PROTOCOL_VIOLATIONS: true,
  LOG_CLIENT_EXPECTATIONS: true,
  INCLUDE_TROUBLESHOOTING: true,
  TRACK_FAILURE_PATTERNS: true,
  LOG_AI_ANALYSIS_HINTS: true,

  // Performance monitoring settings
  PERF_MONITORING_INTERVAL: 60000, // Log stats every 60 seconds instead of 30
  LOG_SLOW_OPERATIONS: false, // Only log operations taking >100ms
  SLOW_OPERATION_THRESHOLD: 100, // milliseconds

  // Extension fallback behavior (prefer ExtensionBypass for all)
  ALLOW_EXTENSION_FALLBACKS: false,
};

// Debug colors for console output
const DEBUG_COLORS = {
  RESET: "\x1b[0m",
  BRIGHT: "\x1b[1m",
  DIM: "\x1b[2m",
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  MAGENTA: "\x1b[35m",
  CYAN: "\x1b[36m",
  WHITE: "\x1b[37m",
  GRAY: "\x1b[90m",
};

// Debug utility class
class DebugLogger {
  static getTimestamp() {
    return new Date().toISOString().replace("T", " ").substring(0, 23);
  }

  static formatMessage(level, category, message, data = null) {
    if (!DEBUG_CONFIG.ENABLED) return;
    const timestamp = this.getTimestamp();
    let colorStart = "",
      colorEnd = "";
    if (DEBUG_CONFIG.COLORIZE) {
      switch (level) {
        case "ERROR":
          colorStart = DEBUG_COLORS.RED + DEBUG_COLORS.BRIGHT;
          break;
        case "WARN":
          colorStart = DEBUG_COLORS.YELLOW;
          break;
        case "INFO":
          colorStart = DEBUG_COLORS.GREEN;
          break;
        case "DEBUG":
          colorStart = DEBUG_COLORS.BLUE;
          break;
        case "TRACE":
          colorStart = DEBUG_COLORS.GRAY;
          break;
        case "SOCKET":
          colorStart = DEBUG_COLORS.CYAN;
          break;
        case "DB":
          colorStart = DEBUG_COLORS.MAGENTA;
          break;
        case "EXT":
          colorStart = DEBUG_COLORS.YELLOW + DEBUG_COLORS.BRIGHT;
          break;
        case "USER":
          colorStart = DEBUG_COLORS.GREEN + DEBUG_COLORS.BRIGHT;
          break;
        case "ROOM":
          colorStart = DEBUG_COLORS.BLUE + DEBUG_COLORS.BRIGHT;
          break;
        case "PERF":
          colorStart = DEBUG_COLORS.WHITE + DEBUG_COLORS.BRIGHT;
          break;
        case "XML_INCOMING":
          colorStart = DEBUG_COLORS.CYAN + DEBUG_COLORS.BRIGHT;
          break;
        case "XML_OUTGOING":
          colorStart = DEBUG_COLORS.MAGENTA + DEBUG_COLORS.BRIGHT;
          break;
      }
      colorEnd = DEBUG_COLORS.RESET;
    }
    const prefix = `${colorStart}[${timestamp}] [${level}] [${category}]${colorEnd}`;

    // Enhanced logging with better data formatting
    if (DEBUG_CONFIG.CONCISE || !data) {
      console.log(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);

      // Pretty print data with better formatting
      if (data && typeof data === "object") {
        console.log(`${colorStart}   ┌─ Detailed Information:${colorEnd}`);

        // Handle special data types
        if (data.fullMessage && DEBUG_CONFIG.LOG_MESSAGE_CONTENT) {
          console.log(`${colorStart}   │ Full Message Content:${colorEnd}`);
          console.log(`${colorStart}   │${colorEnd} ${data.fullMessage}`);
          delete data.fullMessage; // Remove from main data to avoid duplication
        }

        Object.entries(data).forEach(([key, value], index, arr) => {
          const isLast = index === arr.length - 1;
          const connector = isLast ? "└─" : "├─";

          if (typeof value === "object" && value !== null) {
            console.log(`${colorStart}   ${connector} ${key}:${colorEnd}`);
            const formattedJson = JSON.stringify(value, null, 2).replace(
              /\n/g,
              `\n${colorStart}   ${isLast ? "   " : "│  "}${colorEnd}`,
            );
            console.log(
              `${colorStart}   ${isLast ? "   " : "│  "}${formattedJson}${colorEnd}`,
            );
          } else {
            console.log(
              `${colorStart}   ${connector} ${key}: ${value}${colorEnd}`,
            );
          }
        });
      } else {
        console.log(
          `${colorStart}   └─ Data: ${JSON.stringify(data, null, 2)}${colorEnd}`,
        );
      }
    }
  }

  static error(category, message, data = null) {
    this.formatMessage("ERROR", category, message, data);
  }

  static warn(category, message, data = null) {
    this.formatMessage("WARN", category, message, data);
  }

  static info(category, message, data = null) {
    this.formatMessage("INFO", category, message, data);
  }

  static debug(category, message, data = null) {
    if (
      DEBUG_CONFIG.LOG_LEVEL === "ALL" ||
      DEBUG_CONFIG.LOG_LEVEL === "DEBUG" ||
      DEBUG_CONFIG.LOG_LEVEL === "TRACE"
    ) {
      this.formatMessage("DEBUG", category, message, data);
    }
  }

  static trace(category, message, data = null) {
    if (
      DEBUG_CONFIG.LOG_LEVEL === "ALL" ||
      DEBUG_CONFIG.LOG_LEVEL === "TRACE"
    ) {
      this.formatMessage("TRACE", category, message, data);
    }
  }

  static socket(message, data = null) {
    if (DEBUG_CONFIG.LOG_SOCKET_DATA) {
      this.formatMessage("SOCKET", "NETWORK", message, data);
    }
  }

  static db(message, data = null) {
    if (DEBUG_CONFIG.LOG_DATABASE) {
      this.formatMessage("DB", "DATABASE", message, data);
    }
  }

  static extension(message, data = null) {
    if (DEBUG_CONFIG.LOG_EXTENSIONS) {
      this.formatMessage("EXT", "EXTENSION", message, data);
    }
  }

  static user(message, data = null) {
    if (DEBUG_CONFIG.LOG_USER_ACTIONS) {
      this.formatMessage("USER", "USER_ACTION", message, data);
    }
  }

  static room(message, data = null) {
    if (DEBUG_CONFIG.LOG_ROOM_EVENTS) {
      this.formatMessage("ROOM", "ROOM_EVENT", message, data);
    }
  }

  static perf(message, data = null) {
    if (DEBUG_CONFIG.LOG_PERFORMANCE) {
      this.formatMessage("PERF", "PERFORMANCE", message, data);
    }
  }

  static xml(direction, message, data = null) {
    if (!DEBUG_CONFIG.LOG_SOCKET_DATA) return;

    const dir = String(direction || "").toLowerCase();
    const directionLabel = dir.toUpperCase();
    const category = `XML_${directionLabel}`;
    let type = "UNKNOWN";
    let action = "UNKNOWN";
    let room = "";
    let len = 0;
    let messageDetails = {};

    try {
      if (typeof message === "string") {
        len = message.length;
        const msgMatch = message.match(/<msg\s+t=['"](\w+)['"]/);
        const bodyMatch = message.match(/<body[^>]*action=['"](\w+)['"][^>]*>/);
        const roomMatch = message.match(/<body[^>]*\sr=['"](-?\d+)['"][^>]*>/);

        if (msgMatch) type = msgMatch[1];
        if (bodyMatch) action = bodyMatch[1];
        if (roomMatch) room = ` r=${roomMatch[1]}`;

        // Enhanced message parsing for detailed logging
        if (DEBUG_CONFIG.LOG_MESSAGE_PARSING) {
          // Extract more message details
          messageDetails.messageType = type;
          messageDetails.action = action;
          messageDetails.roomId = roomMatch ? roomMatch[1] : "none";

          // Parse XML attributes if enabled
          if (DEBUG_CONFIG.LOG_XML_ATTRIBUTES) {
            const msgAttrMatch = message.match(/<msg\s+([^>]+)>/);
            if (msgAttrMatch) {
              messageDetails.msgAttributes = msgAttrMatch[1];
            }

            const bodyAttrMatch = message.match(/<body\s+([^>]+)>/);
            if (bodyAttrMatch) {
              messageDetails.bodyAttributes = bodyAttrMatch[1];
            }
          }

          // Extract CDATA content for extensions
          const cdataMatch = message.match(/<!\[CDATA\[(.+?)\]\]>/s);
          if (cdataMatch && DEBUG_CONFIG.LOG_EXTENSION_DATA) {
            const cdataContent = cdataMatch[1];
            messageDetails.cdataLength = cdataContent.length;
            messageDetails.cdataPreview =
              cdataContent.substring(0, 300) +
              (cdataContent.length > 300 ? "..." : "");

            // Try to parse extension name/command from CDATA
            const extNameMatch = cdataContent.match(/<name>([^<]*)<\/name>/);
            const extCmdMatch = cdataContent.match(/<cmd>([^<]*)<\/cmd>/);
            if (extNameMatch) messageDetails.extensionName = extNameMatch[1];
            if (extCmdMatch) messageDetails.extensionCommand = extCmdMatch[1];
          }

          // Extract user variables if present
          if (DEBUG_CONFIG.LOG_USER_VARIABLES && message.includes("<vars>")) {
            const varsMatch = message.match(/<vars[^>]*>(.*?)<\/vars>/s);
            if (varsMatch) {
              const varCount = (varsMatch[1].match(/<var/g) || []).length;
              messageDetails.userVariablesCount = varCount;
              if (varCount > 0 && varCount < 10) {
                // Only show details for reasonable amounts
                const varMatches = varsMatch[1].match(
                  /<var n='([^']*)'[^>]*>/g,
                );
                if (varMatches) {
                  messageDetails.userVariableNames = varMatches.map(
                    (v) => v.match(/n='([^']*)'/)[1],
                  );
                }
              }
            }
          }

          // Detect special message types
          if (message.includes("verChk"))
            messageDetails.specialType = "VERSION_CHECK";
          else if (message.includes("login"))
            messageDetails.specialType = "LOGIN_REQUEST";
          else if (message.includes("logOK"))
            messageDetails.specialType = "LOGIN_SUCCESS";
          else if (message.includes("getRmList"))
            messageDetails.specialType = "ROOM_LIST_REQUEST";
          else if (message.includes("joinOK"))
            messageDetails.specialType = "JOIN_ROOM_SUCCESS";
          else if (message.includes("xtRes"))
            messageDetails.specialType = "EXTENSION_RESPONSE";
        }
      }
    } catch (error) {
      messageDetails.parseError = error.message;
    }

    const user =
      data && data.user
        ? data.user
        : data && data.username
          ? data.username
          : "NOT_LOGGED_IN";
    const cid = data && data.connectionId ? data.connectionId : "UNKNOWN";

    if (DEBUG_CONFIG.CONCISE) {
      // Concise mode - one line summary
      const summary =
        `${directionLabel} ${type}/${action}${room} len=${len} user=${user} cid=${cid}`.trim();
      this.formatMessage("INFO", category, summary);
    } else {
      // Detailed mode - comprehensive logging
      const summary = `${directionLabel} XML MESSAGE ANALYSIS`;
      const detailedData = {
        messageType: type,
        action: action,
        roomId: room.replace(" r=", "") || "none",
        messageLength: len,
        user: user,
        connectionId: cid,
        timestamp: new Date().toISOString(),
        ...messageDetails,
      };

      // Log full message content if enabled
      if (DEBUG_CONFIG.LOG_MESSAGE_CONTENT && message) {
        detailedData.fullMessage = message;
      }

      this.formatMessage("INFO", category, summary, detailedData);
    }
  }
}

// Advanced State Tracking and AI Analysis System
class StateTracker {
  static connectionStates = new Map();
  static userStates = new Map();
  static messageFlows = new Map();
  static errorPatterns = new Map();
  static protocolViolations = new Map();
  static clientExpectations = new Map();

  static trackConnectionState(connectionId, state, context = {}) {
    if (!DEBUG_CONFIG.LOG_STATE_TRANSITIONS) return;

    const prevState = this.connectionStates.get(connectionId);
    const transition = {
      from: prevState ? prevState.current : "NONE",
      to: state,
      timestamp: Date.now(),
      context: context,
      duration: prevState ? Date.now() - prevState.timestamp : 0,
    };

    this.connectionStates.set(connectionId, {
      current: state,
      timestamp: Date.now(),
      history: (prevState ? prevState.history || [] : []).concat([transition]),
    });

    DebugLogger.debug("STATE_TRACKER", `Connection state transition`, {
      connectionId,
      transition,
      aiAnalysis: this.analyzeStateTransition(transition, prevState),
      troubleshooting: this.getStateTransitionTroubleshooting(transition),
    });
  }

  static trackUserState(userId, state, context = {}) {
    if (!DEBUG_CONFIG.LOG_STATE_TRANSITIONS) return;

    const prevState = this.userStates.get(userId);
    const transition = {
      from: prevState ? prevState.current : "NONE",
      to: state,
      timestamp: Date.now(),
      context: context,
    };

    this.userStates.set(userId, {
      current: state,
      timestamp: Date.now(),
      history: (prevState ? prevState.history || [] : []).concat([transition]),
    });

    DebugLogger.debug("STATE_TRACKER", `User state transition`, {
      userId,
      transition,
      aiAnalysis: this.analyzeUserStateTransition(transition, prevState),
    });
  }

  static trackMessageFlow(
    connectionId,
    direction,
    messageType,
    action,
    context = {},
  ) {
    if (!DEBUG_CONFIG.LOG_MESSAGE_FLOW) return;

    const flowId = `${connectionId}_${Date.now()}`;
    const flow = {
      id: flowId,
      connectionId,
      direction, // 'incoming' | 'outgoing'
      messageType,
      action,
      timestamp: Date.now(),
      context,
    };

    const connectionFlows = this.messageFlows.get(connectionId) || [];
    connectionFlows.push(flow);

    // Keep only last 50 messages per connection
    if (connectionFlows.length > 50) {
      connectionFlows.splice(0, connectionFlows.length - 50);
    }

    this.messageFlows.set(connectionId, connectionFlows);

    const recentFlow = connectionFlows.slice(-5); // Last 5 messages
    DebugLogger.trace("MESSAGE_FLOW", `Message flow tracked`, {
      currentFlow: flow,
      recentFlow,
      aiAnalysis: this.analyzeMessageFlow(recentFlow),
    });
  }

  static recordError(connectionId, error, context = {}) {
    if (!DEBUG_CONFIG.TRACK_FAILURE_PATTERNS) return;

    const errorKey = `${error.name || "Unknown"}_${error.message || "No message"}`;
    const pattern = this.errorPatterns.get(errorKey) || {
      count: 0,
      firstSeen: Date.now(),
      contexts: [],
    };

    pattern.count++;
    pattern.lastSeen = Date.now();
    pattern.contexts.push({
      connectionId,
      timestamp: Date.now(),
      context,
    });

    // Keep only last 10 contexts
    if (pattern.contexts.length > 10) {
      pattern.contexts.splice(0, pattern.contexts.length - 10);
    }

    this.errorPatterns.set(errorKey, pattern);

    DebugLogger.error("ERROR_PATTERN", `Error pattern recorded`, {
      errorKey,
      pattern,
      aiAnalysis: this.analyzeErrorPattern(pattern),
      troubleshooting: this.getErrorTroubleshooting(errorKey, pattern),
    });
  }

  static recordProtocolViolation(
    connectionId,
    violation,
    expected,
    actual,
    context = {},
  ) {
    if (!DEBUG_CONFIG.LOG_PROTOCOL_VIOLATIONS) return;

    const violationKey = `${violation}_${connectionId}`;
    const record = {
      violation,
      expected,
      actual,
      timestamp: Date.now(),
      connectionId,
      context,
    };

    const violations = this.protocolViolations.get(connectionId) || [];
    violations.push(record);
    this.protocolViolations.set(connectionId, violations);

    DebugLogger.warn("PROTOCOL_VIOLATION", `Protocol violation detected`, {
      record,
      aiAnalysis: this.analyzeProtocolViolation(record),
      troubleshooting: this.getProtocolViolationTroubleshooting(violation),
    });
  }

  static recordClientExpectation(
    connectionId,
    expectation,
    actualOutcome,
    context = {},
  ) {
    if (!DEBUG_CONFIG.LOG_CLIENT_EXPECTATIONS) return;

    const record = {
      expectation,
      actualOutcome,
      met: expectation === actualOutcome,
      timestamp: Date.now(),
      connectionId,
      context,
    };

    const expectations = this.clientExpectations.get(connectionId) || [];
    expectations.push(record);
    this.clientExpectations.set(connectionId, expectations);

    if (!record.met) {
      DebugLogger.warn("CLIENT_EXPECTATION", `Client expectation not met`, {
        record,
        aiAnalysis: this.analyzeExpectationMismatch(record),
        troubleshooting: this.getExpectationMismatchTroubleshooting(record),
      });
    }
  }

  // AI Analysis Methods
  static analyzeStateTransition(transition, prevState) {
    const analysis = {
      isExpectedTransition: this.isExpectedStateTransition(
        transition.from,
        transition.to,
      ),
      transitionSpeed:
        transition.duration < 1000
          ? "FAST"
          : transition.duration < 5000
            ? "NORMAL"
            : "SLOW",
      potentialIssues: [],
      recommendations: [],
    };

    if (!analysis.isExpectedTransition) {
      analysis.potentialIssues.push("UNEXPECTED_STATE_TRANSITION");
      analysis.recommendations.push(
        "Check if client is following correct protocol flow",
      );
    }

    if (analysis.transitionSpeed === "SLOW") {
      analysis.potentialIssues.push("SLOW_STATE_TRANSITION");
      analysis.recommendations.push(
        "Check for network delays or processing bottlenecks",
      );
    }

    return analysis;
  }

  static analyzeUserStateTransition(transition, prevState) {
    const analysis = {
      isLogicalProgression: this.isLogicalUserStateProgression(
        transition.from,
        transition.to,
      ),
      potentialIssues: [],
      recommendations: [],
    };

    if (!analysis.isLogicalProgression) {
      analysis.potentialIssues.push("ILLOGICAL_USER_STATE_PROGRESSION");
      analysis.recommendations.push(
        "Verify user authentication and authorization flow",
      );
    }

    return analysis;
  }

  static analyzeMessageFlow(recentFlow) {
    const analysis = {
      flowPattern: this.identifyFlowPattern(recentFlow),
      potentialDeadlock: this.detectPotentialDeadlock(recentFlow),
      responsiveness: this.analyzeResponseTimes(recentFlow),
      recommendations: [],
    };

    if (analysis.potentialDeadlock) {
      analysis.recommendations.push(
        "Check for message acknowledgment loops or blocked responses",
      );
    }

    return analysis;
  }

  static analyzeErrorPattern(pattern) {
    const analysis = {
      severity:
        pattern.count > 10 ? "HIGH" : pattern.count > 3 ? "MEDIUM" : "LOW",
      frequency: this.calculateErrorFrequency(pattern),
      trend: this.getErrorTrend(pattern),
      potentialCauses: this.identifyPotentialCauses(pattern),
      recommendations: [],
    };

    if (analysis.severity === "HIGH") {
      analysis.recommendations.push(
        "URGENT: This error pattern requires immediate attention",
      );
    }

    return analysis;
  }

  static analyzeProtocolViolation(record) {
    return {
      violationType: this.classifyProtocolViolation(record.violation),
      severity: this.assessViolationSeverity(record.violation),
      commonCause: this.getCommonViolationCause(record.violation),
      recommendations: this.getViolationRecommendations(record.violation),
    };
  }

  static analyzeExpectationMismatch(record) {
    return {
      mismatchType: this.classifyExpectationMismatch(record),
      likelyRootCause: this.identifyMismatchRootCause(record),
      clientImpact: this.assessClientImpact(record),
      recommendations: this.getMismatchRecommendations(record),
    };
  }

  // Troubleshooting Methods
  static getStateTransitionTroubleshooting(transition) {
    const troubleshooting = [];

    if (transition.from === "CONNECTED" && transition.to === "DISCONNECTED") {
      troubleshooting.push("Check network stability and server load");
      troubleshooting.push(
        "Verify client is properly handling keep-alive messages",
      );
    }

    if (
      transition.from === "AUTHENTICATING" &&
      transition.to === "AUTHENTICATION_FAILED"
    ) {
      troubleshooting.push("Verify database connectivity and user credentials");
      troubleshooting.push("Check for proper random key exchange");
    }

    return troubleshooting;
  }

  static getErrorTroubleshooting(errorKey, pattern) {
    const troubleshooting = [];

    if (errorKey.includes("Connection")) {
      troubleshooting.push("Check network configuration and firewall settings");
      troubleshooting.push(
        "Verify server is running and accepting connections",
      );
    }

    if (errorKey.includes("Database")) {
      troubleshooting.push("Check database server status and connectivity");
      troubleshooting.push("Verify database credentials and permissions");
    }

    if (pattern.count > 5) {
      troubleshooting.push(
        "RECURRING ISSUE: Consider implementing circuit breaker pattern",
      );
    }

    return troubleshooting;
  }

  static getProtocolViolationTroubleshooting(violation) {
    const troubleshooting = [];

    switch (violation) {
      case "MISSING_RANDOM_KEY":
        troubleshooting.push(
          "Ensure client requests random key before login attempt",
        );
        troubleshooting.push("Check if rndK system message is being sent");
        break;
      case "INVALID_XML_FORMAT":
        troubleshooting.push("Verify XML message structure and encoding");
        troubleshooting.push(
          "Check for proper XML escaping of special characters",
        );
        break;
      case "UNAUTHORIZED_EXTENSION":
        troubleshooting.push(
          "Verify user is authenticated before extension calls",
        );
        troubleshooting.push("Check extension permissions and access controls");
        break;
    }

    return troubleshooting;
  }

  static getExpectationMismatchTroubleshooting(record) {
    const troubleshooting = [];

    if (
      record.expectation.includes("SUCCESS") &&
      record.actualOutcome.includes("ERROR")
    ) {
      troubleshooting.push("Check server-side validation and error handling");
      troubleshooting.push("Verify all required parameters are present");
    }

    return troubleshooting;
  }

  // Helper Methods for Analysis
  static isExpectedStateTransition(from, to) {
    const validTransitions = {
      NONE: ["CONNECTING"],
      CONNECTING: ["CONNECTED", "FAILED"],
      CONNECTED: ["AUTHENTICATING", "DISCONNECTED"],
      AUTHENTICATING: ["AUTHENTICATED", "AUTHENTICATION_FAILED"],
      AUTHENTICATED: ["DISCONNECTED", "IN_ROOM"],
      IN_ROOM: ["DISCONNECTED", "CHANGING_ROOM"],
    };

    return (validTransitions[from] || []).includes(to);
  }

  static isLogicalUserStateProgression(from, to) {
    const logicalProgression = {
      NONE: ["CONNECTING"],
      CONNECTING: ["CONNECTED"],
      CONNECTED: ["LOGGING_IN"],
      LOGGING_IN: ["LOGGED_IN", "LOGIN_FAILED"],
      LOGGED_IN: ["JOINING_ROOM", "DISCONNECTED"],
      JOINING_ROOM: ["IN_ROOM", "JOIN_FAILED"],
      IN_ROOM: ["LEAVING_ROOM", "DISCONNECTED"],
    };

    return (logicalProgression[from] || []).includes(to);
  }

  static identifyFlowPattern(recentFlow) {
    if (recentFlow.length < 2) return "INSUFFICIENT_DATA";

    const incomingCount = recentFlow.filter(
      (f) => f.direction === "incoming",
    ).length;
    const outgoingCount = recentFlow.filter(
      (f) => f.direction === "outgoing",
    ).length;

    if (incomingCount > outgoingCount * 2) return "CLIENT_HEAVY";
    if (outgoingCount > incomingCount * 2) return "SERVER_HEAVY";
    return "BALANCED";
  }

  static detectPotentialDeadlock(recentFlow) {
    // Simple deadlock detection: multiple incoming messages without responses
    let consecutiveIncoming = 0;
    for (const flow of recentFlow.reverse()) {
      if (flow.direction === "incoming") {
        consecutiveIncoming++;
      } else {
        break;
      }
    }
    return consecutiveIncoming > 3;
  }

  static analyzeResponseTimes(recentFlow) {
    const times = [];
    for (let i = 1; i < recentFlow.length; i++) {
      const timeDiff = recentFlow[i].timestamp - recentFlow[i - 1].timestamp;
      times.push(timeDiff);
    }

    if (times.length === 0) return "NO_DATA";

    const avg = times.reduce((a, b) => a + b) / times.length;
    return avg < 100 ? "FAST" : avg < 1000 ? "NORMAL" : "SLOW";
  }

  static calculateErrorFrequency(pattern) {
    const timeSpan = pattern.lastSeen - pattern.firstSeen;
    if (timeSpan === 0) return "SINGLE_OCCURRENCE";

    const frequency = pattern.count / (timeSpan / 1000); // errors per second
    return frequency > 0.1 ? "HIGH" : frequency > 0.01 ? "MEDIUM" : "LOW";
  }

  static getErrorTrend(pattern) {
    if (pattern.contexts.length < 3) return "INSUFFICIENT_DATA";

    const recent = pattern.contexts.slice(-3);
    const timeGaps = [];

    for (let i = 1; i < recent.length; i++) {
      timeGaps.push(recent[i].timestamp - recent[i - 1].timestamp);
    }

    const avgGap = timeGaps.reduce((a, b) => a + b) / timeGaps.length;
    return avgGap < 5000
      ? "INCREASING"
      : avgGap > 30000
        ? "DECREASING"
        : "STABLE";
  }

  static identifyPotentialCauses(pattern) {
    const causes = [];

    // Analyze contexts for common factors
    const connectionIds = pattern.contexts.map((c) => c.connectionId);
    const uniqueConnections = [...new Set(connectionIds)];

    if (uniqueConnections.length === 1) {
      causes.push("SINGLE_CONNECTION_ISSUE");
    }

    if (pattern.count > 10) {
      causes.push("SYSTEMATIC_ISSUE");
    }

    return causes;
  }

  static classifyProtocolViolation(violation) {
    if (violation.includes("XML")) return "PARSING_ERROR";
    if (violation.includes("AUTH")) return "AUTHENTICATION_ERROR";
    if (violation.includes("EXTENSION")) return "EXTENSION_ERROR";
    return "UNKNOWN_VIOLATION";
  }

  static assessViolationSeverity(violation) {
    const highSeverityViolations = [
      "MISSING_RANDOM_KEY",
      "UNAUTHORIZED_EXTENSION",
    ];
    const mediumSeverityViolations = [
      "INVALID_XML_FORMAT",
      "MISSING_REQUIRED_FIELD",
    ];

    if (highSeverityViolations.some((v) => violation.includes(v)))
      return "HIGH";
    if (mediumSeverityViolations.some((v) => violation.includes(v)))
      return "MEDIUM";
    return "LOW";
  }

  static getCommonViolationCause(violation) {
    const causes = {
      MISSING_RANDOM_KEY: "Client not following proper authentication flow",
      INVALID_XML_FORMAT: "Client sending malformed XML messages",
      UNAUTHORIZED_EXTENSION: "Extension called before proper authentication",
    };

    return causes[violation] || "Unknown cause";
  }

  static getViolationRecommendations(violation) {
    const recommendations = {
      MISSING_RANDOM_KEY: [
        "Ensure client requests random key before login",
        "Check authentication flow implementation",
      ],
      INVALID_XML_FORMAT: [
        "Validate XML message structure",
        "Check XML encoding and escaping",
      ],
      UNAUTHORIZED_EXTENSION: [
        "Verify authentication before extension calls",
        "Check user session state",
      ],
    };

    return (
      recommendations[violation] || [
        "Review protocol implementation",
        "Check client-server communication flow",
      ]
    );
  }

  static classifyExpectationMismatch(record) {
    if (
      record.expectation.includes("SUCCESS") &&
      record.actualOutcome.includes("ERROR")
    ) {
      return "SUCCESS_TO_ERROR_MISMATCH";
    }
    if (
      record.expectation.includes("LOGIN") &&
      record.actualOutcome.includes("FAILED")
    ) {
      return "LOGIN_EXPECTATION_MISMATCH";
    }
    return "GENERAL_MISMATCH";
  }

  static identifyMismatchRootCause(record) {
    if (
      record.expectation.includes("LOGIN") &&
      record.actualOutcome.includes("FAILED")
    ) {
      return "AUTHENTICATION_ISSUE";
    }
    if (
      record.expectation.includes("JOIN") &&
      record.actualOutcome.includes("FAILED")
    ) {
      return "ROOM_ACCESS_ISSUE";
    }
    return "UNKNOWN_ROOT_CAUSE";
  }

  static assessClientImpact(record) {
    if (record.expectation.includes("LOGIN")) return "HIGH";
    if (record.expectation.includes("JOIN")) return "MEDIUM";
    return "LOW";
  }

  static getMismatchRecommendations(record) {
    const recommendations = [];

    if (record.actualOutcome.includes("ERROR")) {
      recommendations.push("Check server-side error handling and validation");
      recommendations.push("Verify all required parameters are provided");
    }

    if (record.expectation.includes("LOGIN")) {
      recommendations.push("Verify user credentials and database connectivity");
      recommendations.push("Check authentication flow and random key exchange");
    }

    return recommendations;
  }

  // Utility method to get comprehensive debugging report
  static getComprehensiveReport(connectionId) {
    return {
      connectionState: this.connectionStates.get(connectionId),
      messageFlow: this.messageFlows.get(connectionId),
      protocolViolations: this.protocolViolations.get(connectionId),
      clientExpectations: this.clientExpectations.get(connectionId),
      errorPatterns: Array.from(this.errorPatterns.entries()).filter(
        ([key, pattern]) =>
          pattern.contexts.some((ctx) => ctx.connectionId === connectionId),
      ),
      aiRecommendations: this.generateAIRecommendations(connectionId),
    };
  }

  static generateAIRecommendations(connectionId) {
    const recommendations = [];

    const connectionState = this.connectionStates.get(connectionId);
    if (connectionState && connectionState.current === "DISCONNECTED") {
      recommendations.push(
        "CONNECTION_LOST: Check network stability and reconnection logic",
      );
    }

    const violations = this.protocolViolations.get(connectionId);
    if (violations && violations.length > 0) {
      recommendations.push(
        "PROTOCOL_VIOLATIONS_DETECTED: Review client protocol implementation",
      );
    }

    const expectations = this.clientExpectations.get(connectionId);
    if (expectations) {
      const unmetExpectations = expectations.filter((e) => !e.met);
      if (unmetExpectations.length > 0) {
        recommendations.push(
          "UNMET_CLIENT_EXPECTATIONS: Review server response logic",
        );
      }
    }

    return recommendations;
  }
}

// Performance monitoring
class PerformanceMonitor {
  static timers = new Map();

  static start(label) {
    if (DEBUG_CONFIG.LOG_PERFORMANCE) {
      this.timers.set(label, {
        start: Date.now(),
        memory: process.memoryUsage(),
      });
    }
  }

  static end(label) {
    if (DEBUG_CONFIG.LOG_PERFORMANCE && this.timers.has(label)) {
      const timer = this.timers.get(label);
      const duration = Date.now() - timer.start;
      const currentMemory = process.memoryUsage();
      const memoryDiff = {
        rss: currentMemory.rss - timer.memory.rss,
        heapUsed: currentMemory.heapUsed - timer.memory.heapUsed,
        heapTotal: currentMemory.heapTotal - timer.memory.heapTotal,
      };

      DebugLogger.perf(`${label} completed`, {
        duration: `${duration}ms`,
        memoryUsage: {
          current: {
            rss: `${Math.round(currentMemory.rss / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(currentMemory.heapUsed / 1024 / 1024)}MB`,
          },
          diff: {
            rss: `${memoryDiff.rss >= 0 ? "+" : ""}${Math.round(memoryDiff.rss / 1024 / 1024)}MB`,
            heapUsed: `${memoryDiff.heapUsed >= 0 ? "+" : ""}${Math.round(memoryDiff.heapUsed / 1024 / 1024)}MB`,
          },
        },
      });

      this.timers.delete(label);
    }
  }
}

// Server configuration
const CONFIG = {
  // Allow ports to be overridden by environment vars
  SOCKET_PORT:
    parseInt(
      process.env.SOCKET_PORT || process.env.VTWEENS_SOCKET_PORT || "",
      10,
    ) || 9339,
  HTTP_PORT:
    parseInt(
      process.env.HTTP_PORT || process.env.VTWEENS_HTTP_PORT || "",
      10,
    ) || 8080,
  MAX_USERS_PER_ROOM: 50,
  MAX_ROOMS: 1000,
  VERSION: {
    MAJOR: 1,
    MINOR: 5,
    SUB: 6,
  },
  // Game assets root. Prefer env, else fall back to prior default.
  // NOTE: If your avatars/rooms don't render, set GAME_PATH to the folder that contains
  // directories like `world_rooms`, `items`, `images`, `npcs`, and `map/paths.json`.
  GAME_PATH:
    process.env.GAME_PATH ||
    process.env.VTWEENS_GAME_PATH ||
    path.join(__dirname, "ekoloko", "ekoloko"),
  DB: {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "postgres",
    database: process.env.DB_NAME || "vtweens_game",
    password: process.env.DB_PASSWORD || "",
    port: parseInt(process.env.DB_PORT || "", 10) || 5432,
  },
};

// Protocol constants
const PROTOCOL = {
  MSG_XML: "<",
  MSG_JSON: "{",
  MSG_STR: "%",
  EOM: 0,

  // Message types
  XTMSG_TYPE_XML: "xml",
  XTMSG_TYPE_JSON: "json",
  XTMSG_TYPE_STR: "str",

  // Extension IDs from ZONEEXTENSIONS.as
  EXTENSIONS: {
    LoginExtension: "0",
    RoomData: "1",
    ItemData: "2",
    PlayerData: "3",
    ThrowingGame: "4",
    QuestController: "5",
    Recycle: "6",
    MessagingExtension: "7",
    NPCExtension: "8",
    GameExtension: "9",
    OneOnOne: "10",
    RecyclingGame: "11",
    Store: "12",
    Emoticons: "13",
    GiftExtension: "14",
    PickGiftExtension: "15",
    ShowGiftsExtension: "16",
    CommunityDataExtension: "17",
    MoneyDonationExtension: "18",
    Chat: "19",
    TeleportPlayer: "20",
    Logout: "21",
    Tutorial: "22",
    Newspapper: "23",
    RangerMessages: "24",
    RemoveChatExtension: "25",
    PokeBlocked: "26",
    Snitch: "27",
    PioneerStore: "28",
    AnimalEmoticon: "29",
    AnimalGamePlayed: "30",
    BuyAnimal: "31",
    BuyAnimalFood: "32",
    CleanAnimal: "33",
    GetAnimalStore: "34",
    UserVarsChangeExtension: "35",
    StaticDataExtension: "36",
    TradeRequestExtension: "37",
    TradeAcceptExtension: "38",
    TradeRejectExtension: "39",
    TradeCancelExtension: "40",
    TradeTxAbort: "41",
    TradeTxClearSlot: "42",
    TradeTxComplete: "43",
    TradeTxPutInventoryItem: "44",
    TradeTxPutRecycleItem: "45",
    HideAnimalExtension: "46",
    ShowAnimalExtension: "47",
    TradeTxExit: "48",
    TradeTxLock: "49",
    CampaignDonate: "50",
    CampaignVote: "51",
    CampaignPromote: "52",
    RandomEventCompletedExtension: "53",
    RandomEventRejectedExtension: "54",
    CollectionRandomEventCompletedExtension: "55",
    BuyHouseGardenPlantExtension: "56",
    HouseGardenPlantOperationExtension: "57",
    UpgradeHouseGardenLevelExtension: "58",
    BuyHouseItemExtension: "59",
    EnterHouseRoomExtension: "60",
    GetHouseStorageExtension: "61",
    PlaceHouseItemExtension: "62",
    ReplaceHouseExtension: "63",
    SellHouseItemExtension: "64",
    UpgradeHouseElectricLevelExtension: "65",
    UpgradeHouseSizeExtension: "66",
    BuyHouseExtension: "67",
    GetHouseStaticDataExtension: "68",
    LockHouseExtension: "69",
    HouseRoomEventExtension: "70",
    BasicTutorialCompletedExtension: "71",
    GetNewSecurityFormData: "72",
    GetSecurityCheckData: "73",
    FillSecurityFormData: "74",
    CheckSecurityCheckData: "75",
    AddAlbumExtension: "76",
    AddCardPackExtension: "77",
    CardDataExtension: "78",
    CardInventoryDataExtension: "79",
    CardPackWaitingDataExtension: "80",
    LockCardExtension: "81",
    PingExtension: "82",
    TradeTxPutCard: "83",
    OpenCardPackWaitingExtension: "84",
    RandomEventCompletedAckExtension: "85",
    DeactivateSecurityCode: "86",
    GeneratePlayerSecurityCode: "87",
    ValidateSecurityCode: "88",
    BuyCreditsStoreProductInstance: "89",
    GetCreditsStore: "90",
    CreditsStoreStaticDataExtension: "91",
    ItemsData: "92",
    GetSecurityFormData: "93",
    ResetPlayerSecurityForm: "94",
    CardsStaticDataExtension: "95",
    UsePotionExtension: "96",
    BuyPotionExtension: "97",
    GetPotionStoreExtension: "98",
    LockPotionsExtension: "99",
    HelperFlowExtension: "100",
    RecyclingCollectionTargetExtension: "101",
    DaysPlayedRewardCompletedExtension: "102",
    HelperAuditExtension: "103",
    RemoveBuddyExtension: "104",
    ApproveBuddyRequestExtension: "105",
    AddBuddyExtension: "106",
    SetSkinExtension: "107",
    SetImageExtension: "108",
    SetMoodExtension: "109",
    GetUserVarsExtension: "110",
    TeleportToUserExtension: "111",
    InitMultiplayerTask: "112",
    JoinMultiplayerTask: "113",
    LoadedMultiplayerTask: "114",
    ExitMultiplayerTask: "115",
    CompleteMultiplayerTask: "116",
    AcceptedToMultiplayerTask: "117",
    RejectFromMultiplayerTask: "118",
    SendCommandToMPTask: "119",
    FailedMultiplayerTask: "120",
    HitLifeTrapExtension: "121",
    RangerGiveGoldExtension: "122",
  },

  // Commands from COMMANDS.as
  COMMANDS: {
    // Core login and errors
    V_VERSION: "20",
    V_COMMAND: "21",
    V_ERROR: "22",
    S_LOGIN_OK: "23",
    S_LOGIN_ERROR: "24",
    V_SFS_UID: "25",
    V_USER_VARS: "26",
    V_USER_NAME: "27",
    V_SERVER_TIMESTAMP: "28",
    V_FIRST_LOGIN: "29",
    V_IS_PREMIUM: "30",
    V_PREMIUM_DAYS_LEFT: "31",
    V_EMAIL: "32",
    V_ACTIVATED: "33",

    // Items / inventory / store basics
    C_SET_ITEM: "34",
    V_ITEM: "35",
    V_ITEM_ID: "36",
    V_ITEM_TYPE: "37",
    C_GET_INVENTORY: "38",
    C_GET_PLAYER_PUBLIC_DATA: "39",
    C_GET_ITEM_DATA: "40",

    // Rooms
    C_GET_ROOM: "41",
    V_ROOM_ID: "42",
    V_PORTAL_ID: "43",
    V_ROOM_NPCS: "44",
    V_ROOM_DATA: "45",
    C_ROOM_ENTER: "46",
    C_PICK_RECYCLE_ITEM: "47",
    C_GET_ROOM_RECYCLE_ITEMS: "48",
    C_GET_PLAYER_RECYCLE_ITEMS: "49",
    C_DEPOSIT_RECYCLE_ITEMS: "50",
    C_GET_RECYCLE_ITEMS_DATA: "51",
    V_RECYCLE_ITEMS_DATA: "52",
    C_GET_RECYCLE_BIN_DATA: "53",
    V_BIN_ID: "54",
    C_GET_NPC_GAMES: "55",
    V_NPC_GAMES: "56",

    // Games / quiz
    V_GAMES_DATA: "57",
    V_GAMES_1_1_DATA: "58",
    V_GAMES_SINGLE_DATA: "59",
    V_GAMES_IN_WORLD_DATA: "60",
    V_QUIZ_DATA: "61",
    V_REQUEST_ID: "62",
    C_POKE_USER: "63",
    C_REQUEST_CHAT: "64",
    V_MESSAGE: "65",
    C_ACCEPT_CHAT: "66",
    C_REJECT_CHAT: "67",
    C_CANCEL_CHAT: "68",
    V_FROM_ROOM_ID: "69",
    C_THROW_ITEM: "70",
    V_PX: "71",
    V_PY: "72",
    V_TOP_X: "73",
    V_TOP_Y: "74",
    V_HIT: "75",
    V_COUNT: "76",
    C_THROWING_GAME_START: "77",
    C_THROW_GAME_TIMEOUT: "78",
    C_QUEST_STAGE_ACCEPTED: "79",
    C_QUEST_STAGE_FINISHED: "80",
    C_GAME_ENTER: "81",
    C_GAME_EXIT: "82",
    C_GAME_START: "83",
    C_QUIZ_START: "84",
    C_QUIZ_OVER: "85",
    C_GAME_OVER: "86",
    V_GAME_LEVEL: "87",
    V_GAME_SCORE: "88",
    V_REWARD_ACTIVITY_POINTS: "89",
    V_REWARD_GOLD: "90",
    V_REWARD_ITEM: "91",
    V_GAME_TOKEN: "92",
    V_GAME_ID: "93",
    C_1_1_GAME_REQUEST: "94",
    C_1_1_GAME_REJECT: "95",
    C_1_1_GAME_ACCEPT: "96",
    C_1_1_GAME_CANCEL: "97",
    C_1_1_GAME_EXIT: "98",
    C_1_1_GAME_OP: "99",
    C_SUBSTRUCT_LEAD_POINT: "100",
    C_ADD_LEAD_POINT: "101",

    // Store
    C_GET_STORE_DATA: "102",
    C_SELL_ITEM: "103",
    C_BUY_ITEM: "104",
    C_GET_CHANNELS_STATUS: "105",
    C_SEND_EMOTICON: "106",
    V_EMOTICON_ID: "107",
    C_GET_HIGH_SCORES: "108",
    C_SHARE_FACEBOOK: "109",
    C_APPLY_FOR_RANGER: "110",
    V_SHOULD_SHARE: "111",

    // Common data keys
    V_ITEMS: "122",
    S_STATIC_DATA: "244",
    V_STORE_DATA: "229",
    V_NPCS_DATA: "164",
    V_EMOTICONS_DATA: "243",
    V_ANIMAL_GAMES: "289",
    V_SENIORITY_LEVELS: "335",
    V_PLAYER_ICONS: "621",
    V_PLAYER_MOODS: "623",
    V_PLAYER_COLORS: "622",
    V_POTIONS_DATA: "559",
    V_MULTIPLAYER_TASKS: "631",

    // Room data responses (must match ActionScript COMMANDS.as)
    S_ROOM_DATA: "126",
    V_PORTALS: "127",
    V_ROOM_SWF: "128",
    V_ROOM_SOUND: "129",
    S_ROOM_DATA_ERROR: "130",

    // Cards static
    V_ALL_ALBUMS_DATA: "448",
    V_ALL_CARD_SETS: "465",
    V_ACTIVE_CARD_PACKS_SERIES_IDS: "514",
    V_ALL_CARDS: "522",
    S_CARDS_STATIC_DATA: "523",
    V_CARD_PACK_WAITING_ITEMS: "441",
    S_CARD_PACK_WAITING_ITEMS: "460",

    // Credits store
    V_CREDITS_STORE_PRODUCTS_DATA: "498",
    V_CREDITS_STORE_DISCOUNTS: "499",
    S_CREDITS_STORE_STATIC_DATA: "500",
    S_CREDITS_STORE_DATA: "501",
    V_CREDITS_STORE_DATA: "504",
    V_CREDITS_STORE_PRODUCTS: "505",
    V_CREDITS_STORE_VERSION: "506",
    V_CREDITS_STORE_CREDITS: "507",
    V_CREDITS_STORE_PRODUCTS_LEFT: "510",

    // House static
    S_HOUSE_STATIC_DATA: "364",
    V_HOUSE_ITEMS: "378",
    V_HOUSE_ITEM_TYPES: "379",
    V_HOUSE_TYPES: "380",

    // Login payload extras
    V_PARAMS: "191",
    V_QUESTS_TASKS: "218",
    V_IS_EVENT_OPEN: "276",
    V_ANIMAL_DATA: "285",
    V_ANIMAL_DAYS_LEFT: "290",
    V_INVENTORY_FULL_ANIMAL: "293",
    V_INVENTORY_WAITING_ITEMS: "294",
    V_DONATION_CAMPAIGN: "324",
    V_VOTE_DATA: "325",
    V_RENEWAL_REWARD_DAYS_LEFT: "332",
    V_RENEWAL_REWARD: "333",
    V_SENORITY_REWARD: "334",
    V_SPECIAL_OFFER_DAYS_LEFT: "337",
    V_SPECIAL_OFFER: "338",
    V_HAS_PAYED: "339",
    V_PROMOTE_FACEBOOK: "340",
    V_AFFILIATE: "350",
    V_AFFILIATE_REWARD: "351",
    V_GARDENER_POINTS: "395",
    V_GARDENER_LEVEL: "396",
    V_ACTIVATION_PRODUCT: "402",
    V_DEFAULT_ANIMAL_STORE_ID: "403",
    V_ANIMAL_ALLOWED: "400",
    V_HOUSE_ALLOWED: "401",
    V_DAILY_REWARD_CARD: "450",
    V_DEFAULT_ANIMAL_ID: "573",
    V_DAILY_REWARD: "579",
    V_IS_CHALLENGE_EVENT_OPEN: "599",
    V_AGE: "609",
    V_IS_GROUP_CHALLENGE_EVENT_OPEN: "610",

    // Additional commands synced from ActionScript COMMANDS.as (to support full extensions)
    // Gifts
    V_GIFT_ITEM_TYPE: "113",
    V_GIFT_ITEM_QUANTITY: "114",
    S_GIFT_ITEM_THROWN_ACK: "115",
    S_GIFT_ITEM_PICKED: "116",

    // Teleport and room name
    V_ROOM_NAME: "299",
    S_TELEPORT: "307",
    S_TELEPORT_TO_USER_ROOM_ID: "628",

    // Messaging and moderation
    S_RANGER_MESSAGE: "319",
    S_CAMPAIGN_DONATE: "323",
    S_CAMPAIGN_VOTE: "327",
    S_PROMOTE_TARGET: "329",
    V_WORD: "520",
    S_CHAT_WARN_WORD: "521",

    // Emoticons/static
    S_EMOTICONS_DATA: "528",

    // House (dynamic operations)
    S_HOUSE_BOUGHT: "352",
    S_HOUSE_REPLACED: "353",
    S_HOUSE_ELECTRIC_LEVEL_BUY: "354",
    S_HOUSE_GARDEN_LEVEL_BUY: "355",
    S_HOUSE_BUY_ITEM: "356",
    S_HOUSE_BUY_PLANT: "358",
    S_HOUSE_GARDEN_PALNT_OP: "359",
    S_HOUSE_SELL_ITEM: "360",
    S_HOUSE_ITEMS_PLACED: "361",
    S_HOUSE_GET_STORAGE_ITEMS: "362",
    S_HOUSE_LOCKED: "366",
    S_HOUSE_SIZE_CHANGE: "368",
    S_HOUSE_ROOM_RESPONSE: "390",
    S_HOUSE_ROOM_EVENT: "406",

    V_HOUSE_TYPE_ID: "369",
    V_HOUSE_ITEM: "372",
    V_HOUSE_CHANGES: "374",
    V_HOUSE_GARDEN_INVENTORY_PLANT: "375",
    V_HOUSE_GARDEN_PLANT_ID: "376",
    V_HOUSE_GARDEN_OP: "377",
    V_PLAYER_HOUSE: "383",
    V_MAX_ELECTRIC_UNITS: "384",
    V_MAX_GARDEN_TILES: "385",
    V_DAYS_TO_UPGRADE_GARDEN: "386",
    V_DAYS_TO_UPGRADE_ELECTRIC: "387",
    V_HOUSE_ELECTRIC_LEVELS: "388",
    V_HOUSE_GARDEN_LEVELS: "389",
    V_HOUSE_ROOM_EVENT_ID: "407",
    V_HOUSE_ROOM_EVENT_TYPE: "408",

    // Security codes
    V_CODE: "477",
    S_NEW_SECURITY_CODE: "479",
    S_CODE_INVALIDATED: "480",
    S_SECURITY_CODE_VALID: "482",

    // Cards
    S_CARD_PACK_DATA: "462",
    V_CARD_PACK: "443",

    // Potions
    S_GET_POTION_INVENTORY: "556",
    S_USE_POTION: "557",
    S_POTION_INVENTORY_DATA: "558",
    V_POTION_ID: "561",
    S_BUY_POTION: "562",
    V_CONSUMER_ID: "563",
    S_GET_POTION_STORE_DATA: "564",
    V_POTIONS_QUANTITY: "565",

    // Multiplayer tasks
    V_TASK_ID: "632",
    V_TASK_INSTANCE_ID: "633",
    V_USERS_STATE: "634",
    S_MULTIPLAYER_TASK_INIT: "635",
    S_MULTIPLAYER_TASK_EXIT: "638",
    S_MULTIPLAYER_TASK_COMPLETED: "639",
    S_MULTIPLAYER_TASK_LOADED_ACK: "641",
    S_MULTIPLAYER_TASK_START: "642",
    S_MULTIPLAYER_TASK_EXIT_INIT_REJECT: "648",
    V_MP_TASK_COMMAND: "650",
    S_MULTIPLAYER_USER_COMMAND: "652",

    // Life trap / gold
    V_TRAP_ID: "669",
    S_TELEPORT_LOST_LIFE: "671",
    S_ADD_GOLD: "311",

    // Other
    S_OTHER_USER_DATA: "624",
    S_POKE_BLOCKED: "213",
  },

  // User variables from USERVARIABLES.as
  USERVARIABLES: {
    UID: "0",
    INITIAL_ROOM: "1",
    PORTAL_ID: "2",
    EMOTION_ID: "3",
    GAME_ID: "4",
    ONE_ON_ONE_GAME_ID: "5",
    ONE_ON_ONE_ROOM_ID: "6",
    PX: "7",
    PY: "8",
    SPEED: "9",
    LEVEL: "10",
    LEADERSHIP: "11",
    IS_PREMIUM: "12",
    FACE_DIRECTION: "13",
    AVATAR_GENDER: "14",
    AVATAR_SKINTONE: "15",
    AVATAR_EYES: "16",
    AVATAR_MOUTH: "17",
    AVATAR_HAIR: "18",
    AVATAR_COAT: "19",
    AVATAR_SHIRT: "20",
    AVATAR_PANTS: "21",
    AVATAR_SHOES: "22",
    AVATAR_EARINGS: "23",
    AVATAR_NECKLACE: "24",
    AVATAR_GLASSES: "25",
    AVATAR_RING: "26",
    AVATAR_HOVERINGITEM: "27",
    AVATAR_HAT: "28",
    RECYCLE_INVENTORY_TYPE: "29",
    LOCALE: "30",
    ACTIVE_MOD: "31",
    RANGER_LEVEL: "32",
    AVATAR_SKATES: "33",
    AVATAR_MAKEUP: "34",
    MAY_CHANGE_LEAD: "35",
    IS_MOD: "36",
    ANIMAL: "37",
    ANIMAL_TYPE_LEVEL: "38",
    ANIMAL_GAME_ID: "39",
    IS_TRADING: "40",
    CAMPAIGN_TARGET: "41",
    SENIORITY_LEVEL: "42",
    HOUSE_TYPE: "43",
    HOUSE_LOCKED: "44",
    HOUSE_USER_ID: "45",
    HPX: "46",
    HPY: "47",
    HOUSE_FACE_DIRECTION: "48",
    HOUSE_EDIT_MODE: "49",
    IN_TUTORIAL_MODE: "50",
    IS_IN_CREDITSSTORE: "51",
    ALLOW_POTIONS: "52",
    ADVISOR_LEVEL: "53",
    EVENT_GROUP_ID: "54",
    IMAGE: "55",
    MOOD: "56",
    SKIN: "57",
    NAME: "58",
    ACTIVE_MULTIPLAYER_TASK_INSTANCE_ID: "59",
    ACTIVE_MULTIPLAYER_TASK_ID: "60",
    ACTIVE_MULTIPLAYER_TASK_INSTANCE_TASK_ID: "61",
    LIFE_LEVEL_DATA: "62",
    LAST_SAVED_ROOM_AT_LIFE_LOSS: "63",
    LAST_HIT_TRAP_TIME: "64",
    LAST_UV_CHANGE: "65",
    EVENTS_SINCE_LAST_UV_CHANGE: "66",
  },

  // Player params keys from PLAYER.as
  PLAYER: {
    ID: "0",
    LEVEL: "2",
    LEVEL_TARGET: "3",
    GOLD: "4",
    ACTIVITY_POINTS: "10",
    MOD: "11",
    LEADER: "12",
    GENDER: "13",
    MAY_CHANGE_LEAD: "16",
    ONE_ON_ONE_GAMES: "17",
    RANGER_LEVEL: "19",
    NO_CHAT_UNTIL: "25",
    MINUTES_PLAYED: "26",
    NEW_PREMIUM: "30",
    PIONEER_POINTS: "32",
    DAYS_FOR_NEXT_SENIORITY_LEVEL: "33",
    SENIORITY_DAYS_PLAYED: "34",
    SENIORITY_LEVEL: "35",
    RANGER_APPLICABLE: "37",
    DAYS_PLAYED: "40",
    GREEN_RANGER_APPLICABLE: "49",
    SENIOR_RANGER_APPLICABLE: "50",
    TUTORIAL_STEP: "41",
    ANIMALS_ADOPTED: "52",
    HELPER_FLOW: "53",
    TUTORIAL_ID: "54",
  },

  // Numeric keys used by the Flash client (ROOM.as)
  ROOM: {
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
  },

  // Numeric keys used by the Flash client (PORTAL.as)
  PORTAL: {
    ID: "0",
    ROOM_A: "1",
    ROOM_B: "2",
    STATE: "3",
  },

  // Numeric keys used by the Flash client (NPC.as)
  NPC: {
    ID: "0",
    NAME: "1",
    HISTORY: "2",
    BLUBBLE: "3",
    URL: "4",
    PX: "5",
    PY: "6",
    MSGS: "7",
    ROOM_ID: "8",
    PREMIUM_ONLY: "9",
  },
};

// Database client
let dbClient = null;

// Server data structures
class User {
  constructor(id, name, socket) {
    this.id = id;
    this.name = name;
    this.socket = socket;
    this.variables = {
      // Avatar position and appearance - CRITICAL for avatar rendering
      // Using correct USERVARIABLES mapping from ActionScript
      [USERVARIABLES.PX]: 100, // X position
      [USERVARIABLES.PY]: 100, // Y position  
      [USERVARIABLES.FACE_DIRECTION]: 0, // Direction action id (ActionsMapping.FACE_S = 0)
      [USERVARIABLES.SKIN]: 1, // Avatar skin - CRITICAL for avatar display
      [USERVARIABLES.MOOD]: 1, // Avatar mood/emotion - CRITICAL for avatar display
      [USERVARIABLES.IMAGE]: 0, // Avatar image/icon - CRITICAL for avatar display
      [USERVARIABLES.AVATAR_GENDER]: 0, // Gender (0=male, 1=female)
      [USERVARIABLES.LEVEL]: 1, // Player level
      [USERVARIABLES.LEADERSHIP]: 0, // Leadership points
      [USERVARIABLES.IS_PREMIUM]: 0, // Premium status (Flash expects numeric flag)
      [USERVARIABLES.AVATAR_SKINTONE]: 1, // Skin tone
      [USERVARIABLES.AVATAR_EYES]: 1, // Eye type
      [USERVARIABLES.AVATAR_MOUTH]: 1, // Mouth type
      [USERVARIABLES.AVATAR_HAIR]: 1, // Hair style
      [USERVARIABLES.AVATAR_COAT]: 0, // Coat/jacket
      [USERVARIABLES.AVATAR_SHIRT]: 0, // Shirt (0 = none; safer default)
      [USERVARIABLES.AVATAR_PANTS]: 0, // Pants (0 = none; safer default)
      [USERVARIABLES.AVATAR_SHOES]: 0, // Shoes (0 = none; safer default)
      [USERVARIABLES.INITIAL_ROOM]: 101, // Initial room ID
      [USERVARIABLES.UID]: id, // SFS UID for Flash-side references
      [USERVARIABLES.NAME]: name, // Player name
    };
    this.isSpectator = false;
    this.isModerator = false;
    this.playerId = -1;
    this.currentRoom = null;
    this.buddyList = [];
    this.myBuddyVars = {};
    this.dbId = null;
    this.accountId = null;
    this.isLoggedIn = false;
    this.playerData = null;
    this.lastPing = Date.now();
  }

  setVariable(name, value) {
    this.variables[name] = value;
  }

  getVariable(name) {
    return this.variables[name];
  }

  getVariables() {
    return this.variables;
  }

  setVariables(vars) {
    for (let key in vars) {
      if (vars[key] !== null && vars[key] !== undefined) {
        this.variables[key] = vars[key];
      } else {
        delete this.variables[key];
      }
    }
  }

  clearVariables() {
    this.variables = {};
  }

  sendMessage(msg) {
    if (this.socket && !this.socket.destroyed) {
      try {
        const buffer = Buffer.from(msg + "\0", "utf8");
        this.socket.write(buffer);
      } catch (error) {
        console.error("Error sending message to user:", error);
      }
    }
  }
}

class Room {
  constructor(
    id,
    name,
    maxUsers = 50,
    maxSpectators = 10,
    isTemp = false,
    isGame = false,
    isPrivate = false,
    isLimbo = false,
  ) {
    this.id = id;
    this.name = name;
    this.maxUsers = maxUsers;
    this.maxSpectators = maxSpectators;
    this.isTemp = isTemp;
    this.isGame = isGame;
    this.isPrivate = isPrivate;
    this.isLimbo = isLimbo;
    this.users = new Map();
    this.spectators = new Map();
    this.variables = {};
    this.userCount = 0;
    this.spectatorCount = 0;
    this.myPlayerIndex = -1;
    this.dbData = null;
  }

  addUser(user, userId) {
    if (user.isSpectator && this.isGame) {
      this.spectators.set(userId, user);
      this.spectatorCount++;
    } else {
      this.users.set(userId, user);
      this.userCount++;
    }
    user.currentRoom = this;
  }

  removeUser(userId) {
    const user = this.users.get(userId) || this.spectators.get(userId);
    if (!user) return;

    if (user.isSpectator && this.isGame) {
      this.spectators.delete(userId);
      this.spectatorCount--;
    } else {
      this.users.delete(userId);
      this.userCount--;
    }

    if (user.currentRoom === this) {
      user.currentRoom = null;
    }
  }

  getUser(userId) {
    return this.users.get(userId) || this.spectators.get(userId);
  }

  getUserList() {
    const allUsers = new Map();
    for (let [id, user] of this.users) {
      allUsers.set(id, user);
    }
    for (let [id, user] of this.spectators) {
      allUsers.set(id, user);
    }
    return allUsers;
  }

  clearUserList() {
    this.users.clear();
    this.spectators.clear();
    this.userCount = 0;
    this.spectatorCount = 0;
  }

  getVariable(name) {
    return this.variables[name];
  }

  getVariables() {
    return this.variables;
  }

  setVariables(vars) {
    for (let key in vars) {
      this.variables[key] = vars[key];
    }
  }

  clearVariables() {
    this.variables = {};
  }

  broadcastToRoom(message, exceptUser = null) {
    const allUsers = this.getUserList();
    for (let [userId, user] of allUsers) {
      if (exceptUser && user.id === exceptUser.id) continue;
      user.sendMessage(message);
    }
  }

  setUserCount(count) {
    this.userCount = count;
  }

  setSpectatorCount(count) {
    this.spectatorCount = count;
  }

  setMyPlayerIndex(index) {
    this.myPlayerIndex = index;
  }

  getMyPlayerIndex() {
    return this.myPlayerIndex;
  }

  setIsLimbo(limbo) {
    this.isLimbo = limbo;
  }

  isLimboRoom() {
    return this.isLimbo;
  }
}

class SmartFoxServer {
  constructor() {
    DebugLogger.info("SERVER", "Initializing SmartFoxServer Pro 1.6.6");
    PerformanceMonitor.start("SERVER_INIT");

    this.users = new Map();
    this.rooms = new Map();
    this.zones = new Map();
    this.nextUserId = 1;
    this.nextRoomId = 1000;
    this.stats = {
      startTime: Date.now(),
      totalConnections: 0,
      currentConnections: 0,
      totalMessages: 0,
      extensionsProcessed: 0,
      dbQueries: 0,
      errors: 0,
    };

    // Game file paths used by extensions (e.g., paths.json for portals)
    this.gamePaths = {
      mapPathsFile: path.join(CONFIG.GAME_PATH, "map", "paths.json"),
    };

    DebugLogger.debug("SERVER", "Core data structures initialized", {
      initialUserId: this.nextUserId,
      initialRoomId: this.nextRoomId,
    });

    // Initialize database
    this.initDatabase();

    // Create default zone and rooms
    this.initDefaultRooms();

    // Start socket server
    this.startSocketServer();

    // Start HTTP server
    this.startHttpServer();

    // Start performance monitoring
    this.startPerformanceMonitoring();

    PerformanceMonitor.end("SERVER_INIT");
    DebugLogger.info(
      "SERVER",
      "SmartFoxServer Pro 1.6.6 Node.js implementation started successfully",
    );
    DebugLogger.info(
      "SERVER",
      `Socket server listening on port ${CONFIG.SOCKET_PORT}`,
    );
    DebugLogger.info(
      "SERVER",
      `HTTP server listening on port ${CONFIG.HTTP_PORT}`,
    );
    DebugLogger.info(
      "SERVER",
      `Debug mode enabled - Level: ${DEBUG_CONFIG.LOG_LEVEL}`,
    );
  }

  async initDatabase() {
    DebugLogger.info("DB", "Initializing database connection");
    PerformanceMonitor.start("DB_INIT");

    try {
      DebugLogger.debug("DB", "Creating PostgreSQL client", CONFIG.DB);
      dbClient = new Client(CONFIG.DB);

      DebugLogger.debug("DB", "Connecting to database...");
      await dbClient.connect();

      DebugLogger.info("DB", "Successfully connected to PostgreSQL database");
      this.stats.dbConnected = true;

      // Test database connection
      const testResult = await dbClient.query(
        "SELECT NOW() as current_time, version() as pg_version",
      );
      DebugLogger.debug("DB", "Database connection test successful", {
        currentTime: testResult.rows[0].current_time,
        postgresVersion:
          testResult.rows[0].pg_version.split(" ")[0] +
          " " +
          testResult.rows[0].pg_version.split(" ")[1],
      });

      // Load rooms from database
      await this.loadRoomsFromDB();

      PerformanceMonitor.end("DB_INIT");
    } catch (error) {
      DebugLogger.error("DB", "Database connection failed", {
        error: error.message,
        code: error.code,
        host: CONFIG.DB.host,
        port: CONFIG.DB.port,
        database: CONFIG.DB.database,
      });
      this.stats.dbConnected = false;
      this.stats.errors++;
      DebugLogger.warn(
        "DB",
        "Server will continue without database functionality",
      );
    }
  }

  async loadRoomsFromDB() {
    if (!dbClient) {
      DebugLogger.warn("DB", "Skipping room loading - no database connection");
      return;
    }

    DebugLogger.info("DB", "Loading rooms from database");
    PerformanceMonitor.start("LOAD_ROOMS");

    try {
      this.stats.dbQueries++;
      const result = await dbClient.query("SELECT * FROM rooms ORDER BY id");

      DebugLogger.debug("DB", `Found ${result.rows.length} rooms in database`);

      for (let row of result.rows) {
        // IMPORTANT: Use numeric id string as room name for 1:1 client mapping (WorldRoom.sfsId)
        const room = new Room(
          row.id,
          `${row.id}`,
          50,
          10,
          false,
          false,
          row.premium,
          false,
        );
        room.dbData = row;
        this.rooms.set(row.id, room);

        DebugLogger.trace("DB", `Loaded room from database`, {
          id: row.id,
          name: room.name,
          maxUsers: room.maxUsers,
          premium: row.premium,
        });
      }

      DebugLogger.info(
        "DB",
        `Successfully loaded ${result.rows.length} rooms from database`,
      );
      PerformanceMonitor.end("LOAD_ROOMS");
    } catch (error) {
      DebugLogger.error("DB", "Error loading rooms from database", {
        error: error.message,
        code: error.code,
      });
      this.stats.errors++;
    }
  }

  initDefaultRooms() {
    DebugLogger.info("SERVER", "Initializing default rooms");
    PerformanceMonitor.start("INIT_DEFAULT_ROOMS");

    // Add some default rooms if none loaded from DB
    if (this.rooms.size === 0) {
      DebugLogger.info(
        "SERVER",
        "No rooms found in database; creating built-in default rooms",
      );

      const defaultRooms = [
        // IMPORTANT: Use numeric id string as name to match client lookups
        { id: 101, name: "101", maxUsers: 20, premium: false },
        { id: 102, name: "102", maxUsers: 20, premium: false },
        { id: 103, name: "103", maxUsers: 20, premium: false },
        { id: 501, name: "501", maxUsers: 30, premium: false },
        { id: 503, name: "503", maxUsers: 30, premium: false },
        { id: 701, name: "701", maxUsers: 18, premium: false },
        { id: 801, name: "801", maxUsers: 10, premium: true },
        { id: 830, name: "830", maxUsers: 15, premium: true },
      ];

      DebugLogger.debug(
        "SERVER",
        `Creating ${defaultRooms.length} default rooms`,
      );

      for (let roomData of defaultRooms) {
        const room = new Room(
          roomData.id,
          roomData.name,
          roomData.maxUsers,
          10,
          false,
          false,
          roomData.premium,
          false,
        );
        this.rooms.set(roomData.id, room);

        DebugLogger.trace("SERVER", `Created default room`, {
          id: roomData.id,
          name: roomData.name,
          maxUsers: roomData.maxUsers,
          premium: roomData.premium,
        });
      }

      DebugLogger.info(
        "SERVER",
        `Successfully created ${defaultRooms.length} default rooms`,
      );
    } else {
      DebugLogger.info(
        "SERVER",
        `Using ${this.rooms.size} rooms loaded from database`,
      );
    }

    PerformanceMonitor.end("INIT_DEFAULT_ROOMS");
  }

  startSocketServer() {
    DebugLogger.info("SERVER", "Starting socket server");

    this.socketServer = net.createServer((socket) => {
      const connectionId = `${socket.remoteAddress}:${socket.remotePort}_${Date.now()}`;
      this.stats.totalConnections++;
      this.stats.currentConnections++;

      // Track initial connection state
      StateTracker.trackConnectionState(connectionId, "CONNECTING", {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        timestamp: Date.now(),
      });

      DebugLogger.socket(`New socket connection established`, {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        connectionId: connectionId,
        totalConnections: this.stats.totalConnections,
        currentConnections: this.stats.currentConnections,
      });

      socket.buffer = Buffer.alloc(0);
      socket.sfsUser = null;
      socket.authenticated = false;
      socket.randomKey = null;
      socket.connectionId = connectionId;
      socket.connectionTime = Date.now();

      socket.on("data", (data) => {
        PerformanceMonitor.start(`HANDLE_DATA_${connectionId}`);
        this.handleSocketData(socket, data);
        PerformanceMonitor.end(`HANDLE_DATA_${connectionId}`);
      });

      socket.on("close", () => {
        this.stats.currentConnections--;

        // Track connection state
        StateTracker.trackConnectionState(connectionId, "DISCONNECTED", {
          duration: Date.now() - socket.connectionTime,
          reason: "SOCKET_CLOSED",
        });

        DebugLogger.socket(`Socket connection closed`, {
          connectionId: connectionId,
          duration: `${Date.now() - socket.connectionTime}ms`,
          currentConnections: this.stats.currentConnections,
        });
        this.handleSocketDisconnection(socket);
      });

      socket.on("error", (error) => {
        this.stats.errors++;

        // Track error and connection state
        StateTracker.recordError(connectionId, error, {
          socketState: "ERROR",
          errorCode: error.code,
        });
        StateTracker.trackConnectionState(connectionId, "ERROR", {
          error: error.message,
          code: error.code,
        });

        DebugLogger.error("SOCKET", "Socket error occurred", {
          connectionId: connectionId,
          error: error.message,
          code: error.code,
        });
        this.handleSocketDisconnection(socket);
      });

      // Socket event listeners configured

      // CRITICAL: Do not send anything on connection!
      // The Flash client expects to send version check first
      // Only respond AFTER receiving verChk message
    });

    this.socketServer.listen(CONFIG.SOCKET_PORT, () => {
      DebugLogger.info(
        "SERVER",
        `Socket server listening on port ${CONFIG.SOCKET_PORT}`,
      );
    });
  }

  startHttpServer() {
    this.httpServer = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    this.httpServer.listen(CONFIG.HTTP_PORT);
  }

  handleSocketData(socket, data) {
    // Process incoming socket data
    socket.buffer = Buffer.concat([socket.buffer, data]);

    let messagesProcessed = 0;
    let nullIndex;
    while ((nullIndex = socket.buffer.indexOf(0)) !== -1) {
      const messageBuffer = socket.buffer.slice(0, nullIndex);
      const message = messageBuffer.toString("utf8");
      socket.buffer = socket.buffer.slice(nullIndex + 1);
      messagesProcessed++;

      // Skip processing empty messages and 'ok' keepalives
      if (message.length > 0) {
        if (message !== "ok") {
          this.stats.totalMessages++;
          PerformanceMonitor.start(`HANDLE_MESSAGE_${socket.connectionId}`);
          try {
            this.handleMessage(socket, message);
          } catch (error) {
            DebugLogger.error("SOCKET", "Error during message processing", {
              connectionId: socket.connectionId,
              user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
              error: error.message,
              errorStack: error.stack,
              errorName: error.name,
              messageLength: message.length,
              messagePreview: message.substring(0, 500),
              fullMessage: message,
            });
            console.error("=== FULL ERROR DETAILS ===");
            console.error("Error:", error);
            console.error("Stack:", error.stack);
            console.error("Message:", message);
            console.error("========================");
          }
          PerformanceMonitor.end(`HANDLE_MESSAGE_${socket.connectionId}`);
        }
      }
    }
  }

  handleMessage(socket, message) {
    // Handle Flash crossdomain policy request first
    if (message === "<policy-file-request/>") {
      DebugLogger.info("SECURITY", "Sending Flash crossdomain policy");
      this.sendCrossDomainPolicy(socket);
      return;
    }

    const firstChar = message.charAt(0);

    // Determine message type for logging
    let messageType = "unknown";
    if (firstChar === PROTOCOL.MSG_XML) {
      messageType = "xml";
    } else if (firstChar === PROTOCOL.MSG_JSON) {
      messageType = "json";
    } else if (firstChar === PROTOCOL.MSG_STR) {
      messageType = "str";
    }

    try {
      if (firstChar === PROTOCOL.MSG_XML) {
        PerformanceMonitor.start(`XML_${socket.connectionId}`);
        this.handleXmlMessage(socket, message);
        PerformanceMonitor.end(`XML_${socket.connectionId}`);
      } else if (firstChar === PROTOCOL.MSG_JSON) {
        PerformanceMonitor.start(`JSON_${socket.connectionId}`);
        this.handleJsonMessage(socket, message);
        PerformanceMonitor.end(`JSON_${socket.connectionId}`);
      } else if (firstChar === PROTOCOL.MSG_STR) {
        PerformanceMonitor.start(`STR_${socket.connectionId}`);
        this.handleStrMessage(socket, message);
        PerformanceMonitor.end(`STR_${socket.connectionId}`);
      } else {
        DebugLogger.warn("MESSAGE", "Unknown message format detected", {
          connectionId: socket.connectionId,
          user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
          firstChar: firstChar,
          firstCharCode: firstChar.charCodeAt(0),
          messagePreview: message.substring(0, 100),
          possibleCauses: [
            "Invalid protocol",
            "Corrupted data",
            "Client version mismatch",
          ],
        });
      }
    } catch (error) {
      this.stats.errors++;
      DebugLogger.error("MESSAGE", "Critical error during message handling", {
        connectionId: socket.connectionId,
        user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
        messageType: messageType,
        error: error.message,
        stack: error.stack,
        messageLength: message.length,
        messagePreview: message.substring(0, 500),
        fullMessage: message,
        socketState: {
          authenticated: socket.authenticated,
          hasRandomKey: !!socket.randomKey,
          destroyed: socket.destroyed,
        },
        serverStats: {
          totalMessages: this.stats.totalMessages,
          totalErrors: this.stats.errors,
          currentConnections: this.stats.currentConnections,
        },
      });
      console.error("=== CRITICAL MESSAGE HANDLING ERROR ===");
      console.error("Error:", error);
      console.error("Full Stack:", error.stack);
      console.error("Message Type:", messageType);
      console.error("Full Message:", message);
      console.error("======================================");
    }

    DebugLogger.debug("MESSAGE", "Message handling completed", {
      connectionId: socket.connectionId,
      user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
      messageType: messageType,
      processingSuccessful: true,
    });
  }

  handleXmlMessage(socket, message) {
    // Track message flow
    StateTracker.trackMessageFlow(
      socket.connectionId,
      "incoming",
      "XML",
      "parsing",
      {
        messageLength: message.length,
        user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
      },
    );

    // Concise incoming log
    DebugLogger.xml("incoming", message, {
      connectionId: socket.connectionId,
      user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
    });

    // Parse XML message - handle attributes with or without spaces
    const xmlMatch = message.match(/<msg\s*([^>]*)>(.*?)<\/msg>/s);
    if (!xmlMatch) {
      StateTracker.recordProtocolViolation(
        socket.connectionId,
        "INVALID_XML_FORMAT",
        "Valid <msg>...</msg> structure",
        message,
        {
          messageLength: message.length,
          messagePreview: message.substring(0, 100),
        },
      );
      DebugLogger.warn("XML", "Failed to parse XML message");
      return;
    }

    const attributes = this.parseXmlAttributes(xmlMatch[1]);
    const body = xmlMatch[2];

    // Suppressed detailed attribute logs in concise mode

    const bodyMatch = body.match(/<body\s*([^>]*)>(.*?)<\/body>/s);
    if (!bodyMatch) {
      StateTracker.recordProtocolViolation(
        socket.connectionId,
        "INVALID_BODY_FORMAT",
        "Valid <body>...</body> structure",
        body,
        {
          bodyLength: body.length,
          bodyPreview: body.substring(0, 100),
        },
      );
      DebugLogger.warn("XML", "Failed to parse body element");
      return;
    }

    const bodyAttributes = this.parseXmlAttributes(bodyMatch[1]);
    const bodyContent = bodyMatch[2];

    const messageType = attributes.t;
    const action = bodyAttributes.action;
    const roomId = parseInt(bodyAttributes.r) || 0;

    // Suppressed parsed body details in concise mode

    // Enhanced message routing with debug logs

    if (messageType === "sys") {
      DebugLogger.debug("SYS_MSG", `🔵 System message: ${action}`, {
        connectionId: socket.connectionId,
        user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
        action: action,
        roomId: roomId,
      });
      this.handleSystemMessage(socket, action, roomId, bodyContent);
    } else if (messageType === "xt") {
      this.handleExtensionMessage(socket, action, roomId, bodyContent);
    } else {
      DebugLogger.error("XML_DISPATCH", "❌ Unknown message type", {
        connectionId: socket.connectionId,
        user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
        messageType: messageType,
        availableTypes: ["sys", "xt"],
        fullMessage: message,
      });
    }
  }

  handleJsonMessage(socket, message) {
    try {
      const jsonData = JSON.parse(message);
      const messageType = jsonData.t;
      const body = jsonData.b;

      // Enhanced debug logging for JSON messages
      DebugLogger.debug("JSON_MSG", `📨 Incoming JSON: ${messageType}`, {
        connectionId: socket.connectionId,
        user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
        messageType: messageType,
        extension: body ? (body.x || body.c) : "undefined",
        command: body ? body.c : "undefined",
        params: body ? body.p : "undefined",
        roomId: body ? body.r : "undefined",
        bodyKeys: body ? Object.keys(body) : [],
        fullMessage: message,
      });

      if (messageType === "xt") {
        if (!body) {
          DebugLogger.error("JSON_MSG", "Missing body in extension message", {
            connectionId: socket.connectionId,
            user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
            messageType: messageType,
            fullMessage: message,
          });
          return;
        }
        this.handleExtensionMessageJson(socket, body);
      } else {
        DebugLogger.warn("JSON_MSG", `Unknown JSON message type: ${messageType}`, {
          connectionId: socket.connectionId,
          user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
          messageType: messageType,
        });
      }
    } catch (error) {
      DebugLogger.error("JSON_PARSE", "❌ JSON parsing failed", {
        connectionId: socket.connectionId,
        user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
        error: error.message,
        stack: error.stack,
        messagePreview: message.substring(0, 500),
        fullMessage: message,
      });
      // Don't crash the server - just log and continue
      // The client might retry or send a valid message next
    }
  }

  handleStrMessage(socket, message) {
    const parts = message
      .substring(1, message.length - 1)
      .split(PROTOCOL.MSG_STR);
    const messageType = parts[0];
    const params = parts.slice(1);

    if (messageType === "xt") {
      this.handleExtensionMessageStr(socket, params);
    }
  }

  parseXmlAttributes(attrString) {
    // Suppressed attribute parsing logs in concise mode

    const attributes = {};
    // Handle both single and double quotes
    const regex = /(\w+)=["']([^"']*)["']/g;
    let match;
    let matchCount = 0;

    while ((match = regex.exec(attrString)) !== null) {
      attributes[match[1]] = match[2];
      matchCount++;
      // Suppressed per-attribute logs in concise mode
    }

    // Suppressed final attributes log in concise mode

    return attributes;
  }

  handleSystemMessage(socket, action, roomId, content) {
    // Process system message

    switch (action) {
      case "verChk":
        this.handleVersionCheck(socket, content);
        break;
      case "zInfo":
        this.handleZoneInfo(socket, content);
        break;
      case "login":
        this.handleLogin(socket, content);
        break;
      case "logout":
        this.handleLogout(socket);
        break;
      case "getRmList":
        this.handleGetRoomList(socket);
        break;
      case "joinRoom":
        this.handleJoinRoom(socket, content);
        break;
      case "leaveRoom":
        this.handleLeaveRoom(socket, roomId, content);
        break;
      case "autoJoin":
        this.handleAutoJoin(socket);
        break;
      case "pubMsg":
        this.handlePublicMessage(socket, roomId, content);
        break;
      case "prvMsg":
        this.handlePrivateMessage(socket, roomId, content);
        break;
      case "modMsg":
        this.handleModeratorMessage(socket, roomId, content);
        break;
      case "setUvars":
        this.handleSetUserVariables(socket, roomId, content);
        break;
      case "setRvars":
        this.handleSetRoomVariables(socket, roomId, content);
        break;
      case "asObj":
        this.handleActionScriptObject(socket, roomId, content);
        break;
      case "asObjG":
        this.handleActionScriptObjectGroup(socket, roomId, content);
        break;
      case "addB":
        this.handleAddBuddy(socket, content);
        break;
      case "remB":
        this.handleRemoveBuddy(socket, content);
        break;
      case "loadB":
        this.handleLoadBuddyList(socket);
        break;
      case "clearB":
        this.handleClearBuddyList(socket);
        break;
      case "setBvars":
        this.handleSetBuddyVariables(socket, content);
        break;
      case "roomB":
        this.handleBuddyRoom(socket, content);
        break;
      case "bPrm":
        this.handleBuddyPermission(socket, content);
        break;
      case "createRoom":
        this.handleCreateRoom(socket, roomId, content);
        break;
      case "swSpec":
        this.handleSwitchSpectator(socket, roomId);
        break;
      case "rndK":
        this.handleRandomKey(socket);
        break;
      case "roundTrip":
        this.handleRoundTripBench(socket);
        break;
      default:
        DebugLogger.warn("SYSTEM", "Unknown system action: " + action);
    }
  }

  handleExtensionMessage(socket, action, roomId, content) {
    // Process extension message

    // Parse XML extension message - extract extension name and command
    const extensionMatch = content.match(/<\!\[CDATA\[(.*)\]\]>/s);
    if (!extensionMatch) {
      DebugLogger.xml("extension_parse_error", "NO_CDATA_FOUND", {
        connectionId: socket.connectionId,
        user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
        content: content,
        reason: "Could not find CDATA section in extension message",
      });
      return;
    }

    // Suppressed CDATA content log

    // Deserialize the extension data
    try {
      const xmlData =
        new (require("xml2js").parseString)() || this.parseSimpleXml;
      const extensionData = this.deserializeXmlObject(extensionMatch[1]);

      // Suppressed deserialized extension data log

      if (extensionData && extensionData.name) {
        this.processExtension(
          socket,
          extensionData.name,
          roomId,
          extensionData.param || extensionData,
          PROTOCOL.XTMSG_TYPE_XML,
        );
      }
    } catch (error) {
      DebugLogger.xml(
        "extension_parse_error",
        "EXTENSION_DESERIALIZATION_FAILED",
        {
          connectionId: socket.connectionId,
          user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
          error: error.message,
          stack: error.stack,
          cdataContent: extensionMatch ? extensionMatch[1] : "null",
          fallbackExtension: "0",
          reason: "Falling back to simple extension parsing",
        },
      );

      // Keep error in console for visibility
      console.error("=== EXTENSION DESERIALIZATION ERROR ===");
      console.error("Error:", error);
      console.error("Stack:", error.stack);
      console.error(
        "CDATA Content:",
        extensionMatch ? extensionMatch[1] : "null",
      );
      console.error("Full Content:", content);
      console.error("=====================================");
      // Try simple parsing for basic extensions
      this.processExtension(
        socket,
        "0",
        roomId,
        content,
        PROTOCOL.XTMSG_TYPE_XML,
      );
    }
  }

  handleExtensionMessageJson(socket, body) {
    try {
      // Handle JSON extension messages
      const extensionName = body.x;
      const command = body.c;
      const roomId = body.r || -1;
      let params = body.p || {};

      // Enhanced debug logging for JSON extension messages
      DebugLogger.debug(
        "EXT_JSON",
        `🔧 Extension JSON: ${command}/${extensionName}`,
        {
          connectionId: socket.connectionId,
          user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
          extensionName: extensionName,
          command: command,
          roomId: roomId,
          params: params,
          paramsKeys: params ? Object.keys(params) : [],
          bodyKeys: Object.keys(body),
        },
      );

      // Ensure command is stored as string in params for consistency
      if (params && typeof params === "object") {
        try {
          params[PROTOCOL.COMMANDS.V_COMMAND] = String(command);
          params.command = String(command);
        } catch (e) {
          DebugLogger.warn("EXT_JSON_PARAM", "Failed to set command in params", {
            connectionId: socket.connectionId,
            error: e.message,
          });
        }
      }

      this.processExtension(socket, extensionName, roomId, params, "json");
    } catch (error) {
      DebugLogger.error(
        "EXT_JSON",
        "Failed to process JSON extension message",
        {
          connectionId: socket.connectionId,
          user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
          error: error.message,
          stack: error.stack,
          body: body,
        },
      );
      // Try to send error response to client
      try {
        this.sendExtensionResponse(
          socket,
          { status: "error", error: "Failed to process extension" },
          "json",
        );
      } catch (e) {
        // If even sending error fails, just log it
        DebugLogger.error("EXT_JSON", "Failed to send error response", {
          error: e.message,
        });
      }
    }
  }

  handleExtensionMessageStr(socket, params) {
    // Handle string extension messages
    const extensionName = params[0];
    const command = params[1];
    const roomId = parseInt(params[2]) || 0;

    DebugLogger.debug(
      "EXT_STR",
      `🔧 Extension String: ${extensionName}/${command}`,
      {
        connectionId: socket.connectionId,
        user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
        extensionName: extensionName,
        command: command,
        roomId: roomId,
        paramsCount: params.length,
        params: params,
      },
    );

    this.processExtension(
      socket,
      extensionName,
      roomId,
      params,
      PROTOCOL.XTMSG_TYPE_STR,
    );
  }

  processExtension(socket, extensionName, roomId, params, messageType) {
    this.stats.extensionsProcessed++;

    // Use bypass system first for ALL extensions
    if (
      ExtensionBypass.handleExtension(
        socket,
        extensionName,
        params,
        messageType,
        this,
        PROTOCOL,
      )
    ) {
      PerformanceMonitor.end(`EXT_${extensionName}_${socket.connectionId}`);
      return;
    }

    // Validate extension prerequisites
    if (
      !socket.sfsUser &&
      extensionName !== "0" &&
      extensionName !== PROTOCOL.EXTENSIONS.LoginExtension
    ) {
      DebugLogger.error(
        "EXTENSION",
        `Extension ${extensionName} requires authentication`,
      );
      DebugLogger.warn(
        "EXT_AUTH",
        `🔒 Extension requires authentication: ${extensionName}`,
        {
          connectionId: socket.connectionId,
          extensionName: extensionName,
          authenticated: false,
        },
      );

      this.sendExtensionResponse(
        socket,
        {
          error: `Extension ${extensionName} requires authentication`,
          code: "NOT_AUTHENTICATED",
        },
        messageType,
      );
      return;
    }

    PerformanceMonitor.start(`EXT_${extensionName}_${socket.connectionId}`);

    // CRITICAL FIX: These should now be handled by ExtensionBypass but keep as fallback
    if (extensionName === "95" || extensionName === 95) {
      // This should be handled by bypass
      console.log(
        "[WARNING] Extension 95 reached old handler - bypass may have failed",
      );
      return;
    }

    if (extensionName === "36" || extensionName === 36) {
      // This should be handled by bypass
      console.log(
        "[WARNING] Extension 36 reached old handler - bypass may have failed",
      );

      // CRITICAL FIX: Do NOT auto-join here!
      // The Flash client handles room joining via Main.as staticDataLoaded() -> loadRoom()
      // Auto-joining causes a race condition that prevents avatar rendering in the room.
      // Let the client control the join flow.
      console.log(
        `[STATIC_DATA] Static data sent to ${socket.sfsUser.name} - waiting for client to joinRoom`,
      );
      return;
    }

    // If fallbacks are disabled, avoid sending generic "ok" acks.
    // Instead, delegate to the default handler that mirrors client expectations.
    if (!DEBUG_CONFIG.ALLOW_EXTENSION_FALLBACKS) {
      try {
        if (ExtensionBypass && typeof ExtensionBypass.sendDefaultResponse === 'function') {
          ExtensionBypass.sendDefaultResponse(
            socket,
            String(extensionName),
            params,
            messageType,
            this,
            PROTOCOL,
          );
        } else {
          DebugLogger.warn(
            "EXTENSION",
            `No default handler available for extension ${extensionName}`,
          );
        }
      } catch (e) {
        DebugLogger.warn(
          "EXTENSION",
          `Default handler threw for extension ${extensionName}: ${e.message}`,
        );
      }
      PerformanceMonitor.end(`EXT_${extensionName}_${socket.connectionId}`);
      return;
    }

    // Process extensions with switch statement
    switch (extensionName) {
      case PROTOCOL.EXTENSIONS.LoginExtension:
        this.handleLoginExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.RoomData:
        this.handleRoomDataExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.ItemData:
        this.handleItemDataExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.PlayerData:
        this.handlePlayerDataExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.GameExtension:
        this.handleGameExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.Store:
        this.handleStoreExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.ThrowingGame:
        this.handleThrowingGameExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.Recycle:
        this.handleRecycleExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.NPCExtension:
        this.handleNPCExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.Chat:
        this.handleChatExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.MessagingExtension:
        this.handleMessagingExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.TeleportPlayer:
        this.handleTeleportExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.StaticDataExtension:
        this.handleStaticDataExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.PingExtension:
        this.handlePingExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.UserVarsChangeExtension:
        this.handleUserVarsChangeExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.GetUserVarsExtension:
        this.handleGetUserVarsExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.TeleportToUserExtension:
        this.handleTeleportToUserExtension(socket, params, messageType);
        break;
      // Emoticons and potions
      case PROTOCOL.EXTENSIONS.Emoticons:
        this.handleEmoticonsExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.UsePotionExtension:
        this.handleUsePotionExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.BuyPotionExtension:
        this.handleBuyPotionExtension(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.LockPotionsExtension:
        this.handleLockPotionsExtension(socket, params, messageType);
        break;
      // Appearance setters (image/skin/mood)
      case PROTOCOL.EXTENSIONS.SetImageExtension:
      case PROTOCOL.EXTENSIONS.SetSkinExtension:
      case PROTOCOL.EXTENSIONS.SetMoodExtension:
      case "107":
      case "108":
      case "109":
        this.handleSetAppearanceExtension(
          socket,
          String(extensionName),
          params,
          messageType,
        );
        break;
      // Trading extensions
      case PROTOCOL.EXTENSIONS.TradeRequestExtension:
      case PROTOCOL.EXTENSIONS.TradeAcceptExtension:
      case PROTOCOL.EXTENSIONS.TradeRejectExtension:
      case PROTOCOL.EXTENSIONS.TradeCancelExtension:
      case PROTOCOL.EXTENSIONS.TradeTxAbort:
      case PROTOCOL.EXTENSIONS.TradeTxClearSlot:
      case PROTOCOL.EXTENSIONS.TradeTxComplete:
      case PROTOCOL.EXTENSIONS.TradeTxPutInventoryItem:
      case PROTOCOL.EXTENSIONS.TradeTxPutRecycleItem:
      case PROTOCOL.EXTENSIONS.TradeTxExit:
      case PROTOCOL.EXTENSIONS.TradeTxLock:
      case PROTOCOL.EXTENSIONS.TradeTxPutCard:
        this.handleTradeExtension(socket, extensionName, params, messageType);
        break;
      // Animal extensions
      case PROTOCOL.EXTENSIONS.BuyAnimal:
      case PROTOCOL.EXTENSIONS.BuyAnimalFood:
      case PROTOCOL.EXTENSIONS.CleanAnimal:
      case PROTOCOL.EXTENSIONS.GetAnimalStore:
      case PROTOCOL.EXTENSIONS.AnimalEmoticon:
      case PROTOCOL.EXTENSIONS.AnimalGamePlayed:
      case PROTOCOL.EXTENSIONS.HideAnimalExtension:
      case PROTOCOL.EXTENSIONS.ShowAnimalExtension:
        this.handleAnimalExtension(socket, extensionName, params, messageType);
        break;
      // House extensions
      case PROTOCOL.EXTENSIONS.BuyHouseGardenPlantExtension:
      case PROTOCOL.EXTENSIONS.HouseGardenPlantOperationExtension:
      case PROTOCOL.EXTENSIONS.UpgradeHouseGardenLevelExtension:
      case PROTOCOL.EXTENSIONS.BuyHouseItemExtension:
      case PROTOCOL.EXTENSIONS.EnterHouseRoomExtension:
      case PROTOCOL.EXTENSIONS.GetHouseStorageExtension:
      case PROTOCOL.EXTENSIONS.PlaceHouseItemExtension:
      case PROTOCOL.EXTENSIONS.ReplaceHouseExtension:
      case PROTOCOL.EXTENSIONS.SellHouseItemExtension:
      case PROTOCOL.EXTENSIONS.UpgradeHouseElectricLevelExtension:
      case PROTOCOL.EXTENSIONS.UpgradeHouseSizeExtension:
      case PROTOCOL.EXTENSIONS.BuyHouseExtension:
      case PROTOCOL.EXTENSIONS.GetHouseStaticDataExtension:
      case PROTOCOL.EXTENSIONS.LockHouseExtension:
      case PROTOCOL.EXTENSIONS.HouseRoomEventExtension:
        this.handleHouseExtension(socket, extensionName, params, messageType);
        break;
      // Card extensions
      case PROTOCOL.EXTENSIONS.AddAlbumExtension:
      case PROTOCOL.EXTENSIONS.AddCardPackExtension:
      case PROTOCOL.EXTENSIONS.CardDataExtension:
      case PROTOCOL.EXTENSIONS.CardInventoryDataExtension:
      case PROTOCOL.EXTENSIONS.CardPackWaitingDataExtension:
      case PROTOCOL.EXTENSIONS.LockCardExtension:
      case PROTOCOL.EXTENSIONS.OpenCardPackWaitingExtension:
      case PROTOCOL.EXTENSIONS.CardsStaticDataExtension:
        this.handleCardExtension(socket, extensionName, params, messageType);
        break;
      // Credits store extensions
      case PROTOCOL.EXTENSIONS.CreditsStoreStaticDataExtension:
        this.handleCreditsStoreStaticData(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.GetCreditsStore:
        this.handleGetCreditsStore(socket, params, messageType);
        break;
      // Multiplayer task extensions
      case PROTOCOL.EXTENSIONS.InitMultiplayerTask:
      case PROTOCOL.EXTENSIONS.JoinMultiplayerTask:
      case PROTOCOL.EXTENSIONS.LoadedMultiplayerTask:
      case PROTOCOL.EXTENSIONS.ExitMultiplayerTask:
      case PROTOCOL.EXTENSIONS.CompleteMultiplayerTask:
      case PROTOCOL.EXTENSIONS.AcceptedToMultiplayerTask:
      case PROTOCOL.EXTENSIONS.RejectFromMultiplayerTask:
      case PROTOCOL.EXTENSIONS.SendCommandToMPTask:
      case PROTOCOL.EXTENSIONS.FailedMultiplayerTask:
        this.handleMultiplayerTaskExtension(
          socket,
          extensionName,
          params,
          messageType,
        );
        break;
      // Security extensions
      case PROTOCOL.EXTENSIONS.GetNewSecurityFormData:
      case PROTOCOL.EXTENSIONS.GetSecurityCheckData:
      case PROTOCOL.EXTENSIONS.FillSecurityFormData:
      case PROTOCOL.EXTENSIONS.CheckSecurityCheckData:
      case PROTOCOL.EXTENSIONS.DeactivateSecurityCode:
      case PROTOCOL.EXTENSIONS.GeneratePlayerSecurityCode:
      case PROTOCOL.EXTENSIONS.ValidateSecurityCode:
      case PROTOCOL.EXTENSIONS.GetSecurityFormData:
      case PROTOCOL.EXTENSIONS.ResetPlayerSecurityForm:
        this.handleSecurityExtension(
          socket,
          extensionName,
          params,
          messageType,
        );
        break;

      // CRITICAL: Handle numeric extension IDs that don't match named constants
      case "1": // RoomData
        this.handleRoomDataExtension(socket, params, messageType);
        break;
      case "2": // ItemData
        this.handleItemDataExtension(socket, params, messageType);
        break;
      case "3": // PlayerData
        this.handlePlayerDataExtension(socket, params, messageType);
        break;
      case "6": // Recycle
        this.handleRecycleExtension(socket, params, messageType);
        break;
      case "13": // Emoticons
        this.handleEmoticonsExtension(socket, params, messageType);
        break;
      case "19": // Chat
        this.handleChatExtension(socket, params, messageType);
        break;
      case "35": // UserVarsChangeExtension
        this.handleUserVarsChangeExtension(socket, params, messageType);
        break;
      case "68": // GetHouseStaticDataExtension
        this.handleGetHouseStaticData(socket, params, messageType);
        break;
      case "79": // CardInventoryDataExtension
        this.handleCardInventory(socket, params, messageType);
        break;
      case "80": // CardPackWaitingDataExtension
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.V_COMMAND]:
              PROTOCOL.COMMANDS.S_CARD_PACK_WAITING_ITEMS,
            [PROTOCOL.COMMANDS.V_CARD_PACK_WAITING_ITEMS]: [],
          },
          messageType,
        );
        break;
      case "90": // GetCreditsStore (aligned to COMMANDS)
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.V_COMMAND]:
              PROTOCOL.COMMANDS.S_CREDITS_STORE_DATA,
            [PROTOCOL.COMMANDS.V_CREDITS_STORE_PRODUCTS_LEFT]: [],
            [PROTOCOL.COMMANDS.V_CREDITS_STORE_DISCOUNTS]: [],
            [PROTOCOL.COMMANDS.V_CREDITS_STORE_PRODUCTS]: [],
          },
          messageType,
        );
        break;
      case "91": // CreditsStoreStaticDataExtension (aligned to COMMANDS)
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.V_COMMAND]:
              PROTOCOL.COMMANDS.S_CREDITS_STORE_STATIC_DATA,
            [PROTOCOL.COMMANDS.V_CREDITS_STORE_PRODUCTS_DATA]: [],
            [PROTOCOL.COMMANDS.V_CREDITS_STORE_PRODUCTS]: [],
            [PROTOCOL.COMMANDS.V_CREDITS_STORE_DATA]: [],
            [PROTOCOL.COMMANDS.V_CREDITS_STORE_VERSION]: Date.now(),
          },
          messageType,
        );
        break;
      case "96": // UsePotionExtension
        this.handleUsePotionExtension(socket, params, messageType);
        break;
      case "97": // BuyPotionExtension
        this.handleBuyPotionExtension(socket, params, messageType);
        break;
      case "99": // LockPotionsExtension
        this.handleLockPotionsExtension(socket, params, messageType);
        break;
      case "110": // GetUserVarsExtension
        this.handleGetUserVarsExtension(socket, params, messageType);
        break;
      case "111": // TeleportToUserExtension
        this.handleTeleportToUserExtension(socket, params, messageType);
        break;
      default:
        DebugLogger.warn("EXTENSION", "UNKNOWN EXTENSION REQUESTED", {
          connectionId: socket.connectionId,
          user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
          extensionName: extensionName,
          step: "DISPATCH",
          result: "UNKNOWN_EXTENSION",
          availableExtensions: Object.keys(PROTOCOL.EXTENSIONS).slice(0, 10),
          totalAvailableExtensions: Object.keys(PROTOCOL.EXTENSIONS).length,
          action: "SENDING_GENERIC_OK",
        });

        // Send generic OK to avoid client hard-fail
        this.sendExtensionResponse(
          socket,
          { status: "ok", extension: extensionName },
          messageType,
        );
    }

    PerformanceMonitor.end(`EXT_${extensionName}_${socket.connectionId}`);

    DebugLogger.info("EXTENSION", "EXTENSION PROCESSING COMPLETED", {
      connectionId: socket.connectionId,
      user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
      extensionName: extensionName,
      step: "COMPLETION",
      result: "SUCCESS",
      totalExtensionsProcessed: this.stats.extensionsProcessed,
    });
  }

  // System message handlers
  handleVersionCheck(socket, content) {
    DebugLogger.debug("VERSION", "Starting version check process", {
      connectionId: socket.connectionId,
      contentLength: content ? content.length : 0,
      contentPreview: content ? content.substring(0, 100) : "null",
      socketState: {
        authenticated: socket.authenticated,
        hasRandomKey: !!socket.randomKey,
        hasUser: !!socket.sfsUser,
      },
    });

    // Extract version from content
    const versionMatch = content.match(/<ver v='(\d+)' \/>/);

    DebugLogger.debug("VERSION", "Version regex matching result", {
      connectionId: socket.connectionId,
      hasMatch: !!versionMatch,
      fullContent: content,
      regexPattern: "/<ver v='(\\d+)' \\/>/",
    });

    if (versionMatch) {
      const clientVersion = versionMatch[1];
      DebugLogger.debug("VERSION", "Client version extracted successfully", {
        connectionId: socket.connectionId,
        clientVersion: clientVersion,
        expectedVersion: "156",
        versionNumeric: parseInt(clientVersion),
        isValidFormat: /^\d+$/.test(clientVersion),
      });

      // Version 156 = SmartFox Client 1.5.6
      // The client version string concatenates major.minor.sub (1.5.6 = "156")
      if (clientVersion === "156") {
        DebugLogger.info(
          "VERSION",
          "Client version validation successful - sending API OK",
          {
            connectionId: socket.connectionId,
            clientVersion: clientVersion,
            action: "SEND_API_OK",
          },
        );

        // Send API OK immediately - this tells client connection is successful
        this.sendApiOK(socket);

        DebugLogger.info("VERSION", "Version check completed successfully", {
          connectionId: socket.connectionId,
          clientVersion: clientVersion,
          result: "ACCEPTED",
          nextStep: "Client should request random key or proceed to login",
        });
      } else {
        DebugLogger.warn(
          "VERSION",
          "Client version rejected - version mismatch",
          {
            connectionId: socket.connectionId,
            clientVersion: clientVersion,
            expected: "156",
            action: "SEND_API_KO",
            errorMessage: "API are obsolete, please upgrade",
          },
        );

        this.sendApiKO(socket, "API are obsolete, please upgrade");

        DebugLogger.warn(
          "VERSION",
          "Version check failed - connection will likely be terminated",
          {
            connectionId: socket.connectionId,
            clientVersion: clientVersion,
            result: "REJECTED",
          },
        );
      }
    } else {
      DebugLogger.error("VERSION", "Version check failed - invalid format", {
        connectionId: socket.connectionId,
        content: content,
        contentLength: content ? content.length : 0,
        possibleIssues: [
          "Malformed XML",
          "Missing ver element",
          "Invalid attribute format",
          "Client using wrong protocol",
        ],
        action: "SEND_API_KO",
        errorMessage: "Invalid version format",
      });

      this.sendApiKO(socket, "Invalid version format");

      DebugLogger.error("VERSION", "Version check process failed", {
        connectionId: socket.connectionId,
        result: "FAILED",
        reason: "INVALID_FORMAT",
      });
    }
  }

  handleZoneInfo(socket, content) {
    // Extract channel list from content - it's a comma-separated list
    const channelList = content.split(",");

    DebugLogger.debug("ZONE", "Zone info requested", {
      connectionId: socket.connectionId,
      channels: channelList,
      channelCount: channelList.length,
    });

    // Calculate user counts for each channel based on actual room populations
    const channelCounts = [];

    for (let i = 0; i < channelList.length; i++) {
      let totalUsers = 0;
      for (let [roomId, room] of this.rooms) {
        totalUsers += room.userCount;
      }
      const variance = Math.floor(Math.random() * 10) - 5;
      const count = Math.max(0, Math.min(100, totalUsers + variance));
      channelCounts.push(count);
    }

    // CRITICAL: The ActionScript ServerData.as expects just the <zInfo> content, not wrapped in SmartFox XML!
    // This is because it uses XMLSocket directly, not SmartFox protocol for server selection
    const zInfoResponse = `<zInfo>${channelCounts.join(",")}</zInfo>`;

    DebugLogger.debug("ZONE", "Sending zone info response", {
      connectionId: socket.connectionId,
      response: zInfoResponse,
      counts: channelCounts,
      channels: channelList,
    });

    // Send raw zInfo XML response directly to socket (no SmartFox wrapper)
    this.sendRawToSocket(socket, zInfoResponse);
  }

  async handleLogin(socket, content) {
    DebugLogger.info("AUTH", "Login attempt started");

    // Ensure we have a random key before processing login
    if (!socket.randomKey) {
      DebugLogger.error("AUTH", "Login attempt without random key");
      this.sendLoginError(socket, "Authentication error - no random key");
      return;
    }

    // Parse login XML
    const loginRegexPattern =
      /<login z='([^']*)'><nick><!\[CDATA\[([^\]]*)\]\]><\/nick><pword><!\[CDATA\[([^\]]*)\]\]><\/pword><\/login>/;
    const loginMatch = content.match(loginRegexPattern);

    if (!loginMatch) {
      DebugLogger.error("AUTH", "Invalid login XML format");
      this.sendLoginError(socket, "Invalid login format");
      return;
    }

    const zone = loginMatch[1];
    const username = loginMatch[2];
    const hashedPassword = loginMatch[3]; // This is MD5(randomKey + password) from client

    if (DEBUG_CONFIG.LOG_AUTHENTICATION) {
      DebugLogger.info(
        "AUTH",
        `Login attempt: ${username} from ${socket.remoteAddress}`,
      );
    }

    try {
      // Authenticate user against database with hashed password
      const user = await this.authenticateUser(
        username,
        hashedPassword,
        socket.randomKey,
      );
      if (!user) {
        this.sendLoginError(socket, "Invalid username or password");
        return;
      }

      // Create SFS user object
      const sfsUser = new User(this.nextUserId++, username, socket);
      sfsUser.accountId = user.account_id;
      sfsUser.dbId = user.player_id;
      sfsUser.isLoggedIn = true;
      sfsUser.playerData = user;
      sfsUser.isModerator = user.is_mod || false;

      // Set initial user variables - CRITICAL for avatar display
      sfsUser.setVariable(USERVARIABLES.UID, sfsUser.id);
      sfsUser.setVariable(USERVARIABLES.NAME, username);
      sfsUser.setVariable(USERVARIABLES.LEVEL, user.level || 1);
      sfsUser.setVariable(USERVARIABLES.LEADERSHIP, user.leadership_points || 0);
      // Use numeric 0/1 for flags the AS client compares numerically
      sfsUser.setVariable(USERVARIABLES.IS_PREMIUM, user.is_premium ? 1 : 0);
      sfsUser.setVariable(USERVARIABLES.IS_MOD, user.is_mod ? 1 : 0);
      sfsUser.setVariable(USERVARIABLES.RANGER_LEVEL, user.ranger_level || 0);
      sfsUser.setVariable(USERVARIABLES.SENIORITY_LEVEL, user.seniority_level || 0);
      sfsUser.setVariable(USERVARIABLES.ADVISOR_LEVEL, user.advisor_level || 0);
      // Clamp gender to 0/1 to match Flash expectations (0=male, 1=female)
      {
        const g = Number(user.gender);
        sfsUser.setVariable(USERVARIABLES.AVATAR_GENDER, (g === 0 || g === 1) ? g : 0);
      }
      sfsUser.setVariable(USERVARIABLES.AVATAR_SKINTONE, user.skintone || 1);
      sfsUser.setVariable(USERVARIABLES.AVATAR_EYES, user.eyes || 1);
      sfsUser.setVariable(USERVARIABLES.AVATAR_MOUTH, user.mouth || 1);
      sfsUser.setVariable(USERVARIABLES.AVATAR_HAIR, user.hair || 1);
      sfsUser.setVariable(USERVARIABLES.AVATAR_MAKEUP, user.makeup || 0);
      
      // CRITICAL AVATAR VARIABLES - These are essential for avatar display in rooms
      // SKIN=57, MOOD=56, IMAGE=55 - These MUST be set correctly!
      // Note: DB has 'skintone' field, not 'skin'. MOOD/IMAGE are usually 1/0 defaults.
      sfsUser.setVariable(USERVARIABLES.SKIN, user.skintone || 1);
      sfsUser.setVariable(USERVARIABLES.MOOD, 1);  // Default mood
      sfsUser.setVariable(USERVARIABLES.IMAGE, 0); // Default image
      
      console.log("🟢 AVATAR DEBUG - Login Variables for", username);
      console.log("  SKIN (key 57):", sfsUser.getVariable(USERVARIABLES.SKIN));
      console.log("  MOOD (key 56):", sfsUser.getVariable(USERVARIABLES.MOOD));
      console.log("  IMAGE (key 55):", sfsUser.getVariable(USERVARIABLES.IMAGE));
      console.log("  PX (key 7):", sfsUser.getVariable(USERVARIABLES.PX));
      console.log("  PY (key 8):", sfsUser.getVariable(USERVARIABLES.PY));
      console.log("  USERVARIABLES keys - SKIN:", USERVARIABLES.SKIN, "MOOD:", USERVARIABLES.MOOD, "IMAGE:", USERVARIABLES.IMAGE);
      console.log("  All Variables:", JSON.stringify(sfsUser.getVariables(), null, 2));

      // CRITICAL: Set initial position and game state (Flash expects these)
      sfsUser.setVariable(USERVARIABLES.PORTAL_ID, 0);
      // PX=7, PY=8 - CRITICAL for room display!
      sfsUser.setVariable(USERVARIABLES.PX, 450);   // Will be set to room default on join
      sfsUser.setVariable(USERVARIABLES.PY, 350);   // Will be set to room default on join
      sfsUser.setVariable(USERVARIABLES.SPEED, 4);  // Walking speed
      // Use numeric face action id (0 = FACE_S)
      sfsUser.setVariable(USERVARIABLES.FACE_DIRECTION, 0);
      sfsUser.setVariable(USERVARIABLES.EMOTION_ID, 0);
      sfsUser.setVariable(USERVARIABLES.GAME_ID, -1);
      sfsUser.setVariable(USERVARIABLES.ONE_ON_ONE_GAME_ID, -1);
      sfsUser.setVariable(USERVARIABLES.ONE_ON_ONE_ROOM_ID, -1);
      sfsUser.setVariable(USERVARIABLES.ANIMAL, "0");
      sfsUser.setVariable(USERVARIABLES.ANIMAL_TYPE_LEVEL, 0);
      sfsUser.setVariable(USERVARIABLES.LOCALE, "en");
      sfsUser.setVariable(USERVARIABLES.RECYCLE_INVENTORY_TYPE, 0);
      sfsUser.setVariable(USERVARIABLES.CAMPAIGN_TARGET, 0);
      sfsUser.setVariable(USERVARIABLES.ALLOW_POTIONS, 1);
      sfsUser.setVariable(USERVARIABLES.IN_TUTORIAL_MODE, 0);

      // Additional defaults aligned to AS expectations (numeric flags/values)
      sfsUser.setVariable(USERVARIABLES.HOUSE_LOCKED, user.house_locked ? 1 : 0);
      sfsUser.setVariable(USERVARIABLES.IS_TRADING, 0);
      sfsUser.setVariable(USERVARIABLES.IS_IN_CREDITSSTORE, 0);
      sfsUser.setVariable(USERVARIABLES.HOUSE_USER_ID, -1);
      sfsUser.setVariable(USERVARIABLES.HPX, -1);
      sfsUser.setVariable(USERVARIABLES.HPY, -1);
      sfsUser.setVariable(USERVARIABLES.HOUSE_FACE_DIRECTION, 0);
      sfsUser.setVariable(USERVARIABLES.HOUSE_EDIT_MODE, 0);
      sfsUser.setVariable(USERVARIABLES.ACTIVE_MOD, sfsUser.isModerator ? 1 : 0);
      sfsUser.setVariable(USERVARIABLES.EVENT_GROUP_ID, -1);

      // Ensure critical avatar variables are set (already done above, but double-check)
      if (sfsUser.getVariable(USERVARIABLES.IMAGE) == null)
        sfsUser.setVariable(USERVARIABLES.IMAGE, 0);
      if (sfsUser.getVariable(USERVARIABLES.MOOD) == null)
        sfsUser.setVariable(USERVARIABLES.MOOD, 1);
      if (sfsUser.getVariable(USERVARIABLES.SKIN) == null)
        sfsUser.setVariable(USERVARIABLES.SKIN, 1);

      sfsUser.setVariable(USERVARIABLES.INITIAL_ROOM, 101);

      // Parse equipped items (CRITICAL: Flash needs all slots defined)
      // The equiped field contains array of objects with item IDs and types: [{"0":itemId,"2":type}]
      if (user.equiped) {
        try {
          const equipped = JSON.parse(user.equiped);
          const resolved = [];

          // If equipped is an array of item objects {"0":itemId, "2":type}
          if (Array.isArray(equipped)) {
            const typeToUvar = {
              2: USERVARIABLES.AVATAR_HAIR,
              3: USERVARIABLES.AVATAR_EYES,
              4: USERVARIABLES.AVATAR_MOUTH,
              5: USERVARIABLES.AVATAR_SHIRT,
              6: USERVARIABLES.AVATAR_COAT,
              7: USERVARIABLES.AVATAR_PANTS,
              8: USERVARIABLES.AVATAR_SHOES,
              9: USERVARIABLES.AVATAR_GLASSES,
              10: USERVARIABLES.AVATAR_EARRINGS,
              11: USERVARIABLES.AVATAR_NECKLACE,
              12: USERVARIABLES.AVATAR_RING,
              13: USERVARIABLES.AVATAR_HOVERINGITEM,
              14: USERVARIABLES.AVATAR_HAT,
              15: USERVARIABLES.AVATAR_SKATES,
              16: USERVARIABLES.AVATAR_SKINTONE,
              17: USERVARIABLES.AVATAR_MAKEUP,
            };

            // Prefer mapping by item name prefix first (DB types are inconsistent in your data)
          const prefixToUvar = {
              // Clothing/body parts
              HFR: USERVARIABLES.AVATAR_HAIR,       // HFR_ -> Hair (front)
              EYE: USERVARIABLES.AVATAR_EYES,       // EYE_ -> Eyes
              MTH: USERVARIABLES.AVATAR_MOUTH,      // MTH_ -> Mouth
              SHT: USERVARIABLES.AVATAR_SHIRT,      // SHT_ -> Shirt (sleeves auto-managed)
              PTS: USERVARIABLES.AVATAR_PANTS,      // PTS_ -> Pants
              SHZ: USERVARIABLES.AVATAR_SHOES,      // SHZ_ -> Shoes
              GLS: USERVARIABLES.AVATAR_GLASSES,    // GLS_ -> Glasses
              EAR: USERVARIABLES.AVATAR_EARINGS,    // EAR_ -> Earrings
              NEK: USERVARIABLES.AVATAR_NECKLACE,   // NEK_ -> Necklace
              RNG: USERVARIABLES.AVATAR_RING,       // RNG_ -> Ring
              HAT: USERVARIABLES.AVATAR_HAT,        // HAT_ -> Hat
              SKT: USERVARIABLES.AVATAR_SKATES,     // SKT_ -> Skates/board
              HOV: USERVARIABLES.AVATAR_HOVERINGITEM,// HOV_ -> Hovering item
              MKP: USERVARIABLES.AVATAR_MAKEUP,     // MKP_ -> Makeup
              COT: USERVARIABLES.AVATAR_COAT,       // COT_ -> Coat/Jacket
            };

            // Parse format: [{"0":itemId, "2":type}, ...]
            for (const rawItem of equipped) {
              if (!rawItem || typeof rawItem !== 'object') continue;
              
              const itemId = parseInt(rawItem["0"] || rawItem[0], 10);
              const itemType = parseInt(rawItem["2"] || rawItem[2], 10);
              
              if (!itemId || itemId <= 0) continue;

              let itemData = null;
              try {
                if (dbClient) itemData = await this.getItemData(itemId);
              } catch (_) {}
              if (!itemData) continue; // Cannot resolve without item data

              // First try to infer by item name prefix (authoritative for this data)
              let uvarKey = null;
              if (itemData && itemData.name) {
                const prefix = String(itemData.name).split("_")[0].toUpperCase();
                uvarKey = prefixToUvar[prefix] || null;
              }

              // If prefix didn't resolve, fallback to DB item type mapping
              if (!uvarKey) {
                uvarKey = typeToUvar[itemData.type] || typeToUvar[itemType] || null;
              }

              if (!uvarKey) continue; // Unknown or unsupported type (e.g., EMPTY)

              const finalOrdinal =
                itemData && typeof itemData.ordinal === "number" && itemData.ordinal > 0
                  ? itemData.ordinal
                  : 0;

              sfsUser.setVariable(uvarKey, finalOrdinal);
              resolved.push({ id: itemId, type: itemData.type, name: itemData.name, uvar: uvarKey, ordinal: finalOrdinal });
            }
          }
          // If equipped is an object keyed by slot ids (19..28, 33), keep legacy mapping
          else if (equipped && typeof equipped === "object") {
            const entries = Object.entries(equipped || {});
            for (const [rawSlot, rawVal] of entries) {
              const slotNum = parseInt(rawSlot, 10);
              const uvarKey = this.mapSlotToUvar(slotNum);
              if (!uvarKey) continue;

              let value = parseInt(rawVal, 10) || 0;
              let finalOrdinal = value;

              // Try to map DB item ID -> ordinal if this looks like an item id and DB is available
              if (value > 0 && dbClient) {
                try {
                  const itemData = await this.getItemData(value);
                  if (
                    itemData &&
                    typeof itemData.ordinal === "number" &&
                    itemData.ordinal > 0
                  ) {
                    finalOrdinal = itemData.ordinal;
                  }
                } catch (_) {
                  // Non-fatal: fall back to value as-is
                }
              }

              sfsUser.setVariable(uvarKey, finalOrdinal);
              resolved.push({ slot: slotNum, uvar: uvarKey, raw: value, ordinal: finalOrdinal });
            }
          }

          // Debug visibility for equipped resolution
          DebugLogger.debug("AVATAR", `Resolved equipped items for ${username}`, {
            equippedRaw: equipped,
            resolved: resolved,
          });
        } catch (e) {
          console.error("Error parsing equipped items:", e);
        }
      }

      // CRITICAL: Ensure all avatar equipment UVars exist with numeric values
      // Flash client crashes if these are null/undefined
      const equipmentDefaults = [
        USERVARIABLES.AVATAR_COAT, // 19
        USERVARIABLES.AVATAR_SHIRT, // 20
        USERVARIABLES.AVATAR_PANTS, // 21
        USERVARIABLES.AVATAR_SHOES, // 22
        USERVARIABLES.AVATAR_EARINGS, // 23
        USERVARIABLES.AVATAR_NECKLACE, // 24
        USERVARIABLES.AVATAR_GLASSES, // 25
        USERVARIABLES.AVATAR_RING, // 26
        USERVARIABLES.AVATAR_HOVERINGITEM, // 27
        USERVARIABLES.AVATAR_HAT, // 28
        USERVARIABLES.AVATAR_SKATES, // 33
      ];
      for (const key of equipmentDefaults) {
        if (
          sfsUser.getVariable(key) == null ||
          sfsUser.getVariable(key) === undefined
        ) {
          sfsUser.setVariable(key, 0);
        }
      }

      // Do not force sentinel clothing IDs. Keep 0 as "no item" to avoid loading invalid items
      // If you want default clothing, map to a real item ID present in assets, not 999999.
      // Leaving as 0 ensures the avatar base renders without failing asset loads.

      socket.sfsUser = sfsUser;
      this.users.set(sfsUser.id, sfsUser);

      // Mark socket as authenticated for accurate state/logging
      socket.authenticated = true;

      // Update last login in database
      await this.updateLastLogin(user.account_id, user.player_id);

      // Send login success
      this.sendLoginOK(socket, sfsUser);

      // Immediately send LoginExtension OK (JSON) so Shell.swf can proceed
      this.sendLoginExtensionOK(socket, sfsUser);

      // The client will automatically request room list after login
      // No need to send it here - wait for getRmList action
    } catch (error) {
      console.error("Login error:", error);
      this.sendLoginError(socket, "Server error during login");
    }
  }

  async authenticateUser(username, hashedPassword, randomKey) {
    DebugLogger.info("AUTH", `Authenticating user`, {
      username: username,
      hasRandomKey: !!randomKey,
      hasHashedPassword: !!hashedPassword,
      dbAvailable: !!dbClient,
    });

    PerformanceMonitor.start(`AUTH_${username}`);

    if (!dbClient) {
      // No PostgreSQL — fall back to the local JSON user store. The user must
      // have already been created via POST /register; we never auto-create on
      // login (that would let anyone log in as anyone).
      const row = usersStore.findByUsername(username);
      if (!row) {
        DebugLogger.warn("AUTH", "JSON-store auth failed: user not found", { username });
        PerformanceMonitor.end(`AUTH_${username}`);
        return null;
      }
      if (!usersStore.verify(row, hashedPassword, randomKey)) {
        DebugLogger.warn("AUTH", "JSON-store auth failed: bad password", { username });
        PerformanceMonitor.end(`AUTH_${username}`);
        return null;
      }
      usersStore.update(username, { last_login: new Date().toISOString() });
      DebugLogger.info("AUTH", "JSON-store auth OK", { username, playerId: row.player_id });
      PerformanceMonitor.end(`AUTH_${username}`);
      // Match the shape the rest of handleLogin() expects.
      return {
        account_id: row.account_id,
        player_id: row.player_id,
        username: row.username,
        email: row.email,
        level: row.level,
        gold: row.gold,
        activity_points: row.activity_points,
        leadership_points: row.leadership_points,
        is_premium: row.is_premium,
        premium_days_left: row.premium_days_left,
        is_mod: row.is_mod,
        ranger_level: row.ranger_level,
        seniority_level: row.seniority_level,
        advisor_level: row.advisor_level,
        gender: row.gender,
        skintone: row.skintone,
        eyes: row.eyes,
        mouth: row.mouth,
        hair: row.hair,
        makeup: row.makeup,
        equiped: row.equiped,
        inventory: row.inventory,
        recycle_inventory: row.recycle_inventory,
        animal_level: row.animal_level,
        has_house: row.has_house,
        house_locked: row.house_locked,
        tutorial_step: row.tutorial_step,
        card_albums: row.card_albums,
        card_inventory: row.card_inventory,
        potions: row.potions,
        animals_adopted: row.animals_adopted,
        gardener_level: row.gardener_level,
        gardener_points: row.gardener_points,
        credits_store_credits: row.credits_store_credits,
        first_login: !row.last_login,
        is_activated: true,
      };
    }

    try {
      this.stats.dbQueries++;
      DebugLogger.db("Executing authentication query", { username: username });

      // Get account with joined player data in one query
      const result = await dbClient.query(
        `
                SELECT
                    a.id as account_id,
                    a.username,
                    a.password,
                    a.password_hash,
                    a.email,
                    a.is_activated,
                    a.is_banned,
                    a.ispaying as is_premium_account,
                    a.ranger_level as account_ranger_level,
                    p.id as player_id,
                    p.name as player_name,
                    p.level,
                    p.gold,
                    p.activity_points,
                    p.leadership_points,
                    p.skintone,
                    p.eyes,
                    p.mouth,
                    p.hair,
                    p.makeup,
                    p.gender,
                    p.is_mod,
                    p.mod,
                    p.equiped,
                    p.inventory,
                    p.recycle_inventory,
                    p.online,
                    p.ranger_level,
                    p.seniority_level,
                    p.advisor_level,
                    p.is_premium,
                    p.premium_days_left,
                    p.animal_level,
                    p.has_house,
                    p.house_locked,
                    p.tutorial_step,
                    p.card_albums,
                    p.card_inventory,
                    p.potions,
                    p.animals_adopted,
                    p.gardener_level,
                    p.gardener_points,
                    p.credits_store_credits
                FROM accounts a
                LEFT JOIN players p ON a.id = p.user_id
                WHERE a.username = $1 AND (a.is_banned IS NULL OR a.is_banned = false)
            `,
        [username],
      );

      if (result.rows.length === 0) {
        DebugLogger.warn(
          "AUTH",
          `Authentication failed: User not found or banned`,
          { username: username },
        );
        PerformanceMonitor.end(`AUTH_${username}`);
        return null;
      }

      const row = result.rows[0];

      DebugLogger.info("AUTH", "User found in database", {
        username: username,
        accountId: row.account_id,
        playerId: row.player_id,
        isActivated: row.is_activated,
        isPremium: row.is_premium || row.is_premium_account,
        isMod: row.is_mod,
      });

      // Check if account is activated
      if (!row.is_activated) {
        DebugLogger.warn("AUTH", `Authentication failed: User not activated`, {
          username: username,
        });
        PerformanceMonitor.end(`AUTH_${username}`);
        return null;
      }

      // Verify password with MD5 hash
      if (
        !this.verifyPassword(
          hashedPassword,
          row.password,
          row.password_hash,
          randomKey,
        )
      ) {
        DebugLogger.warn("AUTH", `Authentication failed: Invalid password`, {
          username: username,
        });
        PerformanceMonitor.end(`AUTH_${username}`);
        return null;
      }

      // Check if player exists
      if (!row.player_id) {
        DebugLogger.warn("AUTH", `Authentication failed: No player data`, {
          username: username,
        });
        PerformanceMonitor.end(`AUTH_${username}`);
        return null;
      }

      const userData = {
        account_id: row.account_id,
        player_id: row.player_id,
        username: row.username,
        email: row.email || "",
        level: row.level || 1,
        gold: row.gold || 0,
        activity_points: row.activity_points || 0,
        leadership_points: row.leadership_points || 0,
        is_premium: row.is_premium || row.is_premium_account || false,
        premium_days_left: row.premium_days_left || 0,
        is_mod: row.is_mod || row.mod || false,
        ranger_level: row.ranger_level || row.account_ranger_level || 0,
        seniority_level: row.seniority_level || 1,
        advisor_level: row.advisor_level || 0,
        gender: row.gender || 1,
        skintone: row.skintone || 1,
        eyes: row.eyes || 1,
        mouth: row.mouth || 1,
        hair: row.hair || 1,
        makeup: row.makeup || 0,
        equiped: row.equiped || '{"19":0,"20":0,"21":0,"22":0}',
        inventory: row.inventory || "{}",
        recycle_inventory: row.recycle_inventory || "{}",
        animal_level: row.animal_level || 0,
        has_house: row.has_house || false,
        house_locked: row.house_locked || false,
        tutorial_step: row.tutorial_step || 0,
        card_albums: row.card_albums || "{}",
        card_inventory: row.card_inventory || "{}",
        potions: row.potions || "{}",
        animals_adopted: row.animals_adopted || "{}",
        gardener_level: row.gardener_level || 0,
        gardener_points: row.gardener_points || 0,
        credits_store_credits: row.credits_store_credits || 0,
        first_login: false,
        is_activated: true,
      };

      DebugLogger.info("AUTH", "Authentication successful", {
        username: username,
        accountId: userData.account_id,
        playerId: userData.player_id,
        level: userData.level,
        gold: userData.gold,
        isPremium: userData.is_premium,
        isMod: userData.is_mod,
      });

      PerformanceMonitor.end(`AUTH_${username}`);
      return userData;
    } catch (error) {
      this.stats.errors++;
      DebugLogger.error("AUTH", "Database authentication error", {
        username: username,
        error: error.message,
        code: error.code,
      });
      PerformanceMonitor.end(`AUTH_${username}`);
      return null;
    }
  }

  verifyPassword(hashedPassword, dbPassword, dbPasswordHash, randomKey) {
    // Client sends: MD5(randomKey + actualPassword)
    // This matches the ActionScript implementation: MD5.hash(randomKey + password)
    if (dbPasswordHash) {
      // Use stored MD5 hash - create expected hash: MD5(randomKey + storedPassword)
      const expectedHash = crypto
        .createHash("md5")
        .update(randomKey + dbPasswordHash)
        .digest("hex");
      return hashedPassword === expectedHash;
    } else if (dbPassword) {
      // Plain text password in DB - create expected hash: MD5(randomKey + plainPassword)
      const expectedHash = crypto
        .createHash("md5")
        .update(randomKey + dbPassword)
        .digest("hex");
      return hashedPassword === expectedHash;
    }
    return false;
  }

  mapSlotToUvar(slot) {
    const slotMapping = {
      19: PROTOCOL.USERVARIABLES.AVATAR_COAT,
      20: PROTOCOL.USERVARIABLES.AVATAR_SHIRT,
      21: PROTOCOL.USERVARIABLES.AVATAR_PANTS,
      22: PROTOCOL.USERVARIABLES.AVATAR_SHOES,
      23: PROTOCOL.USERVARIABLES.AVATAR_EARINGS,
      24: PROTOCOL.USERVARIABLES.AVATAR_NECKLACE,
      25: PROTOCOL.USERVARIABLES.AVATAR_GLASSES,
      26: PROTOCOL.USERVARIABLES.AVATAR_RING,
      27: PROTOCOL.USERVARIABLES.AVATAR_HOVERINGITEM,
      28: PROTOCOL.USERVARIABLES.AVATAR_HAT,
      33: PROTOCOL.USERVARIABLES.AVATAR_SKATES,
    };
    return slotMapping[slot];
  }

  async updateLastLogin(accountId, playerId) {
    if (!dbClient) return;

    try {
      const now = new Date().toISOString();
      await dbClient.query(
        "UPDATE accounts SET last_login = $1 WHERE id = $2",
        [now, accountId],
      );
      await dbClient.query(
        "UPDATE players SET last_login = $1, online = true WHERE id = $2",
        [now, playerId],
      );
    } catch (error) {
      console.error("Error updating last login:", error);
    }
  }

  handleLogout(socket) {
    if (socket.sfsUser) {
      console.log(`User ${socket.sfsUser.name} logged out`);

      // Remove from current room
      if (socket.sfsUser.currentRoom) {
        this.leaveUserFromRoom(socket.sfsUser, socket.sfsUser.currentRoom);
      }

      // Update online status in database
      this.setUserOffline(socket.sfsUser);

      // Remove user from server
      this.users.delete(socket.sfsUser.id);
      socket.sfsUser = null;
    }

    this.sendLogoutResponse(socket);
  }

  async setUserOffline(user) {
    if (!dbClient || !user.dbId) return;

    try {
      await dbClient.query("UPDATE players SET online = false WHERE id = $1", [
        user.dbId,
      ]);
    } catch (error) {
      console.error("Error setting user offline:", error);
    }
  }

  handleGetRoomList(socket) {
    if (!socket.sfsUser) return;

    DebugLogger.info(
      "ROOM",
      `Sending room list to user ${socket.sfsUser.name}`,
    );
    this.sendRoomList(socket);
  }

  ensureDefaultRoomsExist() {
    // Ensure room 101 (default starting room) exists
    if (!this.rooms.has(101)) {
      const defaultRoom = new Room(
        101,
        "101",
        50,
        10,
        false,
        false,
        false,
        false,
      );
      // Set any necessary room variables for room 101
      defaultRoom.setVariable("world_room", true);
      defaultRoom.setVariable("room_type", "jungle");
      this.rooms.set(101, defaultRoom);
      DebugLogger.info("ROOM", "Created default room 101");
    }
  }

  handleJoinRoom(socket, content) {
    if (!socket.sfsUser) {
      DebugLogger.warn("ROOM", "Join room attempt without logged in user", {
        connectionId: socket.connectionId,
      });
      return;
    }

    DebugLogger.debug("ROOM", "Processing joinRoom request", {
      connectionId: socket.connectionId,
      user: socket.sfsUser.name,
      content: content,
      contentLength: content ? content.length : 0,
    });

    // Parse join room XML - handle both single and double quotes
    const roomMatch = content.match(
      /<room id=['"]?(\d+)['"]? pwd=['"]?([^'"]*)['"]? spec=['"]?([01])['"]? leave=['"]?([01])['"]? old=['"]?(-?\d+)['"]? ?\/>/,
    );
    if (!roomMatch) {
      DebugLogger.error("ROOM", "Invalid room join format", {
        user: socket.sfsUser.name,
        content: content,
      });
      this.sendJoinRoomError(socket, "Invalid room join format");
      return;
    }

    const roomId = parseInt(roomMatch[1]);
    const password = roomMatch[2];
    const isSpectator = roomMatch[3] === "1";
    const shouldLeave = roomMatch[4] === "1";
    const oldRoomId = parseInt(roomMatch[5]);

    DebugLogger.user(`User attempting to join room`, {
      user: socket.sfsUser.name,
      userId: socket.sfsUser.id,
      roomId: roomId,
      isSpectator: isSpectator,
      shouldLeave: shouldLeave,
      oldRoomId: oldRoomId,
      hasPassword: !!password,
    });

    // Ensure the requested room exists
    if (!this.rooms.has(roomId)) {
      // Try to create the room if it's a valid world room
      if (roomId >= 100 && roomId <= 999) {
        const newRoom = new Room(
          roomId,
          String(roomId),
          50,
          10,
          false,
          false,
          false,
          false,
        );
        newRoom.setVariable("world_room", true);
        this.rooms.set(roomId, newRoom);
        DebugLogger.info("ROOM", `Auto-created world room ${roomId}`);
      } else {
        this.sendJoinRoomError(socket, "Room does not exist");
        return;
      }
    }

    const room = this.rooms.get(roomId);

    // Check room capacity
    if (!isSpectator && room.userCount >= room.maxUsers) {
      this.sendJoinRoomError(socket, "Room is full");
      return;
    }

    if (isSpectator && room.spectatorCount >= room.maxSpectators) {
      this.sendJoinRoomError(socket, "Spectator area is full");
      return;
    }

    // Leave current room if needed
    if (shouldLeave && socket.sfsUser.currentRoom) {
      this.leaveUserFromRoom(socket.sfsUser, socket.sfsUser.currentRoom);
    }

    // Set spectator status
    socket.sfsUser.isSpectator = isSpectator;
    socket.sfsUser.playerId = socket.sfsUser.id;
    socket.sfsUser.currentRoom = room;

    // Add user to room
    room.addUser(socket.sfsUser, socket.sfsUser.id);

    // Send join room success FIRST before sending updates
    this.sendJoinRoomOK(socket, room);

    // Then update room user/spectator counts for all clients
    this.sendUserCountUpdate(room);

    // Finally notify other users in room (deferred slightly so the client processes joinOK first)
    setTimeout(() => {
      if (socket && socket.sfsUser && !socket.destroyed) {
        this.sendUserEnterRoom(room, socket.sfsUser);

        // CRITICAL FIX: Explicitly broadcast ALL user variables to room
        // This ensures avatar appearance is visible to everyone immediately
        setTimeout(() => {
          try {
            if (socket && socket.sfsUser && !socket.destroyed) {
              const u = socket.sfsUser;
              const allVars = Object.keys(u.getVariables());
              
              console.log("🟢 AVATAR FIX - Broadcasting all user vars after join for", u.name);
              console.log("  Total variables:", allVars.length);
              console.log("  SKIN:", u.getVariable(USERVARIABLES.SKIN));
              console.log("  MOOD:", u.getVariable(USERVARIABLES.MOOD));
              console.log("  IMAGE:", u.getVariable(USERVARIABLES.IMAGE));
              console.log("  PX:", u.getVariable(USERVARIABLES.PX));
              console.log("  PY:", u.getVariable(USERVARIABLES.PY));
              
              if (allVars.length > 0) {
                // Send to self for local state finalization
                this.sendUserVarsSnapshotToUser(socket, room, u, allVars);
                // Broadcast to all others in room
                this.broadcastUserVariableUpdate(room, u, allVars);
              }
            }
          } catch (e) {
            console.error("❌ Error broadcasting user vars after join:", e);
          }
        }, 200);
      }
    }, 80);
  }

  handleLeaveRoom(socket, roomId, content) {
    if (!socket.sfsUser) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    this.leaveUserFromRoom(socket.sfsUser, room);
    this.sendLeaveRoomResponse(socket, room);
  }

  leaveUserFromRoom(user, room) {
    if (!room || !user) return;

    DebugLogger.info("ROOM", `User ${user.name} leaving room ${room.id}`);

    // Remove user from room
    room.removeUser(user.id);

    // Update room user/spectator counts for all clients
    this.sendUserCountUpdate(room);

    // Notify other users in room
    this.sendUserLeaveRoom(room, user);
  }

  handleAutoJoin(socket) {
    if (!socket.sfsUser) return;

    // Find a suitable room to join
    let targetRoom = null;
    for (let [roomId, room] of this.rooms) {
      if (room.userCount < room.maxUsers && !room.isPrivate) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      // Create or join default room
      targetRoom = this.rooms.get(101) || this.rooms.values().next().value;
    }

    if (targetRoom) {
      // Add user to room
      targetRoom.addUser(socket.sfsUser, socket.sfsUser.id);
      socket.sfsUser.playerId = socket.sfsUser.id;
      // Update room user/spectator counts for all clients
      this.sendUserCountUpdate(targetRoom);

      // Send join room success
      this.sendJoinRoomOK(socket, targetRoom);

      // Notify other users in room
      this.sendUserEnterRoom(targetRoom, socket.sfsUser);
    }
  }

  handlePublicMessage(socket, roomId, content) {
    if (!socket.sfsUser) return;

    const room = this.rooms.get(roomId);
    if (!room || !room.getUser(socket.sfsUser.id)) return;

    // Extract message from CDATA
    const messageMatch = content.match(/<txt><!\[CDATA\[([^\]]*)\]\]><\/txt>/);
    if (!messageMatch) return;

    const message = messageMatch[1];
    DebugLogger.info(
      "CHAT",
      `Public message from ${socket.sfsUser.name} in room ${roomId}`,
    );

    // Broadcast message to all users in room
    this.broadcastPublicMessage(room, socket.sfsUser, message);
  }

  handlePrivateMessage(socket, roomId, content) {
    if (!socket.sfsUser) return;

    // Extract recipient and message from XML
    const messageMatch = content.match(
      /<txt rcp='(\d+)'><!\[CDATA\[([^\]]*)\]\]><\/txt>/,
    );
    if (!messageMatch) return;

    const recipientId = parseInt(messageMatch[1]);
    const message = messageMatch[2];

    const recipient = this.users.get(recipientId);
    if (!recipient) return;

    DebugLogger.info(
      "CHAT",
      `Private message from ${socket.sfsUser.name} to ${recipient.name}`,
    );

    // Send private message
    this.sendPrivateMessage(socket.sfsUser, recipient, message, roomId);
  }

  handleModeratorMessage(socket, roomId, content) {
    if (!socket.sfsUser || !socket.sfsUser.isModerator) return;

    // Extract message from XML
    const messageMatch = content.match(
      /<txt t='([^']*)' id='(\d+)'><!\[CDATA\[([^\]]*)\]\]><\/txt>/,
    );
    if (!messageMatch) return;

    const messageType = messageMatch[1];
    const targetId = parseInt(messageMatch[2]);
    const message = messageMatch[3];

    console.log(
      `Moderator message from ${socket.sfsUser.name}: ${message} (type: ${messageType}, target: ${targetId})`,
    );

    // Handle different moderator message types
    this.sendModeratorMessage(
      socket.sfsUser,
      message,
      messageType,
      targetId,
      roomId,
    );
  }

  handleSetUserVariables(socket, roomId, content) {
    if (!socket.sfsUser) return;

    // Parse user variables from XML
    const variables = this.parseVariablesXml(content);

    // Enhanced user variable logging
    if (DEBUG_CONFIG.LOG_USER_VARIABLES) {
      DebugLogger.debug("USER", "Processing user variable changes", {
        connectionId: socket.connectionId,
        user: socket.sfsUser.name,
        roomId: roomId,
        variableCount: Object.keys(variables).length,
        variableNames: Object.keys(variables),
        contentLength: content ? content.length : 0,
      });
    }

    // Update user variables
    const changedVars = [];
    const variableChanges = [];

    for (let varName in variables) {
      const oldValue = socket.sfsUser.getVariable(varName);
      const newValue = variables[varName];

      if (oldValue !== newValue) {
        socket.sfsUser.setVariable(varName, newValue);
        changedVars.push(varName);

        // Log individual variable changes
        if (DEBUG_CONFIG.LOG_USER_VARIABLES) {
          variableChanges.push({
            variableName: varName,
            oldValue: oldValue,
            newValue: newValue,
            valueType: typeof newValue,
          });
        }
      }
    }

    // Log all variable changes if any occurred
    if (DEBUG_CONFIG.LOG_USER_VARIABLES && changedVars.length > 0) {
      DebugLogger.info("USER", "User variables changed", {
        connectionId: socket.connectionId,
        user: socket.sfsUser.name,
        roomId: roomId,
        changedVariableCount: changedVars.length,
        changes: variableChanges,
        timestamp: new Date().toISOString(),
      });
    }

    if (changedVars.length > 0) {
      // Broadcast user variable changes to all rooms the user is in
      for (let [roomId, room] of this.rooms) {
        if (room.getUser(socket.sfsUser.id)) {
          this.broadcastUserVariableUpdate(room, socket.sfsUser, changedVars);
        }
      }

      // Update database with new variables
      this.saveUserVariablesToDB(socket.sfsUser, variables);
    }
  }

  handleSetRoomVariables(socket, roomId, content) {
    if (!socket.sfsUser) return;

    const room = this.rooms.get(roomId);
    if (!room || !room.getUser(socket.sfsUser.id)) return;

    // Parse room variables from XML
    const variables = this.parseVariablesXml(content);

    DebugLogger.info("ROOM", `Setting room variables for room ${roomId}`);

    // Update room variables
    const changedVars = [];
    for (let varName in variables) {
      const oldValue = room.getVariable(varName);
      const newValue = variables[varName];

      if (oldValue !== newValue) {
        room.setVariables({ [varName]: newValue });
        changedVars.push(varName);
      }
    }

    if (changedVars.length > 0) {
      // Broadcast room variable changes to all users in room
      this.broadcastRoomVariableUpdate(room, socket.sfsUser, changedVars);
    }
  }

  parseVariablesXml(content) {
    const variables = {};

    // Match <vars> content
    const varsMatch = content.match(/<vars[^>]*>(.*?)<\/vars>/s);
    if (!varsMatch) return variables;

    const varsContent = varsMatch[1];

    // Match individual <var> elements
    const varRegex =
      /<var n='([^']*)' t='([^']*)' pr='([^']*)' pe='([^']*)'><!\[CDATA\[([^\]]*)\]\]><\/var>/g;
    let match;

    while ((match = varRegex.exec(varsContent)) !== null) {
      const varName = match[1];
      const varType = match[2];
      const isPrivate = match[3] === "1";
      const isPersistent = match[4] === "1";
      const varValue = match[5];

      // Convert value based on type
      let convertedValue;
      switch (varType) {
        case "b": // boolean
          convertedValue = varValue === "1";
          break;
        case "n": // number
          convertedValue = parseFloat(varValue);
          break;
        case "s": // string
          convertedValue = varValue;
          break;
        case "x": // null/undefined
          convertedValue = null;
          break;
        default:
          convertedValue = varValue;
      }

      variables[varName] = convertedValue;
    }

    return variables;
  }

  async saveUserVariablesToDB(user, variables) {
    if (!dbClient || !user.dbId) return;

    try {
      // Save specific user variables to player table
      const updates = [];
      const values = [user.dbId];
      let paramIndex = 2;

      // Map user variables to database columns
      const varMapping = {
        [PROTOCOL.USERVARIABLES.LEVEL]: "level",
        [PROTOCOL.USERVARIABLES.LEADERSHIP]: "leadership_points",
        [PROTOCOL.USERVARIABLES.AVATAR_GENDER]: "gender",
        [PROTOCOL.USERVARIABLES.AVATAR_SKINTONE]: "skintone",
        [PROTOCOL.USERVARIABLES.AVATAR_EYES]: "eyes",
        [PROTOCOL.USERVARIABLES.AVATAR_MOUTH]: "mouth",
        [PROTOCOL.USERVARIABLES.AVATAR_HAIR]: "hair",
        [PROTOCOL.USERVARIABLES.AVATAR_MAKEUP]: "makeup",
        [PROTOCOL.USERVARIABLES.RANGER_LEVEL]: "ranger_level",
        [PROTOCOL.USERVARIABLES.SENIORITY_LEVEL]: "seniority_level",
        [PROTOCOL.USERVARIABLES.ADVISOR_LEVEL]: "advisor_level",
      };

      for (let varName in variables) {
        const dbColumn = varMapping[varName];
        if (dbColumn) {
          updates.push(`${dbColumn} = $${paramIndex}`);
          values.push(variables[varName]);
          paramIndex++;
        }
      }

      if (updates.length > 0) {
        const query = `UPDATE players SET ${updates.join(", ")} WHERE id = $1`;
        await dbClient.query(query, values);
        DebugLogger.info("DB", "Updated player data in database");
      }

      // Also save equipped items if they changed
      const equippedItems = {};
      let hasEquippedChanges = false;

      const equipMapping = {
        [PROTOCOL.USERVARIABLES.AVATAR_COAT]: "19",
        [PROTOCOL.USERVARIABLES.AVATAR_SHIRT]: "20",
        [PROTOCOL.USERVARIABLES.AVATAR_PANTS]: "21",
        [PROTOCOL.USERVARIABLES.AVATAR_SHOES]: "22",
        [PROTOCOL.USERVARIABLES.AVATAR_EARINGS]: "23",
        [PROTOCOL.USERVARIABLES.AVATAR_NECKLACE]: "24",
        [PROTOCOL.USERVARIABLES.AVATAR_GLASSES]: "25",
        [PROTOCOL.USERVARIABLES.AVATAR_RING]: "26",
        [PROTOCOL.USERVARIABLES.AVATAR_HOVERINGITEM]: "27",
        [PROTOCOL.USERVARIABLES.AVATAR_HAT]: "28",
        [PROTOCOL.USERVARIABLES.AVATAR_SKATES]: "33",
      };

      for (let varName in variables) {
        const slot = equipMapping[varName];
        if (slot) {
          equippedItems[slot] = variables[varName] || 0;
          hasEquippedChanges = true;
        }
      }

      if (hasEquippedChanges) {
        const equippedJson = JSON.stringify(equippedItems);
        await dbClient.query("UPDATE players SET equiped = $1 WHERE id = $2", [
          equippedJson,
          user.dbId,
        ]);
        DebugLogger.info("DB", "Updated equipped items in database");
      }
    } catch (error) {
      console.error("Error saving user variables to database:", error);
    }
  }

  handleActionScriptObject(socket, roomId, content) {
    if (!socket.sfsUser) return;

    const room = this.rooms.get(roomId);
    if (!room || !room.getUser(socket.sfsUser.id)) return;

    // Extract serialized object from CDATA
    const objectMatch = content.match(/<!\[CDATA\[([^\]]*)\]\]>/);
    if (!objectMatch) return;

    const serializedObject = objectMatch[1];

    DebugLogger.info(
      "AS_OBJ",
      `ActionScript object from ${socket.sfsUser.name} in room ${roomId}`,
    );

    // Broadcast object to all users in room (except sender)
    this.broadcastActionScriptObject(room, socket.sfsUser, serializedObject);
  }

  handleActionScriptObjectGroup(socket, roomId, content) {
    if (!socket.sfsUser) return;

    const room = this.rooms.get(roomId);
    if (!room || !room.getUser(socket.sfsUser.id)) return;

    // Similar to handleActionScriptObject but for specific group of users
    // Implementation would depend on how groups are specified in the object
    this.handleActionScriptObject(socket, roomId, content);
  }

  // Buddy system handlers
  handleAddBuddy(socket, content) {
    if (!socket.sfsUser) return;

    // Extract buddy name from XML
    const nameMatch = content.match(/<n>([^<]*)<\/n>/);
    if (!nameMatch) return;

    const buddyName = nameMatch[1];

    DebugLogger.info(
      "BUDDY",
      `${socket.sfsUser.name} wants to add buddy: ${buddyName}`,
    );

    // Find target user
    const targetUser = this.findUserByName(buddyName);
    if (!targetUser) {
      this.sendBuddyError(socket, "User not found");
      return;
    }

    if (targetUser.id === socket.sfsUser.id) {
      this.sendBuddyError(socket, "Cannot add yourself as buddy");
      return;
    }

    // Check if already in buddy list
    if (this.isBuddy(socket.sfsUser, targetUser)) {
      this.sendBuddyError(socket, "User already in buddy list");
      return;
    }

    // Send buddy request to target user
    this.sendBuddyRequest(socket.sfsUser, targetUser);
  }

  handleRemoveBuddy(socket, content) {
    if (!socket.sfsUser) return;

    // Extract buddy name from XML
    const nameMatch = content.match(/<n>([^<]*)<\/n>/);
    if (!nameMatch) return;

    const buddyName = nameMatch[1];

    DebugLogger.info(
      "BUDDY",
      `${socket.sfsUser.name} wants to remove buddy: ${buddyName}`,
    );

    // Remove from buddy list
    this.removeBuddyFromList(socket.sfsUser, buddyName);

    // Send updated buddy list
    this.sendBuddyList(socket);
  }

  handleLoadBuddyList(socket) {
    if (!socket.sfsUser) return;

    DebugLogger.info("BUDDY", `Loading buddy list for ${socket.sfsUser.name}`);
    this.sendBuddyList(socket);
  }

  handleClearBuddyList(socket) {
    if (!socket.sfsUser) return;

    console.log(`Clearing buddy list for ${socket.sfsUser.name}`);
    socket.sfsUser.buddyList = [];
    this.sendBuddyList(socket);
  }

  handleSetBuddyVariables(socket, content) {
    if (!socket.sfsUser) return;

    // Parse buddy variables from XML
    const variables = this.parseVariablesXml(content);

    DebugLogger.info(
      "BUDDY",
      `Setting buddy variables for ${socket.sfsUser.name}`,
    );

    // Update buddy variables
    for (let varName in variables) {
      socket.sfsUser.myBuddyVars[varName] = variables[varName];
    }

    // Notify buddies of variable changes
    this.notifyBuddyVariableUpdate(socket.sfsUser, variables);
  }

  handleBuddyRoom(socket, content) {
    if (!socket.sfsUser) return;

    // Extract buddy ID from XML
    const buddyMatch = content.match(/<b id='(\d+)' \/>/);
    if (!buddyMatch) return;

    const buddyId = parseInt(buddyMatch[1]);
    const buddy = this.users.get(buddyId);

    if (buddy && buddy.currentRoom) {
      this.sendBuddyRoom(socket, buddy, buddy.currentRoom);
    }
  }

  handleBuddyPermission(socket, content) {
    if (!socket.sfsUser) return;

    // Extract response and requester name from XML
    const responseMatch = content.match(/<n res='([gr])'>([^<]*)<\/n>/);
    if (!responseMatch) return;

    const response = responseMatch[1]; // 'g' for grant, 'r' for reject
    const requesterName = responseMatch[2];

    console.log(
      `Buddy permission response from ${socket.sfsUser.name}: ${response} for ${requesterName}`,
    );

    const requester = this.findUserByName(requesterName);
    if (!requester) return;

    if (response === "g") {
      // Grant buddy request
      this.addToBuddyList(socket.sfsUser, requester);
      this.addToBuddyList(requester, socket.sfsUser);

      // Send confirmation to both users
      this.sendBuddyAdded(socket, requester);
      this.sendBuddyAdded(requester.socket, socket.sfsUser);

      // Send updated buddy lists
      this.sendBuddyList(socket);
      this.sendBuddyList(requester.socket);
    } else {
      // Reject buddy request
      this.sendBuddyRejected(requester.socket, socket.sfsUser);
    }
  }

  // Extension handlers
  handleLoginExtension(socket, params, messageType) {
    if (!socket.sfsUser) {
      DebugLogger.error(
        "LOGIN_EXT",
        "Login extension called without authenticated user",
        {
          connectionId: socket.connectionId,
        },
      );
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_LOGIN_ERROR,
          [PROTOCOL.COMMANDS.V_ERROR]: "Not logged in",
        },
        messageType,
      );
      return;
    }

    const user = socket.sfsUser;
    const p = user.playerData || {};

    DebugLogger.debug("LOGIN_EXT", "Processing login extension request", {
      connectionId: socket.connectionId,
      user: user.name,
      userId: user.id,
      messageType: messageType,
    });

    // Build V_PARAMS object using PLAYER.* numeric keys
    const paramsObj = {};
    paramsObj[PROTOCOL.PLAYER.ID] = user.dbId || user.id;
    paramsObj[PROTOCOL.PLAYER.LEVEL] = p.level || 1;
    paramsObj[PROTOCOL.PLAYER.LEVEL_TARGET] = p.level_target || 0;
    paramsObj[PROTOCOL.PLAYER.GOLD] = p.gold || 0;
    paramsObj[PROTOCOL.PLAYER.ACTIVITY_POINTS] = p.activity_points || 0;
    paramsObj[PROTOCOL.PLAYER.MOD] = p.is_mod ? 1 : 0;
    paramsObj[PROTOCOL.PLAYER.LEADER] = p.leadership_points || 0;
    paramsObj[PROTOCOL.PLAYER.GENDER] = p.gender || 1;
    paramsObj[PROTOCOL.PLAYER.MAY_CHANGE_LEAD] = p.may_change_lead ? 1 : 0;
    paramsObj[PROTOCOL.PLAYER.ONE_ON_ONE_GAMES] = p.one_on_one_games || [];
    paramsObj[PROTOCOL.PLAYER.RANGER_LEVEL] = p.ranger_level || 0;
    paramsObj[PROTOCOL.PLAYER.NO_CHAT_UNTIL] = p.no_chat_until || 0;
    paramsObj[PROTOCOL.PLAYER.MINUTES_PLAYED] = p.minutes_played || 0;
    paramsObj[PROTOCOL.PLAYER.NEW_PREMIUM] = p.new_premium ? 1 : 0;
    paramsObj[PROTOCOL.PLAYER.PIONEER_POINTS] = p.pioneer_points || 0;
    paramsObj[PROTOCOL.PLAYER.DAYS_FOR_NEXT_SENIORITY_LEVEL] =
      p.days_for_next_seniority_level || 0;
    paramsObj[PROTOCOL.PLAYER.SENIORITY_DAYS_PLAYED] =
      p.seniority_days_played || 0;
    paramsObj[PROTOCOL.PLAYER.SENIORITY_LEVEL] = p.seniority_level || 1;
    paramsObj[PROTOCOL.PLAYER.RANGER_APPLICABLE] = p.ranger_applicable ? 1 : 0;
    paramsObj[PROTOCOL.PLAYER.DAYS_PLAYED] = p.days_played || 0;
    paramsObj[PROTOCOL.PLAYER.GREEN_RANGER_APPLICABLE] =
      p.green_ranger_applicable ? 1 : 0;
    paramsObj[PROTOCOL.PLAYER.SENIOR_RANGER_APPLICABLE] =
      p.senior_ranger_applicable ? 1 : 0;
    paramsObj[PROTOCOL.PLAYER.TUTORIAL_STEP] = p.tutorial_step || 0;
    paramsObj[PROTOCOL.PLAYER.TUTORIAL_ID] = p.tutorial_id || 0;
    paramsObj[PROTOCOL.PLAYER.HELPER_FLOW] = p.helper_flow || 0;
    paramsObj[PROTOCOL.PLAYER.ANIMALS_ADOPTED] = p.animals_adopted_count || 0;

    // Build V_USER_VARS directly from user variables (keys already numeric per USERVARIABLES)
    const userVars = user.getVariables();

    // Compose full response matching Main.as expectations
    const responseData = {
      [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_LOGIN_OK,
      [PROTOCOL.COMMANDS.V_SFS_UID]: user.id,
      [PROTOCOL.COMMANDS.V_USER_NAME]: user.name,
      [PROTOCOL.COMMANDS.V_SERVER_TIMESTAMP]: Date.now(),
      [PROTOCOL.COMMANDS.V_FIRST_LOGIN]: !!p.first_login,
      [PROTOCOL.COMMANDS.V_IS_PREMIUM]: !!p.is_premium,
      [PROTOCOL.COMMANDS.V_PREMIUM_DAYS_LEFT]: p.premium_days_left || 0,
      [PROTOCOL.COMMANDS.V_EMAIL]: p.email || "",
      [PROTOCOL.COMMANDS.V_ACTIVATED]: p.is_activated !== false,
      [PROTOCOL.COMMANDS.V_VERSION]: "9.1",
      // Extra top-level fields consumed by Main.as
      [PROTOCOL.COMMANDS.V_GARDENER_POINTS]: p.gardener_points || 0,
      [PROTOCOL.COMMANDS.V_GARDENER_LEVEL]: p.gardener_level || 0,
      [PROTOCOL.COMMANDS.V_ACTIVATION_PRODUCT]: p.activation_product || 0,
      [PROTOCOL.COMMANDS.V_DEFAULT_ANIMAL_STORE_ID]:
        p.default_animal_store_id || 0,
      [PROTOCOL.COMMANDS.V_DEFAULT_ANIMAL_ID]: p.default_animal_id || 0,
      [PROTOCOL.COMMANDS.V_ANIMAL_ALLOWED]: p.animal_allowed !== false ? 1 : 0,
      [PROTOCOL.COMMANDS.V_HOUSE_ALLOWED]: p.house_allowed !== false ? 1 : 0,
      [PROTOCOL.COMMANDS.V_AFFILIATE]: p.affiliate || "",
      [PROTOCOL.COMMANDS.V_CREDITS_STORE_CREDITS]: p.credits_store_credits || 0,
      [PROTOCOL.COMMANDS.V_AGE]: p.age || 0,
      [PROTOCOL.COMMANDS.V_HAS_PAYED]: p.is_premium_account ? 1 : 0,
      [PROTOCOL.COMMANDS.V_QUESTS_TASKS]: p.quests_tasks || [],
      [PROTOCOL.COMMANDS.V_IS_EVENT_OPEN]: !!p.is_event_open,
      [PROTOCOL.COMMANDS.V_IS_CHALLENGE_EVENT_OPEN]:
        !!p.is_challenge_event_open,
      [PROTOCOL.COMMANDS.V_IS_GROUP_CHALLENGE_EVENT_OPEN]:
        !!p.is_group_challenge_event_open,
      [PROTOCOL.COMMANDS.V_DONATION_CAMPAIGN]: p.donation_campaign || {},
      [PROTOCOL.COMMANDS.V_VOTE_DATA]: p.vote_data || {},
      [PROTOCOL.COMMANDS.V_ANIMAL_DATA]: p.animal_data || {},
      [PROTOCOL.COMMANDS.V_ANIMAL_DAYS_LEFT]: p.animal_days_left || 0,
      [PROTOCOL.COMMANDS.V_AFFILIATE_REWARD]: p.affiliate_reward || 0,
      [PROTOCOL.COMMANDS.V_RENEWAL_REWARD_DAYS_LEFT]:
        p.renewal_reward_days_left || 0,
      [PROTOCOL.COMMANDS.V_RENEWAL_REWARD]: p.renewal_reward || 0,
      [PROTOCOL.COMMANDS.V_SENORITY_REWARD]: p.senority_reward || 0,
      [PROTOCOL.COMMANDS.V_INVENTORY_FULL_ANIMAL]: !!p.inventory_full_animal,
      [PROTOCOL.COMMANDS.V_INVENTORY_WAITING_ITEMS]:
        p.inventory_waiting_items || 0,
      [PROTOCOL.COMMANDS.V_SPECIAL_OFFER_DAYS_LEFT]:
        p.special_offer_days_left || 0,
      [PROTOCOL.COMMANDS.V_SPECIAL_OFFER]: p.special_offer || 0,
      [PROTOCOL.COMMANDS.V_PROMOTE_FACEBOOK]: !!p.promote_facebook,
      [PROTOCOL.COMMANDS.V_DAILY_REWARD]: p.daily_reward || null,
      [PROTOCOL.COMMANDS.V_DAILY_REWARD_CARD]: p.daily_reward_card || null,
      // nested structures
      [PROTOCOL.COMMANDS.V_PARAMS]: paramsObj,
      [PROTOCOL.COMMANDS.V_USER_VARS]: userVars,
    };

    DebugLogger.debug("LOGIN_EXT", "Sending login extension response", {
      connectionId: socket.connectionId,
      user: user.name,
      responseKeys: Object.keys(responseData),
    });

    this.sendExtensionResponse(socket, responseData, messageType);
  }

  async handleRoomDataExtension(socket, params, messageType) {
    const roomId =
      params[PROTOCOL.COMMANDS.V_ROOM_ID] || params.roomId || params["18"]; // Check numeric key 18 = V_ROOM_ID
    if (!roomId) {
      console.log("RoomData extension: No room ID provided, params:", params);
      return;
    }

    const room = this.rooms.get(parseInt(roomId));
    if (!room) {
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_ROOM_DATA_ERROR,
          [PROTOCOL.COMMANDS.V_ERROR]: "Room not found",
        },
        messageType,
      );
      return;
    }

    console.log(
      `Sending room data for room ${roomId} to ${socket.sfsUser ? socket.sfsUser.name : "unknown"}`,
    );

    // Build NPCs and static data in the exact structure the Flash client expects
    const roomNPCs = await this.getRoomNPCs(room.id); // Array of NPC objects with numeric keys
    const roomStaticData = await this.getRoomStaticData(room.id); // Object with numeric ROOM.* keys

    // Ensure roomStaticData has all required fields
    if (!roomStaticData[PROTOCOL.ROOM.SWF]) {
      roomStaticData[PROTOCOL.ROOM.SWF] = String(room.id);
    }
    if (!roomStaticData[PROTOCOL.ROOM.PORTALS]) {
      roomStaticData[PROTOCOL.ROOM.PORTALS] = [];
    }

    const responseData = {
      [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_ROOM_DATA,
      [PROTOCOL.COMMANDS.V_ROOM_ID]: room.id,
      // Critical payloads that WorldRoomData.as expects
      [PROTOCOL.COMMANDS.V_ROOM_NPCS]: roomNPCs,
      [PROTOCOL.COMMANDS.V_ROOM_DATA]: roomStaticData,
    };

    this.sendExtensionResponse(socket, responseData, messageType);
  }

  handleItemDataExtension(socket, params, messageType) {
    const itemId = params[PROTOCOL.COMMANDS.V_ITEM_ID] || params.itemId;
    if (!itemId) return;

    // Get item data from database or cache
    this.getItemData(parseInt(itemId)).then((itemData) => {
      if (itemData) {
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.S_ITEM_DATA]: "1",
            [PROTOCOL.COMMANDS.V_ITEM_ID]: itemData.id,
            [PROTOCOL.COMMANDS.V_ITEM]: JSON.stringify(itemData),
          },
          messageType,
        );
      } else {
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.S_ITEM_DATA_ERROR]: "Item not found",
          },
          messageType,
        );
      }
    });
  }

  async handlePlayerDataExtension(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const command = params[PROTOCOL.COMMANDS.V_COMMAND] || params.command;
    const playerId =
      params[PROTOCOL.COMMANDS.V_PLAYER_ID] ||
      params.playerId ||
      socket.sfsUser.id;

    console.log(`PlayerData extension: ${command} for player ${playerId}`);

    switch (command) {
      case PROTOCOL.COMMANDS.C_GET_INVENTORY:
        await this.handleInventoryData(socket, params, messageType);
        break;
      case PROTOCOL.COMMANDS.S_GET_POTION_INVENTORY:
        await this.handlePotionInventory(socket, params, messageType);
        break;
      default:
        // Handle regular player data request
        const user = this.users.get(parseInt(playerId));

        if (!user) {
          this.sendExtensionResponse(
            socket,
            {
              [PROTOCOL.COMMANDS.V_ERROR]: "Player not found",
            },
            messageType,
          );
          return;
        }

        // Send player public data
        const responseData = {
          [PROTOCOL.COMMANDS.S_PLAYER_PUBLIC_DATA]: "1",
          [PROTOCOL.COMMANDS.V_PLAYER_ID]: user.id,
          [PROTOCOL.COMMANDS.V_USER_NAME]: user.name,
          [PROTOCOL.COMMANDS.V_LEVEL]: user.getVariable(
            PROTOCOL.USERVARIABLES.LEVEL,
          ),
          [PROTOCOL.COMMANDS.V_LEADERSHIP]: user.getVariable(
            PROTOCOL.USERVARIABLES.LEADERSHIP,
          ),
          [PROTOCOL.COMMANDS.V_IS_PREMIUM]: user.getVariable(
            PROTOCOL.USERVARIABLES.IS_PREMIUM,
          ),
          [PROTOCOL.COMMANDS.V_RANGER_LEVEL]: user.getVariable(
            PROTOCOL.USERVARIABLES.RANGER_LEVEL,
          ),
          [PROTOCOL.COMMANDS.V_SENIORITY_LEVEL]: user.getVariable(
            PROTOCOL.USERVARIABLES.SENIORITY_LEVEL,
          ),
          [PROTOCOL.COMMANDS.V_ADVISOR_LEVEL]: user.getVariable(
            PROTOCOL.USERVARIABLES.ADVISOR_LEVEL,
          ),
          [PROTOCOL.COMMANDS.V_USER_VARS]: JSON.stringify(user.getVariables()),
        };

        this.sendExtensionResponse(socket, responseData, messageType);
    }
  }

  async handleInventoryData(socket, params, messageType) {
    if (!socket.sfsUser) return;

    console.log(`Loading inventory data for ${socket.sfsUser.name}`);

    try {
      // Get user's inventory
      const inventory = await this.getUserInventory(socket.sfsUser.dbId);
      const playerResult = await dbClient.query(
        "SELECT gold, level, leadership_points FROM players WHERE id = $1",
        [socket.sfsUser.dbId],
      );

      const playerData = playerResult.rows[0] || {};

      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_INVENTORY_DATA,
          [PROTOCOL.COMMANDS.V_ITEMS]: inventory,
          [PROTOCOL.COMMANDS.V_GOLD]: playerData.gold || 0,
          [PROTOCOL.COMMANDS.V_LEVEL]: playerData.level || 1,
          [PROTOCOL.COMMANDS.V_LEADERSHIP]: playerData.leadership_points || 0,
        },
        messageType,
      );
    } catch (error) {
      console.error("Error getting inventory data:", error);
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_INVENTORY_DATA,
          [PROTOCOL.COMMANDS.V_ERROR]: "Failed to load inventory",
        },
        messageType,
      );
    }
  }

  async handlePotionInventory(socket, params, messageType) {
    if (!socket.sfsUser) return;

    console.log(`Loading potion inventory for ${socket.sfsUser.name}`);

    try {
      // Return empty inventory structure if not available
      const potions = await this.getUserPotions(socket.sfsUser.dbId);
      const items = Array.isArray(potions) ? potions : []; // expected as array of items

      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]:
            PROTOCOL.COMMANDS.S_POTION_INVENTORY_DATA,
          [PROTOCOL.COMMANDS.V_ITEMS]: items,
        },
        messageType,
      );
    } catch (error) {
      console.error("Error getting potion inventory:", error);
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]:
            PROTOCOL.COMMANDS.S_POTION_INVENTORY_DATA,
          [PROTOCOL.COMMANDS.V_ITEMS]: [],
        },
        messageType,
      );
    }
  }

  async handleCardInventory(socket, params, messageType) {
    if (!socket.sfsUser) return;

    console.log(`Loading card inventory for ${socket.sfsUser.name}`);

    try {
      const cardData = await this.getUserCards(socket.sfsUser.dbId);

      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]:
            PROTOCOL.COMMANDS.S_CARD_INVENTORY_ITEMS,
          [PROTOCOL.COMMANDS.V_CARD_INVENTORY_ITEMS]: cardData.cards,
          [PROTOCOL.COMMANDS.V_PLAYER_ALBUMS]: cardData.albums,
        },
        messageType,
      );
    } catch (error) {
      console.error("Error getting card inventory:", error);
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]:
            PROTOCOL.COMMANDS.S_CARD_INVENTORY_ITEMS,
          [PROTOCOL.COMMANDS.V_ERROR]: "Failed to load cards",
        },
        messageType,
      );
    }
  }

  async handleGameExtension(socket, params, messageType) {
    const command = params[PROTOCOL.COMMANDS.V_COMMAND] || params.command;
    const gameId = params[PROTOCOL.COMMANDS.V_GAME_ID] || params.gameId;
    const roomId = params[PROTOCOL.COMMANDS.V_ROOM_ID] || params.roomId;

    console.log(`Game extension: ${command} for game ${gameId} room ${roomId}`);

    switch (command) {
      case PROTOCOL.COMMANDS.C_ROOM_ENTER:
        await this.handleRoomEnter(socket, roomId, messageType);
        break;
      case PROTOCOL.COMMANDS.C_GAME_ENTER:
        this.handleGameEnter(socket, gameId, messageType);
        break;
      case PROTOCOL.COMMANDS.C_GAME_EXIT:
        this.handleGameExit(socket, gameId, messageType);
        break;
      case PROTOCOL.COMMANDS.C_GAME_START:
        this.handleGameStart(socket, gameId, messageType);
        break;
      case PROTOCOL.COMMANDS.C_GAME_OVER:
        this.handleGameOver(socket, params, messageType);
        break;
      case PROTOCOL.COMMANDS.C_QUIZ_START:
        this.handleQuizStart(socket, gameId, messageType);
        break;
      case PROTOCOL.COMMANDS.C_QUIZ_OVER:
        this.handleQuizOver(socket, params, messageType);
        break;
      default:
        console.log("Unknown game command:", command);
    }
  }

  async handleRoomEnter(socket, roomId, messageType) {
    if (!socket.sfsUser) return;

    console.log(`${socket.sfsUser.name} requesting to enter room ${roomId}`);

    try {
      const room = this.rooms.get(parseInt(roomId));
      if (!room) {
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.S_ROOM_ENTER_ERROR]: "Room not found",
          },
          messageType,
        );
        return;
      }

      // Build room data in Flash format
      const roomNPCs = await this.getRoomNPCs(room.id);
      const roomStaticData = await this.getRoomStaticData(room.id);

      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.S_ROOM_DATA]: "1",
          [PROTOCOL.COMMANDS.V_ROOM_ID]: room.id,
          [PROTOCOL.COMMANDS.V_ROOM_NAME]: room.name,
          [PROTOCOL.COMMANDS.V_ROOM_SWF]: String(room.id), // client adds path and .swf
          [PROTOCOL.COMMANDS.V_ROOM_SOUND]: room.dbData?.sound || "",
          [PROTOCOL.COMMANDS.V_PORTALS]: Array.isArray(
            roomStaticData[PROTOCOL.ROOM.PORTALS],
          )
            ? roomStaticData[PROTOCOL.ROOM.PORTALS]
            : [],
          [PROTOCOL.COMMANDS.V_ROOM_NPCS]: roomNPCs,
          [PROTOCOL.COMMANDS.V_ROOM_DATA]: roomStaticData,
        },
        messageType,
      );

      console.log(
        `Room data sent for room ${roomId} to ${socket.sfsUser.name}`,
      );
    } catch (error) {
      console.error("Error handling room enter:", error);
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.S_ROOM_ENTER_ERROR]: "Failed to load room data",
        },
        messageType,
      );
    }
  }

  handleGameEnter(socket, gameId, messageType) {
    if (!socket.sfsUser) return;

    // Set user game state
    socket.sfsUser.setVariable(PROTOCOL.USERVARIABLES.GAME_ID, gameId);

    // Get game data
    this.getGameData(gameId).then((gameData) => {
      if (gameData) {
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.S_GAME_START]: "1",
            [PROTOCOL.COMMANDS.V_GAME_ID]: gameId,
            [PROTOCOL.COMMANDS.V_GAMES_DATA]: JSON.stringify(gameData),
            [PROTOCOL.COMMANDS.V_GAME_TOKEN]: this.generateGameToken(
              socket.sfsUser,
              gameId,
            ),
          },
          messageType,
        );
      }
    });
  }

  handleGameExit(socket, gameId, messageType) {
    if (!socket.sfsUser) return;

    // Clear user game state
    socket.sfsUser.setVariable(PROTOCOL.USERVARIABLES.GAME_ID, -1);

    this.sendExtensionResponse(
      socket,
      {
        gameExited: true,
      },
      messageType,
    );
  }

  handleGameStart(socket, gameId, messageType) {
    if (!socket.sfsUser) return;

    DebugLogger.info(
      "GAME",
      `Game ${gameId} started by ${socket.sfsUser.name}`,
    );

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_GAME_START]: "1",
        [PROTOCOL.COMMANDS.V_GAME_ID]: gameId,
      },
      messageType,
    );
  }

  handleGameOver(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const gameId = params[PROTOCOL.COMMANDS.V_GAME_ID];
    const score = params[PROTOCOL.COMMANDS.V_GAME_SCORE] || 0;
    const level = params[PROTOCOL.COMMANDS.V_GAME_LEVEL] || 1;

    DebugLogger.info(
      "GAME",
      `Game over for ${socket.sfsUser.name}: game ${gameId}, score ${score}, level ${level}`,
    );

    // Calculate rewards
    const rewards = this.calculateGameRewards(
      socket.sfsUser,
      gameId,
      score,
      level,
    );

    // Update user stats
    this.updateUserGameStats(socket.sfsUser, gameId, score, level, rewards);

    // Clear game state
    socket.sfsUser.setVariable(PROTOCOL.USERVARIABLES.GAME_ID, -1);

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_GAME_OVER_DATA]: "1",
        [PROTOCOL.COMMANDS.V_GAME_ID]: gameId,
        [PROTOCOL.COMMANDS.V_GAME_SCORE]: score,
        [PROTOCOL.COMMANDS.V_GAME_LEVEL]: level,
        [PROTOCOL.COMMANDS.V_REWARD_ACTIVITY_POINTS]: rewards.activityPoints,
        [PROTOCOL.COMMANDS.V_REWARD_GOLD]: rewards.gold,
        [PROTOCOL.COMMANDS.V_REWARD_ITEM]: rewards.item || 0,
      },
      messageType,
    );
  }

  handleStoreExtension(socket, params, messageType) {
    const command = params[PROTOCOL.COMMANDS.V_COMMAND] || params.command;
    const storeId = params[PROTOCOL.COMMANDS.V_STORE_ID] || params.storeId;

    switch (command) {
      case PROTOCOL.COMMANDS.C_GET_STORE_DATA:
        this.handleGetStoreData(socket, storeId, messageType);
        break;
      case PROTOCOL.COMMANDS.C_BUY_ITEM:
        this.handleBuyItem(socket, params, messageType);
        break;
      case PROTOCOL.COMMANDS.C_SELL_ITEM:
        this.handleSellItem(socket, params, messageType);
        break;
      default:
        DebugLogger.warn("STORE", "Unknown store command: " + command);
    }
  }

  handleGetStoreData(socket, storeId, messageType) {
    this.getStoreData(storeId).then((storeData) => {
      if (storeData) {
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.S_GET_STORE_DATA]: "1",
            [PROTOCOL.COMMANDS.V_STORE_ID]: storeId,
            [PROTOCOL.COMMANDS.V_STORE_DATA]: JSON.stringify(storeData),
          },
          messageType,
        );
      }
    });
  }

  handleBuyItem(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const itemId = params[PROTOCOL.COMMANDS.V_ITEM_ID];
    const count = params[PROTOCOL.COMMANDS.V_COUNT] || 1;

    // Implement buy item logic
    this.processBuyItem(socket.sfsUser, itemId, count).then((result) => {
      if (result.success) {
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.S_BUY_ITEM]: "1",
            [PROTOCOL.COMMANDS.V_ITEM_ID]: itemId,
            [PROTOCOL.COMMANDS.V_COUNT]: count,
            [PROTOCOL.COMMANDS.V_GOLD]: result.newGold,
          },
          messageType,
        );
      } else {
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.S_BUY_ITEM_DENY]: result.error,
          },
          messageType,
        );
      }
    });
  }

  handleSellItem(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const itemId = params[PROTOCOL.COMMANDS.V_ITEM_ID];
    const count = params[PROTOCOL.COMMANDS.V_COUNT] || 1;

    // Implement sell item logic
    this.processSellItem(socket.sfsUser, itemId, count).then((result) => {
      if (result.success) {
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.S_SELL_ITEM]: "1",
            [PROTOCOL.COMMANDS.V_ITEM_ID]: itemId,
            [PROTOCOL.COMMANDS.V_COUNT]: count,
            [PROTOCOL.COMMANDS.V_GOLD]: result.newGold,
          },
          messageType,
        );
      }
    });
  }

  // Trading extension handlers
  handleTradeExtension(socket, extensionName, params, messageType) {
    DebugLogger.info("TRADE", `Extension: ${extensionName}`);

    switch (extensionName) {
      case PROTOCOL.EXTENSIONS.TradeRequestExtension:
        this.handleTradeRequest(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.TradeAcceptExtension:
        this.handleTradeAccept(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.TradeRejectExtension:
        this.handleTradeReject(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.TradeCancelExtension:
        this.handleTradeCancel(socket, params, messageType);
        break;
      default:
        // Handle other trade operations
        this.sendExtensionResponse(
          socket,
          {
            tradeOperation: extensionName,
            status: "processed",
          },
          messageType,
        );
    }
  }

  handleTradeRequest(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const targetUserId =
      params[PROTOCOL.COMMANDS.V_TARGET_ID] || params.targetId;
    const targetUser = this.users.get(parseInt(targetUserId));

    if (!targetUser) {
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.S_INTERACTION_REQUEST_REQUEST_ERROR]:
            "User not found",
        },
        messageType,
      );
      return;
    }

    console.log(
      `Trade request from ${socket.sfsUser.name} to ${targetUser.name}`,
    );

    // Send trade request to target user
    this.sendTradeRequest(socket.sfsUser, targetUser);

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_TRADE_REQUEST_ACK]: "1",
      },
      messageType,
    );
  }

  handleTradeAccept(socket, params, messageType) {
    if (!socket.sfsUser) return;

    console.log(`Trade accepted by ${socket.sfsUser.name}`);

    // Create trade session
    const tradeId = this.createTradeSession(socket.sfsUser);

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_TRADE_JOIN]: "1",
        [PROTOCOL.COMMANDS.V_TRADE_TRANSACTION_ID]: tradeId,
      },
      messageType,
    );
  }

  // Animal extension handlers
  handleAnimalExtension(socket, extensionName, params, messageType) {
    DebugLogger.info("ANIMAL", `Extension: ${extensionName}`);

    switch (extensionName) {
      case PROTOCOL.EXTENSIONS.BuyAnimal:
        this.handleBuyAnimal(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.BuyAnimalFood:
        this.handleBuyAnimalFood(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.CleanAnimal:
        this.handleCleanAnimal(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.GetAnimalStore:
        this.handleGetAnimalStore(socket, params, messageType);
        break;
      default:
        this.sendExtensionResponse(
          socket,
          {
            animalOperation: extensionName,
            status: "processed",
          },
          messageType,
        );
    }
  }

  handleBuyAnimal(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const animalId = params[PROTOCOL.COMMANDS.V_ANIMAL_DATA] || params.animalId;

    // Process animal purchase
    this.processBuyAnimal(socket.sfsUser, animalId).then((result) => {
      if (result.success) {
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.S_BUY_ANIMAL]: "1",
            [PROTOCOL.COMMANDS.V_ANIMAL_DATA]: animalId,
            [PROTOCOL.COMMANDS.V_GOLD]: result.newGold,
          },
          messageType,
        );
      } else {
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.S_CANNOT_BUY_ANIMAL]: result.error,
          },
          messageType,
        );
      }
    });
  }

  handleBuyAnimalFood(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const foodId = params[PROTOCOL.COMMANDS.V_FOOD_ID] || params.foodId;

    console.log(`${socket.sfsUser.name} buying animal food ${foodId}`);

    // In a real implementation, you would process the food purchase here
    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_BUY_ANIMAL_FOOD]: "1",
        [PROTOCOL.COMMANDS.V_FOOD_ID]: foodId,
      },
      messageType,
    );
  }

  handleCleanAnimal(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const animalId = params[PROTOCOL.COMMANDS.V_ANIMAL_DATA] || params.animalId;

    console.log(`${socket.sfsUser.name} cleaning animal ${animalId}`);

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_CLEAN_ANIMAL]: "1",
        [PROTOCOL.COMMANDS.V_ANIMAL_DATA]: animalId,
      },
      messageType,
    );
  }

  async handleGetAnimalStore(socket, params, messageType) {
    if (!socket.sfsUser) return;

    console.log(`${socket.sfsUser.name} requesting animal store`);

    const animalStore = await this.getAnimalStore();

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_GET_STORE_DATA]: "1",
        [PROTOCOL.COMMANDS.V_STORE_DATA]: JSON.stringify(animalStore),
      },
      messageType,
    );
  }

  // House extension handlers
  handleHouseExtension(socket, extensionName, params, messageType) {
    DebugLogger.info("HOUSE", `Extension: ${extensionName}`);

    switch (extensionName) {
      case PROTOCOL.EXTENSIONS.BuyHouseExtension:
        this.handleBuyHouse(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.EnterHouseRoomExtension:
        this.handleEnterHouseRoom(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.GetHouseStaticDataExtension:
        // Use the canonical handler that returns V_COMMAND and non-stringified arrays
        this.handleGetHouseStaticData(socket, params, messageType);
        break;
      default:
        // Provide a benign ack to avoid blocking client flows
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.V_COMMAND]:
              PROTOCOL.COMMANDS.S_HOUSE_STATIC_DATA,
            status: "processed",
          },
          messageType,
        );
    }
  }

  // Credits store handlers
  handleCreditsStoreStaticData(socket, params, messageType) {
    // Minimal static data needed for credits store UI to initialize
    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.V_COMMAND]:
          PROTOCOL.COMMANDS.S_CREDITS_STORE_STATIC_DATA,
        [PROTOCOL.COMMANDS.V_CREDITS_STORE_PRODUCTS_DATA]: [],
        [PROTOCOL.COMMANDS.V_CREDITS_STORE_PRODUCTS]: [],
        [PROTOCOL.COMMANDS.V_CREDITS_STORE_DATA]: [],
      },
      messageType,
    );
  }

  async handleGetCreditsStore(socket, params, messageType) {
    const store = await this.getCreditsStore();
    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_CREDITS_STORE_DATA,
        [PROTOCOL.COMMANDS.V_CREDITS_STORE_PRODUCTS_LEFT]: [],
        [PROTOCOL.COMMANDS.V_CREDITS_STORE_DISCOUNTS]: [],
        [PROTOCOL.COMMANDS.V_CREDITS_STORE_PRODUCTS]: store.products || [],
      },
      messageType,
    );
  }

  // Card extension handlers
  async handleCardExtension(socket, extensionName, params, messageType) {
    console.log(`Card extension: ${extensionName}`);

    switch (extensionName) {
      case PROTOCOL.EXTENSIONS.CardsStaticDataExtension:
        await this.handleCardsStaticData(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.CardInventoryDataExtension:
        await this.handleCardInventory(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.CardPackWaitingDataExtension:
        this.sendExtensionResponse(
          socket,
          {
            [PROTOCOL.COMMANDS.V_COMMAND]:
              PROTOCOL.COMMANDS.S_CARD_PACK_WAITING_ITEMS,
            [PROTOCOL.COMMANDS.V_CARD_PACK_WAITING_ITEMS]: [],
          },
          messageType,
        );
        break;
      default:
        this.sendExtensionResponse(
          socket,
          {
            cardOperation: extensionName,
            status: "processed",
          },
          messageType,
        );
    }
  }

  async handleCardsStaticData(socket, params, messageType) {
    if (!socket.sfsUser) return;

    console.log(`Loading cards static data for ${socket.sfsUser.name}`);

    // Minimal, schema-agnostic response to satisfy client initialization and avoid DB schema mismatches
    try {
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_CARDS_STATIC_DATA,
          [PROTOCOL.COMMANDS.V_ALL_ALBUMS_DATA]: [],
          [PROTOCOL.COMMANDS.V_ALL_CARD_SETS]: [],
          [PROTOCOL.COMMANDS.V_ACTIVE_CARD_PACKS_SERIES_IDS]: [],
          [PROTOCOL.COMMANDS.V_ALL_CARDS]: [],
        },
        messageType,
      );

      // Push static data right after cards to ensure the client proceeds
      setTimeout(() => {
        try {
          this.handleStaticData(socket, {}, PROTOCOL.XTMSG_TYPE_JSON);
        } catch (e) {}
      }, 0);
    } catch (error) {
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_CARDS_STATIC_DATA,
          [PROTOCOL.COMMANDS.V_ALL_ALBUMS_DATA]: [],
          [PROTOCOL.COMMANDS.V_ALL_CARD_SETS]: [],
          [PROTOCOL.COMMANDS.V_ACTIVE_CARD_PACKS_SERIES_IDS]: [],
          [PROTOCOL.COMMANDS.V_ALL_CARDS]: [],
        },
        messageType,
      );

      setTimeout(() => {
        try {
          this.handleStaticData(socket, {}, PROTOCOL.XTMSG_TYPE_JSON);
        } catch (e) {}
      }, 0);
    }
  }

  handleGetHouseStaticData(socket, params, messageType) {
    // Provide minimal but complete structure for house static data (non-stringified, with V_COMMAND)
    const response = {
      [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_HOUSE_STATIC_DATA,
      [PROTOCOL.COMMANDS.V_HOUSE_TYPES]: [],
      [PROTOCOL.COMMANDS.V_HOUSE_ITEM_TYPES]: [],
      [PROTOCOL.COMMANDS.V_HOUSE_ITEMS]: [],
      [PROTOCOL.COMMANDS.V_HOUSE_GARDEN_PLANT_TYPES]: [],
      [PROTOCOL.COMMANDS.V_HOUSE_GARDEN_PLANTS]: [],
      [PROTOCOL.COMMANDS.V_HOUSE_ELECTRIC_LEVELS]: [],
      [PROTOCOL.COMMANDS.V_HOUSE_GARDEN_LEVELS]: [],
      [PROTOCOL.COMMANDS.V_MAX_ELECTRIC_UNITS]: 0,
      [PROTOCOL.COMMANDS.V_MAX_GARDEN_TILES]: 0,
      [PROTOCOL.COMMANDS.V_DAYS_TO_UPGRADE_GARDEN]: 0,
      [PROTOCOL.COMMANDS.V_DAYS_TO_UPGRADE_ELECTRIC]: 0,
      [PROTOCOL.COMMANDS.V_GARDENER_LEVELS]: [],
      [PROTOCOL.COMMANDS.V_GARDEN_PLANT_CROPS]: [],
      [PROTOCOL.COMMANDS.V_HOUSE_ITEM_EVENTS]: [],
    };
    this.sendExtensionResponse(socket, response, messageType);
  }

  // Multiplayer task extension handlers
  handleMultiplayerTaskExtension(socket, extensionName, params, messageType) {
    console.log(`Multiplayer task extension: ${extensionName}`);

    switch (extensionName) {
      case PROTOCOL.EXTENSIONS.InitMultiplayerTask:
        this.handleInitMultiplayerTask(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.JoinMultiplayerTask:
        this.handleJoinMultiplayerTask(socket, params, messageType);
        break;
      default:
        this.sendExtensionResponse(
          socket,
          {
            mpTaskOperation: extensionName,
            status: "processed",
          },
          messageType,
        );
    }
  }

  // Security extension handlers
  handleSecurityExtension(socket, extensionName, params, messageType) {
    console.log(`Security extension: ${extensionName}`);

    switch (extensionName) {
      case PROTOCOL.EXTENSIONS.ValidateSecurityCode:
        this.handleValidateSecurityCode(socket, params, messageType);
        break;
      case PROTOCOL.EXTENSIONS.GeneratePlayerSecurityCode:
        this.handleGenerateSecurityCode(socket, params, messageType);
        break;
      default:
        this.sendExtensionResponse(
          socket,
          {
            securityOperation: extensionName,
            status: "processed",
          },
          messageType,
        );
    }
  }

  // Emoticons extension (13)
  handleEmoticonsExtension(socket, params, messageType) {
    if (!socket.sfsUser) return;
    try {
      const emoticonId =
        (params &&
          (params[PROTOCOL.COMMANDS.V_EMOTICON_ID] || params["107"])) || 0;
      const room = socket.sfsUser.currentRoom;
      if (room) {
        // Broadcast as public message so UVarsUpdater.onPublicMessage handles it (prefix @@)
        this.broadcastPublicMessage(room, socket.sfsUser, `@@${emoticonId}`);
      }
      // No explicit extension payload required by client
    } catch (e) {
      DebugLogger.warn("EMOTICON", "Failed to handle emoticon", {
        error: e.message,
      });
    }
  }

  // Potions: UsePotion (96), BuyPotion (97), LockPotions (99)
  handleUsePotionExtension(socket, params, messageType) {
    if (!socket.sfsUser) return;
    try {
      const potionId =
        (params &&
          (params[PROTOCOL.COMMANDS.V_POTION_ID] || params["561"])) || 0;
      const consumerId =
        (params &&
          (params[PROTOCOL.COMMANDS.V_CONSUMER_ID] || params["563"])) ||
        socket.sfsUser.id;

      const room = socket.sfsUser.currentRoom;
      if (room) {
        // Broadcast $<consumerId>$<potionId> so UVarsUpdater.onPublicMessage(playerPotion) triggers
        this.broadcastPublicMessage(room, socket.sfsUser, `$${consumerId}$${potionId}`);
      }

      // Send minimal ack S_USE_POTION with V_POTION_ID
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_USE_POTION,
          [PROTOCOL.COMMANDS.V_POTION_ID]: potionId,
        },
        messageType,
      );
    } catch (e) {
      DebugLogger.warn("POTION", "Failed to handle use potion", { error: e.message });
    }
  }

  handleBuyPotionExtension(socket, params, messageType) {
    if (!socket.sfsUser) return;
    try {
      const potionId =
        (params &&
          (params[PROTOCOL.COMMANDS.V_POTION_ID] || params["561"])) || 0;
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_BUY_POTION,
          [PROTOCOL.COMMANDS.V_POTION_ID]: potionId,
        },
        messageType,
      );
    } catch (e) {
      DebugLogger.warn("POTION", "Failed to handle buy potion", { error: e.message });
    }
  }

  handleLockPotionsExtension(socket, params, messageType) {
    if (!socket.sfsUser) return;
    try {
      const allow =
        (params &&
          (params[PROTOCOL.COMMANDS.V_ALLOW_POTIONS] || params["566"])) ?? 1;
      // Store flag on user; no explicit payload needed by client
      socket.sfsUser.setVariable(PROTOCOL.USERVARIABLES.ALLOW_POTIONS, allow ? 1 : 0);
    } catch (e) {
      DebugLogger.warn("POTION", "Failed to handle lock potions", { error: e.message });
    }
  }

  // Handle user variables change extension (35)
  handleUserVarsChangeExtension(socket, params, messageType) {
    if (!socket.sfsUser || !params || typeof params !== "object") return;

    // Params contain numeric string keys (USERVARIABLES.*) mapped to values
    const changedVars = [];
    for (const key of Object.keys(params)) {
      // Skip helper fields sometimes injected
      if (key === PROTOCOL.COMMANDS.V_COMMAND || key === "command") continue;
      const newVal = params[key];
      const oldVal = socket.sfsUser.getVariable(key);
      if (oldVal !== newVal) {
        socket.sfsUser.setVariable(key, newVal);
        changedVars.push(key);
      }
    }

    // Broadcast updates to current room if user is inside one
    const room = socket.sfsUser.currentRoom;
    if (room && changedVars.length > 0) {
      this.broadcastUserVariableUpdate(room, socket.sfsUser, changedVars);
    }

    // No explicit extension response required by client; it's driven by uVarsUpdate and local update
  }

  // Handle simple appearance setters (image/skin/mood) used by the UI
  handleSetAppearanceExtension(socket, extensionName, params, messageType) {
    if (!socket.sfsUser) return;

    // Determine which uVar to update
    let targetVar = null;
    if (
      extensionName === PROTOCOL.EXTENSIONS.SetImageExtension ||
      String(extensionName) === "108"
    ) {
      targetVar = PROTOCOL.USERVARIABLES.IMAGE;
    } else if (
      extensionName === PROTOCOL.EXTENSIONS.SetSkinExtension ||
      String(extensionName) === "107"
    ) {
      targetVar = PROTOCOL.USERVARIABLES.SKIN;
    } else if (
      extensionName === PROTOCOL.EXTENSIONS.SetMoodExtension ||
      String(extensionName) === "109"
    ) {
      targetVar = PROTOCOL.USERVARIABLES.MOOD;
    }

    if (!targetVar) return;

    // Extract the selected item id/value
    const value =
      (params &&
        (params[PROTOCOL.COMMANDS.V_ITEM_ID] ??
          params.itemId ??
          params.value)) ??
      0;

    // Set and broadcast
    const prev = socket.sfsUser.getVariable(targetVar);
    if (prev !== value) {
      socket.sfsUser.setVariable(targetVar, value);
      const room = socket.sfsUser.currentRoom;
      if (room) {
        this.broadcastUserVariableUpdate(room, socket.sfsUser, [targetVar]);
      }
    }

    // No explicit response needed; client updates on uVarsUpdate
  }

  // Provide user variables for another user (extension 110)
  handleGetUserVarsExtension(socket, params, messageType) {
    if (!socket.sfsUser) return;
    const targetId =
      (params &&
        (parseInt(params[PROTOCOL.COMMANDS.V_SFS_UID]) ||
          parseInt(params.userId))) ||
      0;
    const target = this.users.get(targetId);
    if (!target) {
      // Send minimal error-like response to avoid client hanging
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_OTHER_USER_DATA,
          [PROTOCOL.COMMANDS.V_USER_VARS]: {},
        },
        messageType,
      );
      return;
    }

    // Ensure UID and NAME exist in the variables sent
    const outVars = { ...target.getVariables() };
    if (outVars[PROTOCOL.USERVARIABLES.UID] == null) {
      outVars[PROTOCOL.USERVARIABLES.UID] = target.id;
    }
    if (outVars[PROTOCOL.USERVARIABLES.NAME] == null) {
      outVars[PROTOCOL.USERVARIABLES.NAME] = target.name;
    }

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_OTHER_USER_DATA,
        [PROTOCOL.COMMANDS.V_USER_VARS]: outVars,
      },
      messageType,
    );
  }

  // Teleport-to-user helper (extension 111)
  handleTeleportToUserExtension(socket, params, messageType) {
    if (!socket.sfsUser) return;
    const targetId =
      (params &&
        (parseInt(params[PROTOCOL.COMMANDS.V_SFS_UID]) ||
          parseInt(params.userId))) ||
      0;
    const target = this.users.get(targetId);

    const roomId =
      target && target.currentRoom
        ? target.currentRoom.id
        : socket.sfsUser.currentRoom
          ? socket.sfsUser.currentRoom.id
          : 0;

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.V_COMMAND]:
          PROTOCOL.COMMANDS.S_TELEPORT_TO_USER_ROOM_ID,
        [PROTOCOL.COMMANDS.V_ROOM_NAME]: String(roomId),
      },
      messageType,
    );
  }

  // Other extension handlers
  handleThrowingGameExtension(socket, params, messageType) {
    console.log("Throwing game extension");

    this.sendExtensionResponse(
      socket,
      {
        throwingGame: "started",
      },
      messageType,
    );
  }

  async handleRecycleExtension(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const command = params[PROTOCOL.COMMANDS.V_COMMAND] || params.command;
    console.log(`Recycle extension: ${command}`);

    switch (command) {
      case PROTOCOL.COMMANDS.C_RECYCLE_ITEMS_DATA:
        await this.handleRecycleItemsData(socket, params, messageType);
        break;
      default:
        this.sendExtensionResponse(
          socket,
          {
            recycle: "processed",
            command: command,
          },
          messageType,
        );
    }
  }

  async handleRecycleItemsData(socket, params, messageType) {
    if (!socket.sfsUser) return;

    console.log(`Loading recycle items data for ${socket.sfsUser.name}`);

    try {
      // Get user's recycle inventory
      const recycleItems = await this.getRecycleItems(socket.sfsUser.dbId);
      const recycleStore = await this.getRecycleBins();

      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.S_RECYCLE_ITEMS_DATA]: "1",
          [PROTOCOL.COMMANDS.V_RECYCLE_INVENTORY]: JSON.stringify(recycleItems),
          [PROTOCOL.COMMANDS.V_RECYCLE_BINS]: JSON.stringify(recycleStore.bins),
        },
        messageType,
      );
    } catch (error) {
      console.error("Error getting recycle items data:", error);
      // Fallback: send minimal valid recycle data so client can proceed
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.S_RECYCLE_ITEMS_DATA]: "1",
          [PROTOCOL.COMMANDS.V_RECYCLE_INVENTORY]: JSON.stringify([]),
          [PROTOCOL.COMMANDS.V_RECYCLE_BINS]: JSON.stringify([]),
        },
        messageType,
      );
    }
  }

  handleNPCExtension(socket, params, messageType) {
    console.log("NPC extension");

    this.sendExtensionResponse(
      socket,
      {
        npc: "interaction",
      },
      messageType,
    );
  }

  handleChatExtension(socket, params, messageType) {
    console.log("Chat extension");

    this.sendExtensionResponse(
      socket,
      {
        chat: "processed",
      },
      messageType,
    );
  }

  handleMessagingExtension(socket, params, messageType) {
    console.log("Messaging extension");

    this.sendExtensionResponse(
      socket,
      {
        messaging: "processed",
      },
      messageType,
    );
  }

  handleTeleportExtension(socket, params, messageType) {
    console.log("Teleport extension");

    this.sendExtensionResponse(
      socket,
      {
        teleport: "processed",
      },
      messageType,
    );
  }

  async handleStaticDataExtension(socket, params, messageType) {
    if (!socket.sfsUser) return;

    // The client sends command == extension id ("36"). Always serve full static data.
    console.log(`StaticData extension request received`);
    await this.handleStaticData(socket, params, messageType);
  }

  async handleStaticData(socket, params, messageType) {
    if (!socket.sfsUser) return;

    console.log(`Loading static data for ${socket.sfsUser.name}`);

    try {
      // Build a comprehensive static data object with required keys
      const storeData = (await this.getStoreData(1)) || {
        id: 1,
        items: [],
        itemCount: 0,
      };
      const response = {};
      response[PROTOCOL.COMMANDS.V_RECYCLE_ITEMS_DATA] = [];
      response[PROTOCOL.COMMANDS.V_GAMES_1_1_DATA] = [];
      response[PROTOCOL.COMMANDS.V_GAMES_SINGLE_DATA] = [];
      response[PROTOCOL.COMMANDS.V_GAMES_IN_WORLD_DATA] = [];
      response[PROTOCOL.COMMANDS.V_QUIZ_DATA] = [];
      response[PROTOCOL.COMMANDS.V_NPCS_DATA] = [];
      response[PROTOCOL.COMMANDS.V_EMOTICONS_DATA] = [];
      response[PROTOCOL.COMMANDS.V_ANIMAL_GAMES] = [];
      response[PROTOCOL.COMMANDS.V_SENIORITY_LEVELS] = [];
      response[PROTOCOL.COMMANDS.V_PLAYER_ICONS] = [];
      response[PROTOCOL.COMMANDS.V_PLAYER_MOODS] = [];
      response[PROTOCOL.COMMANDS.V_PLAYER_COLORS] = [];
      response[PROTOCOL.COMMANDS.V_POTIONS_DATA] = [];
      response[PROTOCOL.COMMANDS.V_MULTIPLAYER_TASKS] = [];
      response[PROTOCOL.COMMANDS.V_STORE_DATA] = storeData;

      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_STATIC_DATA,
          ...response,
        },
        messageType,
      );
    } catch (error) {
      console.error("Error getting static data:", error);
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_STATIC_DATA,
          [PROTOCOL.COMMANDS.V_RECYCLE_ITEMS_DATA]: [],
          [PROTOCOL.COMMANDS.V_STORE_DATA]: { id: 1, items: [], itemCount: 0 },
        },
        messageType,
      );
    }
  }

  async handleGamesData(socket, params, messageType) {
    if (!socket.sfsUser) return;

    console.log(`Loading games data for ${socket.sfsUser.name}`);

    try {
      // Get all available games
      if (!dbClient) {
        throw new Error("Database not available");
      }

      const result = await dbClient.query(`
                SELECT
                    g.id,
                    g.name,
                    g.url,
                    g.npc_id,
                    g.xml,
                    g.icon_url,
                    g.type,
                    g.premium,
                    g.display_order,
                    g.one_on_one_visible,
                    gt.name as type_name,
                    n.name as npc_name
                FROM games g
                LEFT JOIN game_types gt ON g.type = gt.id
                LEFT JOIN npcs n ON g.npc_id = n.id
                ORDER BY g.display_order, g.id
            `);

      const games = result.rows.map((game) => ({
        id: game.id,
        name: game.name,
        url: game.url || "",
        npc_id: game.npc_id,
        npc_name: game.npc_name,
        xml: game.xml
          ? typeof game.xml === "string"
            ? game.xml
            : JSON.stringify(game.xml)
          : "",
        icon_url: game.icon_url || "",
        type: game.type || 1,
        type_name: game.type_name,
        premium: game.premium || false,
        display_order: game.display_order || 0,
        one_on_one_visible: game.one_on_one_visible || false,
      }));

      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.S_GAMES_DATA]: "1",
          [PROTOCOL.COMMANDS.V_GAMES_DATA]: JSON.stringify(games),
        },
        messageType,
      );
    } catch (error) {
      console.error("Error getting games data:", error);
      this.sendExtensionResponse(
        socket,
        {
          [PROTOCOL.COMMANDS.S_GAMES_DATA_ERROR]: "Failed to load games data",
        },
        messageType,
      );
    }
  }

  handlePingExtension(socket, params, messageType) {
    if (!socket.sfsUser) return;

    socket.sfsUser.lastPing = Date.now();

    this.sendExtensionResponse(
      socket,
      {
        pong: Date.now(),
      },
      messageType,
    );
  }

  // HTTP request handler
  handleHttpRequest(req, res) {
    const url = req.url;
    const method = req.method;

    DebugLogger.info("HTTP", `${method} request: ${url}`);

    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (url === "/default/poll" || url.startsWith("/default/poll")) {
      this.handleHttpPoll(req, res);
    } else if (url.startsWith("/default/uploads/")) {
      this.handleFileUpload(req, res);
    } else if (url === "/register" || url.startsWith("/register?")) {
      this.serveRegisterForm(req, res);
    } else if (url === "/api/register") {
      this.handleRegisterSubmit(req, res);
    } else if (url === "/api/users") {
      this.handleListUsers(req, res);
    } else if (url.startsWith("/login.html") || url.startsWith("/ekoloko/login.html")) {
      // Flash Projector clicked Register/Login → opens this in the default
      // browser. Redirect into our /register page so the user can create an
      // account without needing the SWF registration UI to work.
      const qs = url.split("?")[1] || "";
      res.writeHead(302, { Location: "/register?" + qs });
      res.end();
    } else if (url.startsWith("/ekoloko-web/")) {
      // The Ekoloko SWF calls these Java-Struts-style endpoints during
      // login/register/account flows. Without them the SWF falls into its
      // "תקלת מערכת" error path before it ever opens the SmartFox socket.
      this.handleEkolokoWebAction(req, res);
    } else if (method === "GET" && this.serveStatic(req, res)) {
      // static file served
    } else {
      try {
        DebugLogger.warn("HTTP", `404 Not Found`, { url, method });
      } catch (_) {}
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  }

  handleHttpPoll(req, res) {
    // HTTP polling for blue box connection
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Cache-Control": "no-cache",
    });

    // Send empty response for now
    // In a real implementation, you would queue messages for HTTP clients
    res.end("ok\n");
  }

  handleFileUpload(req, res) {
    // Handle file upload
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Upload complete");
  }

  // GET /register — minimal HTML form. Posts to /api/register and then tells
  // the user to launch the Flash Projector to log in.
  serveRegisterForm(req, res) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<title>Ekoloko · רישום</title><style>
body{font-family:Arial,sans-serif;margin:0;padding:0;background:#AAD93D;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#fff;border-radius:14px;padding:30px 36px;max-width:460px;width:100%;box-shadow:0 6px 24px rgba(0,0,0,.18);box-sizing:border-box}
h1{margin:0 0 6px;color:#3e6318;font-size:22px;text-align:center}
p.sub{margin:0 0 18px;text-align:center;color:#555;font-size:13px}
label{display:block;margin:10px 0 4px;font-size:13px;color:#333}
input,select{width:100%;padding:9px 10px;border:1px solid #c9d8a4;border-radius:6px;font-size:14px;box-sizing:border-box;background:#fafff0}
.row{display:flex;gap:10px}
.row > div{flex:1}
button{margin-top:16px;width:100%;background:#3e6318;color:#fff;border:0;padding:11px;border-radius:6px;font-size:15px;cursor:pointer}
button:hover{background:#4d7c1e}
.msg{margin-top:14px;padding:9px 12px;border-radius:6px;font-size:13px;display:none}
.msg.ok{background:#dcedc8;color:#1b5e20}
.msg.err{background:#ffcdd2;color:#b71c1c}
.next{margin-top:14px;font-size:12px;color:#555;line-height:1.55;background:#f5f9e8;padding:10px 12px;border-radius:6px;border-right:3px solid #3e6318}
code{background:#eef;padding:1px 5px;border-radius:3px;direction:ltr;display:inline-block}
</style></head><body><div class="card">
<h1>🌿 רישום לאקולוקו</h1>
<p class="sub">משתמש מקומי — ייווצר אצלך ב-<code>users.json</code></p>
<form id="f">
  <label>שם משתמש</label>
  <input name="username" required minlength="2" maxlength="20" autocomplete="off">
  <label>סיסמה</label>
  <input name="password" type="password" required minlength="4">
  <div class="row">
    <div>
      <label>מין</label>
      <select name="gender"><option value="0">בן</option><option value="1">בת</option></select>
    </div>
    <div>
      <label>גיל</label>
      <input name="age" type="number" min="6" max="99" value="10">
    </div>
  </div>
  <div class="row">
    <div>
      <label>גוון עור (1-5)</label>
      <input name="skintone" type="number" min="1" max="5" value="1">
    </div>
    <div>
      <label>שיער (1-10)</label>
      <input name="hair" type="number" min="1" max="10" value="1">
    </div>
  </div>
  <div class="row">
    <div>
      <label>עיניים (1-5)</label>
      <input name="eyes" type="number" min="1" max="5" value="1">
    </div>
    <div>
      <label>פה (1-5)</label>
      <input name="mouth" type="number" min="1" max="5" value="1">
    </div>
  </div>
  <button type="submit">צור משתמש</button>
  <div id="m" class="msg"></div>
  <div class="next">לאחר רישום מוצלח, הפעל את <code>start.bat</code> ובמסך הלוגין הזן את אותם שם משתמש וסיסמה.</div>
</form>
</div>
<script>
const f = document.getElementById('f');
const m = document.getElementById('m');
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  m.style.display = 'none';
  const data = Object.fromEntries(new FormData(f).entries());
  try {
    const r = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'שגיאה');
    m.className = 'msg ok';
    m.textContent = '✅ נוצר משתמש "' + j.user.username + '". כעת היכנס דרך Flash Projector.';
    m.style.display = 'block';
    f.reset();
  } catch (err) {
    m.className = 'msg err';
    m.textContent = '❌ ' + err.message;
    m.style.display = 'block';
  }
});
</script>
</body></html>`);
  }

  // POST /api/register — JSON body { username, password, gender, age,
  // skintone, hair, eyes, mouth, makeup? }. Creates a row in users.json.
  handleRegisterSubmit(req, res) {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "POST only" }));
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (body.length > 8192) req.destroy(); });
    req.on("end", () => {
      let data;
      try { data = JSON.parse(body || "{}"); }
      catch { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "invalid JSON" })); }
      const username = String(data.username || "").trim();
      const password = String(data.password || "");
      if (username.length < 2 || username.length > 20 || !/^[\w\u0590-\u05ff.\- ]+$/u.test(username)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "שם משתמש לא תקין" }));
      }
      if (password.length < 4) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "סיסמה קצרה מדי (מינימום 4 תווים)" }));
      }
      const overrides = {};
      const numericFields = ["gender", "age", "skintone", "hair", "eyes", "mouth", "makeup"];
      for (const f of numericFields) {
        if (data[f] != null && data[f] !== "") {
          const n = Number(data[f]);
          if (Number.isFinite(n)) overrides[f] = n;
        }
      }
      try {
        const row = usersStore.create(username, password, overrides);
        DebugLogger.info("REGISTER", "New user created via /api/register", { username: row.username, id: row.player_id });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ user: { username: row.username, id: row.player_id, gender: row.gender } }));
      } catch (e) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message === "username taken" ? "שם משתמש תפוס" : e.message }));
      }
    });
  }

  // GET /api/users — quick admin view.
  handleListUsers(req, res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    const out = usersStore.list().map((u) => ({
      username: u.username, id: u.player_id, gender: u.gender,
      created_at: u.created_at, last_login: u.last_login,
    }));
    res.end(JSON.stringify(out, null, 2));
  }

  // /ekoloko-web/<action> — minimal stand-ins for the Java/Struts endpoints
  // the SWF calls. Most return a tiny success XML envelope so the SWF will
  // proceed to open its SmartFox socket on port 9339, where the real auth
  // happens (handleLogin → JSON store).
  handleEkolokoWebAction(req, res) {
    // Read the URL once (lowercased path, raw query) and pre-parse the body
    // for POST forms — handlers below need either query or body params.
    const u = new URL(req.url, "http://localhost");
    const action = u.pathname.split("/").pop().replace(/\.action$/, "").toLowerCase();
    const query = Object.fromEntries(u.searchParams.entries());

    const collectBody = () => new Promise((resolve) => {
      let raw = "", limit = 16384;
      req.on("data", (c) => { raw += c; if (raw.length > limit) req.destroy(); });
      req.on("end", () => resolve(raw));
      req.on("error", () => resolve(""));
    });
    const finish = async (body) => {
      let form = {};
      if (req.method !== "GET") {
        const raw = await collectBody();
        try {
          if ((req.headers["content-type"] || "").includes("application/x-www-form-urlencoded")) {
            form = Object.fromEntries(new URLSearchParams(raw).entries());
          } else if ((req.headers["content-type"] || "").includes("application/json")) {
            form = JSON.parse(raw || "{}");
          }
        } catch (_) {}
      }
      body({ ...form, ...query });
    };

    const xml = (s) => {
      res.writeHead(200, { "Content-Type": "text/xml; charset=utf-8" });
      res.end('<?xml version="1.0" encoding="UTF-8"?>\n' + s);
    };
    const ok = (inner = "") => xml(`<response status="success">${inner}</response>`);
    const err = (code) => xml(`<response status="error" code="${code}"/>`);

    DebugLogger.info("WEB", `Action: ${action}`, { method: req.method, query });

    switch (action) {
      case "validateusername": {
        return finish((p) => {
          const name = String(p.userName || p.username || "").trim();
          const exists = name && usersStore.findByUsername(name);
          ok(`<validate available="${exists ? "false" : "true"}"/>`);
        });
      }
      case "login": {
        return finish((p) => {
          const name = String(p.userName || p.username || "").trim();
          const password = String(p.password || "");
          const row = usersStore.findByUsername(name);
          if (!row) return err("user_not_found");
          if (row.password !== password) return err("bad_password");
          ok(`<user id="${row.player_id}" username="${row.username}" token="ok"/>`);
        });
      }
      case "register": {
        return finish((p) => {
          const name = String(p.userName || p.username || "").trim();
          const password = String(p.password || "");
          if (name.length < 2 || password.length < 4) return err("invalid_input");
          const overrides = {};
          for (const f of ["gender", "age", "skintone", "hair", "eyes", "mouth", "makeup"]) {
            if (p[f] != null && p[f] !== "") {
              const n = Number(p[f]);
              if (Number.isFinite(n)) overrides[f] = n;
            }
          }
          if (p.email) overrides.email = String(p.email);
          try {
            const row = usersStore.create(name, password, overrides);
            DebugLogger.info("REGISTER", "New user via SWF /ekoloko-web/register", { username: row.username });
            ok(`<user id="${row.player_id}" username="${row.username}" token="ok"/>`);
          } catch (e) {
            err(e.message === "username taken" ? "username_taken" : "server_error");
          }
        });
      }
      case "captcha":
      case "captcha3":
      case "captcha5": {
        // Tiny 1x1 transparent gif — counts as "solved" since we don't gate on it.
        const gif = Buffer.from("R0lGODlhAQABAPAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
        res.writeHead(200, { "Content-Type": "image/gif" });
        return res.end(gif);
      }
      case "getregistrationitemsdata": {
        return ok("<avatars/><items/>");
      }
      default:
        // Catch-all for the dozens of stub endpoints (changeDetails, getData,
        // forgotPassword, contactUs911, isAPayingUser, ...). Returning a bare
        // success keeps the SWF moving.
        return ok();
    }
  }

  handleSocketDisconnection(socket) {
    if (socket.sfsUser) {
      DebugLogger.info("USER", `User ${socket.sfsUser.name} disconnected`);

      // Remove from current room
      if (socket.sfsUser.currentRoom) {
        this.leaveUserFromRoom(socket.sfsUser, socket.sfsUser.currentRoom);
      }

      // Update online status
      this.setUserOffline(socket.sfsUser);

      // Remove user from server
      this.users.delete(socket.sfsUser.id);
    } else {
      DebugLogger.info("USER", "Socket disconnected before login");
    }
  }

  // Message sending methods
  sendCrossDomainPolicy(socket) {
    const policy = `<?xml version="1.0"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
<allow-access-from domain="*" to-ports="9339" />
</cross-domain-policy>`;

    // Concise: do not dump policy XML

    if (socket && !socket.destroyed) {
      try {
        DebugLogger.info("SECURITY", "Sending Flash crossdomain policy");
        const buffer = Buffer.from(policy + "\0", "utf8");
        socket.write(buffer);

        // Concise: no extra success line for policy
      } catch (error) {
        DebugLogger.xml("crossdomain_error", "CROSSDOMAIN_POLICY_SEND_FAILED", {
          connectionId: socket.connectionId,
          error: error.message,
          stack: error.stack,
        });

        DebugLogger.error("SECURITY", "Error sending crossdomain policy", {
          connectionId: socket.connectionId,
          error: error.message,
        });
      }
    } else {
      DebugLogger.xml(
        "crossdomain_error",
        "CROSSDOMAIN_POLICY_TO_DESTROYED_SOCKET",
        {
          connectionId: socket ? socket.connectionId : "UNKNOWN",
          socketDestroyed: !socket || socket.destroyed,
        },
      );
    }
  }

  sendApiOK(socket) {
    const message = `<msg t='sys'><body action='apiOK' r='0'></body></msg>`;

    // Concise outgoing logged in sendToSocket

    this.sendToSocket(socket, message);
  }

  sendApiKO(socket, error) {
    const message = `<msg t='sys'><body action='apiKO' r='0'>${error}</body></msg>`;

    // Concise outgoing logged in sendToSocket

    this.sendToSocket(socket, message);
  }

  sendLoginOK(socket, user) {
    DebugLogger.info("LOGIN", "Sending login OK response", {
      connectionId: socket.connectionId,
      userId: user.id,
      userName: user.name,
      isModerator: user.isModerator,
    });

    // Send login OK in the exact format expected by ActionScript client
    // This matches the format expected by handleLoginOk in SysHandler.as:
    // var _loc2_:int = int(param1.body.login.@id);
    // var _loc3_:int = int(param1.body.login.@mod);
    // var _loc4_:String = param1.body.login.@n;
    const message = `<msg t='sys'><body action='logOK' r='0'><login id='${user.id}' mod='${user.isModerator ? 1 : 0}' n='${user.name}' /></body></msg>`;

    // Concise outgoing logged in sendToSocket

    this.sendToSocket(socket, message);

    DebugLogger.debug(
      "LOGIN",
      "Login OK sent - client will now request room list",
      {
        connectionId: socket.connectionId,
        user: user.name,
      },
    );

    // After login OK, the ActionScript client automatically calls this.sfs.getRoomList()
    // in handleLoginOk() method, so we don't need to send room list here
  }

  // Send LoginExtension OK (JSON) so Shell.swf can continue beyond loading screen
  sendLoginExtensionOK(socket, user) {
    try {
      if (!socket || !user) return;

      const p = user.playerData || {};

      // Build V_PARAMS according to com.vtweens.consts.PLAYER numeric keys
      const vParams = {};
      // Essentials
      vParams["0"] = user.dbId || 0; // PLAYER.ID
      vParams["1"] = user.name || ""; // PLAYER.NAME
      vParams["2"] =
        user.getVariable(PROTOCOL.USERVARIABLES.LEVEL) || p.level || 1; // PLAYER.LEVEL
      vParams["3"] = p.level_target || 0; // PLAYER.LEVEL_TARGET
      vParams["4"] = p.gold || 0; // PLAYER.GOLD
      vParams["5"] =
        p.skintone ||
        user.getVariable(PROTOCOL.USERVARIABLES.AVATAR_SKINTONE) ||
        1; // SKINTONE
      vParams["6"] =
        p.eyes || user.getVariable(PROTOCOL.USERVARIABLES.AVATAR_EYES) || 1; // EYES
      vParams["7"] =
        p.mouth || user.getVariable(PROTOCOL.USERVARIABLES.AVATAR_MOUTH) || 1; // MOUTH
      vParams["8"] =
        p.hair || user.getVariable(PROTOCOL.USERVARIABLES.AVATAR_HAIR) || 1; // HAIR
      vParams["9"] =
        p.makeup || user.getVariable(PROTOCOL.USERVARIABLES.AVATAR_MAKEUP) || 0; // MAKEUP
      vParams["10"] = p.activity_points || 0; // ACTIVITY_POINTS
      vParams["11"] = p.is_mod ? 1 : 0; // MOD
      vParams["12"] = p.leadership_points || 0; // LEADER
      vParams["13"] =
        p.gender || user.getVariable(PROTOCOL.USERVARIABLES.AVATAR_GENDER) || 1; // GENDER
      vParams["16"] = p.may_change_lead || 0; // MAY_CHANGE_LEAD
      vParams["17"] = p.one_on_one_games || []; // ONE_ON_ONE_GAMES
      vParams["19"] = p.ranger_level || 0; // RANGER_LEVEL
      vParams["22"] = p.last_login || new Date().toISOString(); // LAST_LOGIN
      vParams["25"] = p.no_chat_until || 0; // NO_CHAT_UNTIL
      vParams["26"] = p.minutes_played || 0; // MINUTES_PLAYED
      vParams["27"] = p.animal_level || 0; // ANIMAL_LEVEL
      vParams["30"] = p.new_premium ? 1 : 0; // NEW_PREMIUM
      vParams["31"] = p.lost_premium ? 1 : 0; // LOST_PREMIUM
      vParams["32"] = p.pioneer_points || p.pioneer_points || 0; // PIONEER_POINTS
      vParams["33"] = p.days_for_next_seniority_level || 0; // DAYS_FOR_NEXT_SENIORITY_LEVEL
      vParams["34"] = p.seniority_days_played || 0; // SENIORITY_DAYS_PLAYED
      vParams["35"] = p.seniority_level || 1; // SENIORITY_LEVEL
      vParams["38"] = p.house_locked ? 1 : 0; // HOUSE_LOCKED
      vParams["39"] = p.has_house ? 1 : 0; // HAS_HOUSE
      vParams["40"] = p.days_played || 0; // DAYS_PLAYED
      vParams["41"] = p.tutorial_step || 0; // TUTORIAL_STEP
      vParams["55"] = p.mod ? 1 : p.is_mod ? 1 : 0; // ADVISOR_LEVEL or MOD flags where applicable

      // Build user variables object (numeric keys as strings)
      const userVars = { ...user.getVariables() };

      // CRITICAL: Set INITIAL_ROOM user variable that ActionScript client expects
      // The client uses this to determine which room to load initially
      // See Main.as line 6653: this.initialRoomId = this.loginObject[COMMANDS.V_USER_VARS][USERVARIABLES.INITIAL_ROOM];
      // And line 4951: this.loadRoom(this.initialRoomId);
      if (!userVars[PROTOCOL.USERVARIABLES.INITIAL_ROOM]) {
        userVars[PROTOCOL.USERVARIABLES.INITIAL_ROOM] = 101; // Default starting room
      }

      // Also ensure the user object has INITIAL_ROOM set for later reference
      user.setVariable(
        PROTOCOL.USERVARIABLES.INITIAL_ROOM,
        userVars[PROTOCOL.USERVARIABLES.INITIAL_ROOM],
      );

      // Compose top-level response according to COMMANDS numeric keys
      const data = {
        [PROTOCOL.COMMANDS.V_COMMAND]: PROTOCOL.COMMANDS.S_LOGIN_OK,
        [PROTOCOL.COMMANDS.V_SFS_UID]: user.id,
        [PROTOCOL.COMMANDS.V_USER_NAME]: user.name,
        [PROTOCOL.COMMANDS.V_SERVER_TIMESTAMP]: Date.now(),
        [PROTOCOL.COMMANDS.V_FIRST_LOGIN]: p.first_login || false,
        [PROTOCOL.COMMANDS.V_IS_PREMIUM]: p.is_premium || false,
        [PROTOCOL.COMMANDS.V_PREMIUM_DAYS_LEFT]: p.premium_days_left || 0,
        [PROTOCOL.COMMANDS.V_EMAIL]: p.email || "",
        [PROTOCOL.COMMANDS.V_ACTIVATED]: p.is_activated !== false,
        [PROTOCOL.COMMANDS.V_VERSION]: "9.1", // Must match Shell VERSION.SERVER_VERSION
        [PROTOCOL.COMMANDS.V_IS_IN_DOWNTIME]: 0, // 0 = not in downtime
        [PROTOCOL.COMMANDS.V_HAS_PAYED]:
          p.is_premium_account || p.is_premium ? 1 : 0,
        [PROTOCOL.COMMANDS.V_AFFILIATE]: 0,
        [PROTOCOL.COMMANDS.V_AGE]: p.age || 0,
        [PROTOCOL.COMMANDS.V_CREDITS_STORE_CREDITS]:
          p.credits_store_credits || 0,
        [PROTOCOL.COMMANDS.V_USER_VARS]: userVars,
        [PROTOCOL.COMMANDS.V_PARAMS]: vParams,
      };

      // Ensure room 101 exists before the client tries to join it
      this.ensureDefaultRoomsExist();

      DebugLogger.debug("LOGIN_EXT", "Auto-sending S_LOGIN_OK extension data", {
        connectionId: socket.connectionId,
        user: user.name,
        version: "9.1",
        hasPaid: data[PROTOCOL.COMMANDS.V_HAS_PAYED],
      });

      this.sendExtensionResponse(socket, data, PROTOCOL.XTMSG_TYPE_JSON);
    } catch (e) {
      DebugLogger.error("LOGIN_EXT", "Failed to send login extension OK", {
        error: e.message,
        stack: e.stack,
      });
    }
  }

  sendLoginError(socket, error) {
    const message = `<msg t='sys'><body action='logKO' r='0'><login e='${error}' /></body></msg>`;
    this.sendToSocket(socket, message);
  }

  sendLogoutResponse(socket) {
    const message = `<msg t='sys'><body action='logout' r='0'></body></msg>`;
    this.sendToSocket(socket, message);
  }

  sendRoomList(socket) {
    if (!socket.sfsUser) {
      DebugLogger.warn(
        "ROOM",
        "Room list requested by non-authenticated user",
        {
          connectionId: socket.connectionId,
        },
      );
      return;
    }

    DebugLogger.debug("ROOM", "Sending room list", {
      connectionId: socket.connectionId,
      user: socket.sfsUser.name,
      totalRooms: this.rooms.size,
    });

    let roomListXml = "<rmList>";

    for (let [roomId, room] of this.rooms) {
      // Format room exactly as ActionScript client expects
      // The Room constructor in Room.as expects: id, name, maxu, maxs, temp, game, priv, lmb, ucnt, scnt
      roomListXml += `<rm id='${room.id}' maxu='${room.maxUsers}' maxs='${room.maxSpectators}' temp='${room.isTemp ? "1" : "0"}' game='${room.isGame ? "1" : "0"}' priv='${room.isPrivate ? "1" : "0"}' lmb='${room.isLimbo ? "1" : "0"}' ucnt='${room.userCount}' scnt='${room.spectatorCount}'>`;
      // CRITICAL: Client resolves SFS room id by looking up room by NAME equal to the world room numeric id (see WorldRoom.sfsId)
      // Therefore we must send the room name as the numeric id string, not a descriptive label.
      roomListXml += `<n><![CDATA[${room.id}]]></n>`;

      // Add room variables - this is critical for VTweens game logic
      roomListXml += "<vars>";
      for (let varName in room.variables) {
        const varValue = room.variables[varName];
        const varType =
          typeof varValue === "boolean"
            ? "b"
            : typeof varValue === "number"
              ? "n"
              : "s";
        const varValueStr =
          varType === "b" ? (varValue ? "1" : "0") : String(varValue);
        roomListXml += `<var n='${varName}' t='${varType}'><![CDATA[${varValueStr}]]></var>`;
      }
      roomListXml += "</vars>";

      roomListXml += "</rm>";
    }

    roomListXml += "</rmList>";

    const message = `<msg t='sys'><body action='rmList' r='0'>${roomListXml}</body></msg>`;

    // Concise: do not dump room list XML

    DebugLogger.debug("ROOM", "Room list sent", {
      connectionId: socket.connectionId,
      user: socket.sfsUser.name,
      xmlLength: roomListXml.length,
    });

    this.sendToSocket(socket, message);

    // DO NOT auto-join the user to a room here!
    // The ActionScript client will handle room joining based on the INITIAL_ROOM user variable
    // after it loads static data and calls this.loadRoom(this.initialRoomId) in staticDataLoaded()
  }

  sendJoinRoomOK(socket, room) {
    const user = socket.sfsUser;

    // Ensure all critical avatar variables exist before composing joinOK
    // This only fills missing values and won't override PX/PY or existing ordinals
    try {
      this.ensureAvatarVariables(user);
    } catch (_) {}

    console.log("🟡 AVATAR DEBUG - joinOK Message for", user.name);
    console.log("  Joining User SKIN:", user.getVariable(USERVARIABLES.SKIN));
    console.log("  Joining User MOOD:", user.getVariable(USERVARIABLES.MOOD));
    console.log("  Joining User IMAGE:", user.getVariable(USERVARIABLES.IMAGE));
    console.log("  Joining User PX:", user.getVariable(USERVARIABLES.PX));
    console.log("  Joining User PY:", user.getVariable(USERVARIABLES.PY));
    console.log("  Users in room:", room.getUserList().size);
    
    // Build user list XML - CRITICAL FORMAT MATCHING for SysHandler.as handleJoinOk
    let userListXml = "<uLs>";
    const allUsers = room.getUserList();
    
    // Debug: Log all users that will be sent in joinOK
    console.log("  Users in joinOK message:");
    for (let [userId, roomUser] of allUsers) {
      console.log(`    User ${roomUser.name} (ID: ${roomUser.id}) - SKIN: ${roomUser.getVariable(USERVARIABLES.SKIN)}, MOOD: ${roomUser.getVariable(USERVARIABLES.MOOD)}`);
    }
    for (let [userId, roomUser] of allUsers) {
      // Fill any missing avatar variables without overriding existing values
      try {
        this.ensureAvatarVariables(roomUser);
      } catch (_) {}
      
      // Exactly match the format expected by handleJoinOk in SysHandler.as:
      // _loc10_ = _loc7_.n; (user name)
      // _loc11_ = int(_loc7_.@i); (user id)
      // _loc12_ = _loc7_.@m == "1" ? true : false; (moderator)
      // _loc13_ = _loc7_.@s == "1" ? true : false; (spectator)
      // _loc14_ = _loc7_.@p == null ? -1 : int(_loc7_.@p); (player id)
      userListXml += `<u i='${roomUser.id}' m='${roomUser.isModerator ? "1" : "0"}' s='${roomUser.isSpectator ? "1" : "0"}' p='${roomUser.playerId}'>`;
      userListXml += `<n><![CDATA[${roomUser.name}]]></n>`;

      // Add user variables - CRITICAL for avatar rendering in Flash
      userListXml += "<vars>";
      const userVars = roomUser.getVariables();

      // Sort variables by key to ensure consistent ordering
      const sortedVarNames = Object.keys(userVars).sort(
        (a, b) => parseInt(a) - parseInt(b),
      );

      for (let varName of sortedVarNames) {
        const varValue = userVars[varName];
        if (varValue !== null && varValue !== undefined) {
          const varType =
            typeof varValue === "boolean"
              ? "b"
              : typeof varValue === "number"
                ? "n"
                : "s";
          const varValueStr =
            varType === "b" ? (varValue ? "1" : "0") : String(varValue);
          userListXml += `<var n='${varName}' t='${varType}'><![CDATA[${varValueStr}]]></var>`;
        }
      }
      userListXml += "</vars>";

      userListXml += "</u>";
    }
    userListXml += "</uLs>";

    // Build room variables XML - critical for room-specific game data
    let roomVarsXml = "<vars>";
    for (let varName in room.variables) {
      const varValue = room.variables[varName];
      if (varValue !== null && varValue !== undefined) {
        const varType =
          typeof varValue === "boolean"
            ? "b"
            : typeof varValue === "number"
              ? "n"
              : "s";
        const varValueStr =
          varType === "b" ? (varValue ? "1" : "0") : String(varValue);
        roomVarsXml += `<var n='${varName}' t='${varType}'><![CDATA[${varValueStr}]]></var>`;
      }
    }
    roomVarsXml += "</vars>";

    // Send joinOK with exact format expected by SysHandler.as handleJoinOk:
    // var _loc2_:int = int(param1.body.@r); (room id)
    // var _loc4_:XMLList = param1.body.uLs.u; (user list)
    // var _loc5_:int = int(param1.body.pid.@id); (player id)
    // if(_loc3_.vars.toString().length > 0) (room variables)
    const message = `<msg t='sys'><body action='joinOK' r='${room.id}'>${userListXml}<pid id='${user.playerId}' />${roomVarsXml}</body></msg>`;

    console.log("🟡 AVATAR DEBUG - Full joinOK XML message:");
    console.log(message);

    DebugLogger.debug("ROOM", "Join room OK message prepared", {
      connectionId: socket.connectionId,
      user: user.name,
      messageLength: message.length,
      appearance: {
        skin: user.getVariable(USERVARIABLES.SKIN),
        mood: user.getVariable(USERVARIABLES.MOOD),
        image: user.getVariable(USERVARIABLES.IMAGE),
        shirt: user.getVariable(USERVARIABLES.AVATAR_SHIRT),
        pants: user.getVariable(USERVARIABLES.AVATAR_PANTS),
        shoes: user.getVariable(USERVARIABLES.AVATAR_SHOES),
        hat: user.getVariable(USERVARIABLES.AVATAR_HAT),
        glasses: user.getVariable(USERVARIABLES.AVATAR_GLASSES),
      }
    });

    this.sendToSocket(socket, message);

    // After joinOK, also send a snapshot of the user's variables to the joining user
    // Some client flows rely on uVarsUpdate to finalize avatar setup for self
    try {
      const changedVars = Object.keys(user.getVariables());
      if (changedVars.length > 0) {
        // Extra visibility into the first-time snapshot sent to self
        DebugLogger.debug("AVATAR", `Sending initial uVars snapshot to ${user.name}`, {
          roomId: room.id,
          changedCount: changedVars.length,
          changedVars,
        });
        this.sendUserVarsSnapshotToUser(socket, room, user, changedVars);
      }
    } catch (e) {
      DebugLogger.warn("ROOM", "Failed sending self userVars snapshot", {
        error: e.message,
      });
    }

    // CRITICAL FIX: Delay sending uER to self to allow Flash client to process joinOK first
    // The Flash client needs time to set up the room before receiving the uER
    // Without this delay, the uER arrives too early and gets ignored
    // Increased to 2000ms (2 seconds) to ensure client-side addMyPlayer() and room setup complete
    setTimeout(() => {
      try {
        // Build user variables XML identical to the full uER message
        let userVarsXml = "<vars>";
        const userVars = user.getVariables();
        const sortedVarNames = Object.keys(userVars).sort((a, b) => parseInt(a) - parseInt(b));

        for (let varName of sortedVarNames) {
          const varValue = userVars[varName];
          if (varValue !== null && varValue !== undefined) {
            const varType = typeof varValue === "boolean" ? "b" : typeof varValue === "number" ? "n" : "s";
            const varValueStr = varType === "b" ? (varValue ? "1" : "0") : String(varValue);
            userVarsXml += `<var n='${varName}' t='${varType}'><![CDATA[${varValueStr}]]></var>`;
          }
        }
        userVarsXml += "</vars>";

        const userXml = `<u i='${user.id}' m='${user.isModerator ? 1 : 0}' s='${user.isSpectator ? 1 : 0}' p='${user.playerId}'>`;
        const userXmlEnd = `<n><![CDATA[${user.name}]]></n>${userVarsXml}</u>`;
        const selfUERMessage = `<msg t='sys'><body action='uER' r='${room.id}'>${userXml}${userXmlEnd}</body></msg>`;

        if (socket && !socket.destroyed) {
          this.sendToSocket(socket, selfUERMessage);
          console.log("🟢 AVATAR FIX - Sent delayed uER (2000ms) to self after joinOK for", user.name);
        }
      } catch (e) {
        console.error("❌ Failed to send uER to self after joinOK:", e.message);
      }
    }, 2000);

  }

  sendUserVarsSnapshotToUser(socket, room, user, varNames) {
    // Build variables XML identical to uVarsUpdate but send only to this user
    let changedVarsXml = "<vars>";
    for (let varName of varNames) {
      const varValue = user.getVariable(varName);
      if (varValue !== null && varValue !== undefined) {
        const varType =
          typeof varValue === "boolean"
            ? "b"
            : typeof varValue === "number"
              ? "n"
              : "s";
        const varValueStr =
          varType === "b" ? (varValue ? "1" : "0") : String(varValue);
        changedVarsXml += `<var n='${varName}' t='${varType}'><![CDATA[${varValueStr}]]></var>`;
      }
    }
    changedVarsXml += "</vars>";

    const message = `<msg t='sys'><body action='uVarsUpdate' r='${room.id}'><user id='${user.id}' />${changedVarsXml}</body></msg>`;
    this.sendToSocket(socket, message);
  }

  sendJoinRoomError(socket, error) {
    const message = `<msg t='sys'><body action='joinKO' r='0'><error msg='${error}' /></body></msg>`;
    this.sendToSocket(socket, message);
  }

  sendUserEnterRoom(room, user) {
    // NOTE: DON'T call ensureAvatarVariables here - variables should already be set
    // Calling it here would overwrite PX/PY with defaults before Flash updates them
    // this.ensureAvatarVariables(user);

    // Extra debug around clothing/appearance variables to trace rendering issues
    try {
      const appearance = {
        skin: user.getVariable(USERVARIABLES.SKIN),
        mood: user.getVariable(USERVARIABLES.MOOD),
        image: user.getVariable(USERVARIABLES.IMAGE),
        shirt: user.getVariable(USERVARIABLES.AVATAR_SHIRT),
        pants: user.getVariable(USERVARIABLES.AVATAR_PANTS),
        shoes: user.getVariable(USERVARIABLES.AVATAR_SHOES),
        coat: user.getVariable(USERVARIABLES.AVATAR_COAT),
        hat: user.getVariable(USERVARIABLES.AVATAR_HAT),
        glasses: user.getVariable(USERVARIABLES.AVATAR_GLASSES),
        earrings: user.getVariable(USERVARIABLES.AVATAR_EARINGS),
        necklace: user.getVariable(USERVARIABLES.AVATAR_NECKLACE),
        ring: user.getVariable(USERVARIABLES.AVATAR_RING),
        skates: user.getVariable(USERVARIABLES.AVATAR_SKATES),
        hovering: user.getVariable(USERVARIABLES.AVATAR_HOVERINGITEM),
        skintone: user.getVariable(USERVARIABLES.AVATAR_SKINTONE),
        eyes: user.getVariable(USERVARIABLES.AVATAR_EYES),
        mouth: user.getVariable(USERVARIABLES.AVATAR_MOUTH),
        hair: user.getVariable(USERVARIABLES.AVATAR_HAIR),
      };
      DebugLogger.debug("AVATAR", `Broadcasting uER with appearance for ${user.name}`, { roomId: room.id, appearance });
    } catch (_) {}
    
    // Build user variables XML - CRITICAL for avatar display
    let userVarsXml = "<vars>";
    const userVars = user.getVariables();

    // Sort variables by key for consistent ordering
    const sortedVarNames = Object.keys(userVars).sort(
      (a, b) => parseInt(a) - parseInt(b),
    );

    for (let varName of sortedVarNames) {
      const varValue = userVars[varName];
      if (varValue !== null && varValue !== undefined) {
        const varType =
          typeof varValue === "boolean"
            ? "b"
            : typeof varValue === "number"
              ? "n"
              : "s";
        const varValueStr =
          varType === "b" ? (varValue ? "1" : "0") : String(varValue);
        userVarsXml += `<var n='${varName}' t='${varType}'><![CDATA[${varValueStr}]]></var>`;
      }
    }
    userVarsXml += "</vars>";

    const userXml = `<u i='${user.id}' m='${user.isModerator ? 1 : 0}' s='${user.isSpectator ? 1 : 0}' p='${user.playerId}'>`;
    const userXmlEnd = `<n><![CDATA[${user.name}]]></n>${userVarsXml}</u>`;

    const message = `<msg t='sys'><body action='uER' r='${room.id}'>${userXml}${userXmlEnd}</body></msg>`;

    // Debug: Log the uER message for avatar troubleshooting
    console.log("🔴 AVATAR DEBUG - uER Message for", user.name);
    console.log("  User ID:", user.id);
    console.log("  Room ID:", room.id);
    console.log("  SKIN:", user.getVariable(USERVARIABLES.SKIN));
    console.log("  MOOD:", user.getVariable(USERVARIABLES.MOOD));
    console.log("  IMAGE:", user.getVariable(USERVARIABLES.IMAGE));
    console.log("  PX:", user.getVariable(USERVARIABLES.PX));
    console.log("  PY:", user.getVariable(USERVARIABLES.PY));
    console.log("  All Variables:", JSON.stringify(user.getVariables(), null, 2));
    console.log("  XML Message:", message);

    // Send to all users in room including the entering user
    // CRITICAL: Must send to all users including self to trigger onUserEnterRoom
    room.broadcastToRoom(message);
    
    console.log("🔴 AVATAR DEBUG - Sent uER message to", room.getUserList().size, "users in room", room.id);
  }

  // CRITICAL: Ensure all avatar variables are properly set
  ensureAvatarVariables(user) {
    // CRITICAL FIX: PX and PY MUST be set for avatar to appear in room!
    // Without these, avatar only shows in inventory but not in the room
    // See UVarsUpdater.as line 223-226
    // Get player data if available
    const p = user.playerData || {};
    
    // Critical avatar variables that MUST be present for avatar display
    // CRITICAL FIX: SKIN=57, MOOD=56, IMAGE=55 (not 0,1,2!)
    const criticalVars = [
      [USERVARIABLES.SKIN, p.skintone || 1],       // Key "57" - CRITICAL!
      [USERVARIABLES.MOOD, 1],                      // Key "56" - CRITICAL!
      [USERVARIABLES.IMAGE, 0],                     // Key "55" - CRITICAL!
      // PX/PY: CRITICAL for room display! Must be valid coordinates
      [USERVARIABLES.PX, 450],                      // Key "7"
      [USERVARIABLES.PY, 350],                      // Key "8"
      [USERVARIABLES.SPEED, 0],                     // Key "9"
      [USERVARIABLES.FACE_DIRECTION, 0],
      [USERVARIABLES.AVATAR_GENDER, p.gender || 1],
      [USERVARIABLES.AVATAR_SKINTONE, p.skintone || 1],
      [USERVARIABLES.AVATAR_EYES, p.eyes || 1],
      [USERVARIABLES.AVATAR_MOUTH, p.mouth || 1],
      [USERVARIABLES.AVATAR_HAIR, p.hair || 1],
      [USERVARIABLES.AVATAR_MAKEUP, p.makeup || 0],
      // Use 0 for clothing to avoid loading invalid item IDs that could hide the avatar.
      // These will be replaced by resolved ordinals during login if available.
      [USERVARIABLES.AVATAR_COAT, 0],
      [USERVARIABLES.AVATAR_SHIRT, 0],
      [USERVARIABLES.AVATAR_PANTS, 0],
      [USERVARIABLES.AVATAR_SHOES, 0],
      [USERVARIABLES.AVATAR_EARINGS, 0],
      [USERVARIABLES.AVATAR_NECKLACE, 0],
      [USERVARIABLES.AVATAR_GLASSES, 0],
      [USERVARIABLES.AVATAR_RING, 0],
      [USERVARIABLES.AVATAR_HOVERINGITEM, 0],
      [USERVARIABLES.AVATAR_HAT, 0],
      [USERVARIABLES.AVATAR_SKATES, 0],
      [USERVARIABLES.LEVEL, p.level || 1],
      [USERVARIABLES.LEADERSHIP, p.leadership_points || 0],
      [USERVARIABLES.MAY_CHANGE_LEAD, p.may_change_lead || 0],
      // numeric 0/1 flags for AS comparisons
      [USERVARIABLES.IS_PREMIUM, p.is_premium ? 1 : 0],
      [USERVARIABLES.IS_MOD, p.is_mod ? 1 : 0],
      [USERVARIABLES.RANGER_LEVEL, p.ranger_level || 0],
      [USERVARIABLES.SENIORITY_LEVEL, p.seniority_level || 1],
      [USERVARIABLES.ANIMAL_TYPE_LEVEL, p.animal_level || 0],
      [USERVARIABLES.ALLOW_POTIONS, 1],
      // house / trading defaults
      [USERVARIABLES.HOUSE_LOCKED, p.house_locked ? 1 : 0],
      [USERVARIABLES.IS_TRADING, 0],
      [USERVARIABLES.IS_IN_CREDITSSTORE, 0],
      [USERVARIABLES.HOUSE_USER_ID, -1],
      [USERVARIABLES.HPX, -1],
      [USERVARIABLES.HPY, -1],
      [USERVARIABLES.HOUSE_FACE_DIRECTION, 0],
      [USERVARIABLES.HOUSE_EDIT_MODE, 0],
      [USERVARIABLES.EVENT_GROUP_ID, -1],
      [USERVARIABLES.ACTIVE_MOD, 0],
      [USERVARIABLES.EMOTION_ID, 0],
      [USERVARIABLES.GAME_ID, 0],
      [USERVARIABLES.ANIMAL_GAME_ID, 0],
      [USERVARIABLES.UID, user.id],
      [USERVARIABLES.NAME, user.name]
    ];

    let updated = false;
    const changedVars = [];
    
    console.log("🔧 AVATAR DEBUG - ensureAvatarVariables for", user.name);
    console.log("  Current PX before check:", user.getVariable(USERVARIABLES.PX));
    console.log("  Current PY before check:", user.getVariable(USERVARIABLES.PY));
    
    for (const [varKey, defaultValue] of criticalVars) {
      const currentValue = user.getVariable(varKey);
      // Only set if null/undefined. Don't override existing values (like PX/PY from login)
      if (currentValue == null || currentValue === undefined) {
        user.setVariable(varKey, defaultValue);
        changedVars.push({key: varKey, value: defaultValue});
        updated = true;
        
        if (varKey === USERVARIABLES.PX || varKey === USERVARIABLES.PY) {
          console.log(`  ⚠️  Setting ${varKey === USERVARIABLES.PX ? 'PX' : 'PY'} from ${currentValue} to ${defaultValue}`);
        }
      } else {
        if (varKey === USERVARIABLES.PX || varKey === USERVARIABLES.PY) {
          console.log(`  ✅ Keeping existing ${varKey === USERVARIABLES.PX ? 'PX' : 'PY'} value: ${currentValue}`);
        }
      }
    }
    
    console.log("  PX after ensure:", user.getVariable(USERVARIABLES.PX));
    console.log("  PY after ensure:", user.getVariable(USERVARIABLES.PY));
    
    if (changedVars.length > 0) {
      DebugLogger.info("AVATAR_FIX", `🔧 Set missing avatar variables for ${user.name}`, {
        userId: user.id,
        changedCount: changedVars.length,
        changedVars: changedVars,
        hasPX: user.getVariable(USERVARIABLES.PX) != null,
        hasPY: user.getVariable(USERVARIABLES.PY) != null,
        PX: user.getVariable(USERVARIABLES.PX),
        PY: user.getVariable(USERVARIABLES.PY)
      });
    }

    // Extra safety: if PX/PY exist but are invalid (NaN/negative/huge), normalize to safe defaults
    try {
      const defaultX = 450;
      const defaultY = 350;
      const curPX = Number(user.getVariable(USERVARIABLES.PX));
      const curPY = Number(user.getVariable(USERVARIABLES.PY));
      if (!Number.isFinite(curPX) || curPX < 0 || curPX > 2000) {
        user.setVariable(USERVARIABLES.PX, defaultX);
        updated = true;
      }
      if (!Number.isFinite(curPY) || curPY < 0 || curPY > 2000) {
        user.setVariable(USERVARIABLES.PY, defaultY);
        updated = true;
      }
    } catch (_) {}

    // Sanitize appearance ordinals: clamp to safe ranges so Flash won't fail to render
    const clamp0to999 = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 999) ? v : 0;
    const clamp1to50  = (v) => (typeof v === 'number' && isFinite(v) && v >= 1 && v <= 50) ? v : 1; // conservative defaults

    // Clamp gender explicitly to 0/1 (0=male, 1=female)
    try {
      const g = Number(user.getVariable(USERVARIABLES.AVATAR_GENDER));
      if (!(g === 0 || g === 1)) {
        user.setVariable(USERVARIABLES.AVATAR_GENDER, 0);
        updated = true;
      }
    } catch (_) {}

    // Body parts (face features) – default to 1 if out of range
    const faceKeys = [
      USERVARIABLES.AVATAR_EYES,
      USERVARIABLES.AVATAR_MOUTH,
      USERVARIABLES.AVATAR_HAIR,
    ];
    for (const k of faceKeys) {
      const v = user.getVariable(k);
      const nv = clamp1to50(v);
      if (v !== nv) { user.setVariable(k, nv); updated = true; }
    }

    // Clothing/attachments – default to 0 (none) if out of range
    const clothingKeys = [
      USERVARIABLES.AVATAR_COAT,
      USERVARIABLES.AVATAR_SHIRT,
      USERVARIABLES.AVATAR_PANTS,
      USERVARIABLES.AVATAR_SHOES,
      USERVARIABLES.AVATAR_EARINGS,
      USERVARIABLES.AVATAR_NECKLACE,
      USERVARIABLES.AVATAR_GLASSES,
      USERVARIABLES.AVATAR_RING,
      USERVARIABLES.AVATAR_HOVERINGITEM,
      USERVARIABLES.AVATAR_HAT,
      USERVARIABLES.AVATAR_SKATES,
    ];
    for (const k of clothingKeys) {
      const v = user.getVariable(k);
      const nv = clamp0to999(v);
      if (v !== nv) { user.setVariable(k, nv); updated = true; }
    }
    
    if (updated) {
      DebugLogger.debug("AVATAR", `Ensured avatar variables for user ${user.name}`, {
        userId: user.id,
        variables: user.getVariables()
      });
    }
  }

  sendUserLeaveRoom(room, user) {
    const message = `<msg t='sys'><body action='userGone' r='${room.id}'><user id='${user.id}' /></body></msg>`;
    room.broadcastToRoom(message);
  }

  sendLeaveRoomResponse(socket, room) {
    const message = `<msg t='sys'><body action='leaveRoom' r='${room.id}'><rm id='${room.id}' /></body></msg>`;
    this.sendToSocket(socket, message);
  }

  sendUserCountUpdate(room) {
    const message = `<msg t='sys'><body action='uCount' r='${room.id}' u='${room.userCount}' s='${room.spectatorCount}'></body></msg>`;
    for (let [userId, user] of this.users) {
      user.sendMessage(message);
    }
  }

  broadcastPublicMessage(room, sender, message) {
    const xmlMessage = `<msg t='sys'><body action='pubMsg' r='${room.id}'><user id='${sender.id}' /><txt><![CDATA[${message}]]></txt></body></msg>`;
    room.broadcastToRoom(xmlMessage);
  }

  // Adapter for extension handlers: send a public chat message
  // Used by extension_bypass Chat handler to emit SmartFox-style pubMsg
  sendPublicMessage(socket, message, roomId = null) {
    try {
      const room = roomId
        ? this.rooms.get(parseInt(roomId))
        : socket?.sfsUser?.currentRoom || null;
      if (!room || !socket?.sfsUser) return;
      this.broadcastPublicMessage(room, socket.sfsUser, message);
    } catch (_) {}
  }

  // Adapter for extension handlers: broadcast an extension response to a room
  // This sends the given payload as an extension response to every user in the room
  broadcastToRoom(roomId, payload, messageType = PROTOCOL.XTMSG_TYPE_JSON) {
    try {
      const room = this.rooms.get(parseInt(roomId));
      if (!room) return;
      const all = room.getUserList();
      for (const [id, user] of all) {
        // Reuse the same path the server uses for single-user extension replies
        this.sendExtensionResponse(user.socket, payload, messageType);
      }
    } catch (e) {
      DebugLogger.warn("EXT_BROADCAST", "Failed to broadcast extension payload to room", {
        roomId,
        error: e.message,
      });
    }
  }

  sendPrivateMessage(sender, recipient, message, roomId) {
    const xmlMessage = `<msg t='sys'><body action='prvMsg' r='${roomId}'><user id='${sender.id}' /><txt rcp='${recipient.id}'><![CDATA[${message}]]></txt></body></msg>`;
    recipient.sendMessage(xmlMessage);

    // Also send to sender as confirmation
    sender.sendMessage(xmlMessage);
  }

  sendModeratorMessage(sender, message, messageType, targetId, roomId) {
    const xmlMessage = `<msg t='sys'><body action='modMsg' r='${roomId}'><user id='${sender.id}' /><txt t='${messageType}' id='${targetId}'><![CDATA[${message}]]></txt></body></msg>`;

    if (messageType === "u") {
      // Send to specific user
      const targetUser = this.users.get(targetId);
      if (targetUser) {
        targetUser.sendMessage(xmlMessage);
      }
    } else if (messageType === "r") {
      // Send to room
      const room = this.rooms.get(targetId);
      if (room) {
        room.broadcastToRoom(xmlMessage);
      }
    } else if (messageType === "z") {
      // Send to zone (all users)
      for (let [userId, user] of this.users) {
        user.sendMessage(xmlMessage);
      }
    }
  }

  broadcastUserVariableUpdate(room, user, changedVars) {
    // Build changed variables XML - includes avatar updates
    let changedVarsXml = "<vars>";

    DebugLogger.debug("AVATAR", `Broadcasting user variable update for ${user.name}`, {
      userId: user.id,
      roomId: room.id,
      changedVars: changedVars,
      userVars: user.getVariables(),
      criticalVars: {
        skin: user.getVariable(USERVARIABLES.SKIN),
        mood: user.getVariable(USERVARIABLES.MOOD),
        image: user.getVariable(USERVARIABLES.IMAGE)
      }
    });

    // Sort variables by key for consistent ordering
    const sortedVarNames = [...changedVars].sort(
      (a, b) => parseInt(a) - parseInt(b),
    );

    for (let varName of sortedVarNames) {
      const varValue = user.getVariable(varName);
      if (varValue !== null && varValue !== undefined) {
        const varType =
          typeof varValue === "boolean"
            ? "b"
            : typeof varValue === "number"
              ? "n"
              : "s";
        const varValueStr =
          varType === "b" ? (varValue ? "1" : "0") : String(varValue);
        changedVarsXml += `<var n='${varName}' t='${varType}'><![CDATA[${varValueStr}]]></var>`;
      }
    }
    changedVarsXml += "</vars>";

    const message = `<msg t='sys'><body action='uVarsUpdate' r='${room.id}'><user id='${user.id}' />${changedVarsXml}</body></msg>`;
    room.broadcastToRoom(message); // Send to ALL users including the one who changed (for inventory sync)
  }

  broadcastRoomVariableUpdate(room, user, changedVars) {
    // Build changed variables XML
    let changedVarsXml = "<vars>";
    for (let varName of changedVars) {
      const varValue = room.getVariable(varName);
      if (varValue !== null && varValue !== undefined) {
        const varType =
          typeof varValue === "boolean"
            ? "b"
            : typeof varValue === "number"
              ? "n"
              : "s";
        const varValueStr =
          varType === "b" ? (varValue ? "1" : "0") : String(varValue);
        changedVarsXml += `<var n='${varName}' t='${varType}'><![CDATA[${varValueStr}]]></var>`;
      }
    }
    changedVarsXml += "</vars>";

    const message = `<msg t='sys'><body action='rVarsUpdate' r='${room.id}'><user id='${user.id}' />${changedVarsXml}</body></msg>`;
    room.broadcastToRoom(message);
  }

  broadcastActionScriptObject(room, sender, serializedObject) {
    const message = `<msg t='sys'><body action='dataObj' r='${room.id}'><user id='${sender.id}' /><dataObj><![CDATA[${serializedObject}]]></dataObj></body></msg>`;
    room.broadcastToRoom(message, sender);
  }

  sendExtensionResponse(socket, data, messageType) {
    if (!socket.sfsUser) {
      DebugLogger.xml(
        "extension_response_error",
        "NO_USER_FOR_EXTENSION_RESPONSE",
        {
          connectionId: socket ? socket.connectionId : "UNKNOWN",
          messageType: messageType,
          dataKeys: data ? Object.keys(data) : [],
        },
      );
      return;
    }

    // Concise: suppress extension response prep log

    let message;

    if (messageType === PROTOCOL.XTMSG_TYPE_JSON) {
      const responseData = {
        t: "xt",
        b: {
          o: data,
        },
      };
      message = JSON.stringify(responseData);

      // Concise: no JSON payload dump
    } else if (messageType === PROTOCOL.XTMSG_TYPE_STR) {
      message =
        PROTOCOL.MSG_STR +
        "xt" +
        PROTOCOL.MSG_STR +
        "response" +
        PROTOCOL.MSG_STR;
      for (let key in data) {
        message += data[key] + PROTOCOL.MSG_STR;
      }

      // Concise: no string payload dump
    } else {
      // XML format
      const serializedData = this.serializeObjectToXml(data);
      message = `<msg t='xt'><body action='xtRes' r='0' id='0'><![CDATA[${serializedData}]]></body></msg>`;

      // Concise: no XML payload dump
    }

    // Concise: final outgoing will be logged by DebugLogger.xml in sendToSocket

    this.sendToSocket(socket, message);
  }

  serializeObjectToXml(obj) {
    // Concise: suppress serialization logs

    // Simple object to XML serialization
    // This should match the ObjectSerializer from the ActionScript client
    let xml = "<dataObj>";
    let varCount = 0;

    for (let key in obj) {
      let value = obj[key];
      let type = typeof value;
      const originalValue = value;
      const originalType = type;

      if (type === "boolean") {
        value = value ? "1" : "0";
        type = "b";
      } else if (type === "number") {
        type = "n";
      } else if (type === "string") {
        type = "s";
      } else if (value === null || value === undefined) {
        value = "";
        type = "x";
      } else if (type === "object") {
        value = JSON.stringify(value);
        type = "s";
      }

      varCount++;
      // Concise: suppress per-var serialization logs

      xml += `<var n='${key}' t='${type}'><![CDATA[${value}]]></var>`;
    }
    xml += "</dataObj>";

    // Concise: suppress serialization completion

    return xml;
  }

  deserializeXmlObject(xmlString) {
    // Concise: suppress deserialization logs

    // Simple XML to object deserialization to match ActionScript ObjectSerializer
    const obj = {};

    // Match dataObj tags
    const dataObjMatch = xmlString.match(/<dataObj[^>]*>(.*?)<\/dataObj>/s);
    if (!dataObjMatch) {
      // Concise: suppress fallback log

      // Try to parse as simple object with name/cmd/param structure
      const nameMatch = xmlString.match(/<name>([^<]*)<\/name>/);
      const cmdMatch = xmlString.match(/<cmd>([^<]*)<\/cmd>/);
      const paramMatch = xmlString.match(/<param>(.*?)<\/param>/s);
      // Concise: suppress simple structure details

      if (nameMatch) obj.name = nameMatch[1];
      if (cmdMatch) obj.cmd = cmdMatch[1];
      if (paramMatch) obj.param = this.deserializeXmlObject(paramMatch[1]);

      // Concise: suppress simple deserialization result

      return obj;
    }

    // Concise: suppress dataObj parsing details

    const varsContent = dataObjMatch[1];
    const varRegex =
      /<var n='([^']*)' t='([^']*)'><\!\[CDATA\[([^\]]*)\]\]><\/var>/g;
    let match;
    let varCount = 0;

    while ((match = varRegex.exec(varsContent)) !== null) {
      const varName = match[1];
      const varType = match[2];
      let varValue = match[3];
      const originalValue = varValue;

      varCount++;

      // Convert value based on type
      switch (varType) {
        case "b": // boolean
          varValue = varValue === "1";
          break;
        case "n": // number
          varValue = parseFloat(varValue);
          break;
        case "s": // string
          // Keep as is
          break;
        case "x": // null/undefined
          varValue = null;
          break;
      }

      // Concise: suppress per-var deserialization logs

      obj[varName] = varValue;
    }

    // Concise: suppress deserialization completion

    return obj;
  }

  detectXmlMessageType(message) {
    if (!message || typeof message !== "string") return "UNKNOWN";

    try {
      // Extract message type and action from XML
      const msgMatch = message.match(/<msg\s+t=['"](\w+)['"]/);
      const bodyMatch = message.match(/<body\s+action=['"](\w+)['"]/);

      if (msgMatch && bodyMatch) {
        return `${msgMatch[1].toUpperCase()}_${bodyMatch[1].toUpperCase()}`;
      } else if (msgMatch) {
        return `${msgMatch[1].toUpperCase()}_MESSAGE`;
      } else if (message.includes("<cross-domain-policy>")) {
        return "CROSSDOMAIN_POLICY";
      } else if (message.includes("<?xml")) {
        return "XML_DECLARATION";
      } else {
        return "UNKNOWN_XML";
      }
    } catch (error) {
      return "PARSE_ERROR";
    }
  }

  sendToSocket(socket, message) {
    if (socket && !socket.destroyed) {
      try {
        // Log outgoing XML messages with detailed formatting
        if (message && message.includes("<")) {
          DebugLogger.xml("outgoing", message, {
            connectionId: socket.connectionId,
            user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
          });
        }

        const buffer = Buffer.from(message + "\0", "utf8");
        socket.write(buffer);
        // Concise: no extra sent_success line
      } catch (error) {
        this.stats.errors++;

        // Concise error
        DebugLogger.error("SOCKET", `Error sending message: ${error.message}`);
      }
    } else {
      // Concise warning for destroyed socket
      DebugLogger.warn(
        "SOCKET",
        "Attempted to send message to destroyed socket",
      );
    }
  }

  sendRawToSocket(socket, message) {
    if (socket && !socket.destroyed) {
      try {
        // Log outgoing raw XML messages
        if (message && message.includes("<")) {
          DebugLogger.xml("outgoing", message, {
            connectionId: socket.connectionId,
            user: socket.sfsUser ? socket.sfsUser.name : "NOT_LOGGED_IN",
          });
        }

        // For XMLSocket protocol, send raw XML with null terminator (required by Flash XMLSocket)
        const buffer = Buffer.from(message + "\0", "utf8");
        socket.write(buffer);

        // Concise: no extra sent_success line
      } catch (error) {
        this.stats.errors++;

        DebugLogger.error(
          "SOCKET",
          `Error sending raw message: ${error.message}`,
        );
      }
    } else {
      DebugLogger.warn(
        "SOCKET",
        "Attempted to send raw message to destroyed socket",
      );
    }
  }

  // Buddy system methods
  findUserByName(name) {
    for (let [userId, user] of this.users) {
      if (user.name === name) {
        return user;
      }
    }
    return null;
  }

  isBuddy(user1, user2) {
    return user1.buddyList.some((buddy) => buddy.id === user2.id);
  }

  addToBuddyList(user, buddy) {
    if (!this.isBuddy(user, buddy)) {
      user.buddyList.push({
        id: buddy.id,
        name: buddy.name,
        isOnline: true,
        isBlocked: false,
      });
    }
  }

  removeBuddyFromList(user, buddyName) {
    user.buddyList = user.buddyList.filter((buddy) => buddy.name !== buddyName);
  }

  sendBuddyRequest(requester, target) {
    const message = `<msg t='sys'><body action='bPrm' r='0'><n>${requester.name}</n></body></msg>`;
    target.sendMessage(message);
  }

  sendBuddyList(socket) {
    const user = socket.sfsUser;
    if (!user) return;

    let buddyListXml = "<bList>";
    for (let buddy of user.buddyList) {
      buddyListXml += `<b i='${buddy.id}' s='${buddy.isOnline ? 1 : 0}' x='${buddy.isBlocked ? 1 : 0}'>`;
      buddyListXml += `<n><![CDATA[${buddy.name}]]></n>`;
      buddyListXml += "</b>";
    }
    buddyListXml += "</bList>";

    const message = `<msg t='sys'><body action='bList' r='0'>${buddyListXml}</body></msg>`;
    this.sendToSocket(socket, message);
  }

  sendBuddyAdded(socket, buddy) {
    const message = `<msg t='sys'><body action='bAdd' r='0'><b i='${buddy.id}' s='1' x='0'><n><![CDATA[${buddy.name}]]></n></b></body></msg>`;
    this.sendToSocket(socket, message);
  }

  sendBuddyRejected(socket, rejector) {
    const message = `<msg t='sys'><body action='bRej' r='0'><n><![CDATA[${rejector.name}]]></n></body></msg>`;
    this.sendToSocket(socket, message);
  }

  sendBuddyError(socket, error) {
    const message = `<msg t='sys'><body action='bErr' r='0'>${error}</body></msg>`;
    this.sendToSocket(socket, message);
  }

  sendBuddyRoom(socket, buddy, room) {
    const message = `<msg t='sys'><body action='roomB' r='0'><b i='${buddy.id}' r='${room.id}' /></body></msg>`;
    this.sendToSocket(socket, message);
  }

  notifyBuddyVariableUpdate(user, variables) {
    // Notify all buddies of variable changes
    for (let buddy of user.buddyList) {
      const buddyUser = this.users.get(buddy.id);
      if (buddyUser) {
        // Send buddy variable update
        let varsXml = "<vars>";
        for (let varName in variables) {
          const varValue = variables[varName];
          const varType =
            typeof varValue === "boolean"
              ? "b"
              : typeof varValue === "number"
                ? "n"
                : "s";
          const varValueStr =
            varType === "b" ? (varValue ? "1" : "0") : String(varValue);
          varsXml += `<var n='${varName}' t='${varType}'><![CDATA[${varValueStr}]]></var>`;
        }
        varsXml += "</vars>";

        const message = `<msg t='sys'><body action='bUpd' r='0'><b i='${user.id}'>${varsXml}</b></body></msg>`;
        buddyUser.sendMessage(message);
      }
    }
  }

  // Inventory management methods
  async getUserInventory(userId) {
    if (!dbClient) {
      return {};
    }

    try {
      const result = await dbClient.query(
        "SELECT inventory FROM players WHERE id = $1",
        [userId],
      );

      if (result.rows.length === 0) {
        return {};
      }

      const inventoryJson = result.rows[0].inventory;
      if (!inventoryJson) {
        return {};
      }

      return JSON.parse(inventoryJson);
    } catch (error) {
      console.error("Error getting user inventory:", error);
      return {};
    }
  }

  async updateUserInventory(userId, inventory) {
    if (!dbClient) {
      return false;
    }

    try {
      const inventoryJson = JSON.stringify(inventory);
      await dbClient.query(
        "UPDATE players SET inventory = $1, updated_at = NOW() WHERE id = $2",
        [inventoryJson, userId],
      );
      return true;
    } catch (error) {
      console.error("Error updating user inventory:", error);
      return false;
    }
  }

  async addItemToInventory(userId, itemId, count = 1) {
    const inventory = await this.getUserInventory(userId);

    if (inventory[itemId]) {
      inventory[itemId] += count;
    } else {
      inventory[itemId] = count;
    }

    return await this.updateUserInventory(userId, inventory);
  }

  async removeItemFromInventory(userId, itemId, count = 1) {
    const inventory = await this.getUserInventory(userId);

    if (!inventory[itemId]) {
      return false;
    }

    inventory[itemId] -= count;
    if (inventory[itemId] <= 0) {
      delete inventory[itemId];
    }

    return await this.updateUserInventory(userId, inventory);
  }

  async getUserRecycleInventory(userId) {
    if (!dbClient) {
      DebugLogger.error("DB", "Database connection required");
      return {};
    }

    try {
      const result = await dbClient.query(
        "SELECT recycle_inventory FROM players WHERE id = $1",
        [userId],
      );

      if (result.rows.length === 0) {
        return {};
      }

      const recycleJson = result.rows[0].recycle_inventory;
      if (!recycleJson) {
        return {};
      }

      return JSON.parse(recycleJson);
    } catch (error) {
      console.error("Error getting user recycle inventory:", error);
      return {};
    }
  }

  async updateUserRecycleInventory(userId, recycleInventory) {
    if (!dbClient) {
      return false;
    }

    try {
      const recycleJson = JSON.stringify(recycleInventory);
      await dbClient.query(
        "UPDATE players SET recycle_inventory = $1, updated_at = NOW() WHERE id = $2",
        [recycleJson, userId],
      );
      return true;
    } catch (error) {
      console.error("Error updating user recycle inventory:", error);
      return false;
    }
  }

  // Game and data methods
  async getItemData(itemId) {
    if (!dbClient) {
      DebugLogger.error("DB", "Database connection required for getItemData");
      return null;
    }

    try {
      const result = await dbClient.query(
        `
                SELECT
                    i.id,
                    i.name,
                    i.type,
                    i.level,
                    i.leadership,
                    i.gender,
                    i.ordinal,
                    i.count,
                    i.inventory_type,
                    i.price,
                    i.sell_price,
                    i.tradeble,
                    i.premium,
                    i.valid_for_days,
                    i.pioneer_points,
                    i.seniority,
                    i.recycled_creation_price,
                    i.recycled_items,
                    i.store_available,
                    it.name as type_name
                FROM items i
                LEFT JOIN item_types it ON i.type = it.id
                WHERE i.id = $1
            `,
        [itemId],
      );

      if (result.rows.length === 0) {
        console.log(`Item ${itemId} not found in database`);
        return null;
      }

      const item = result.rows[0];

      // Parse recycled_items if it exists
      let recycled_items_parsed = null;
      if (item.recycled_items) {
        try {
          recycled_items_parsed = JSON.parse(item.recycled_items);
        } catch (e) {
          console.error("Error parsing recycled_items for item", itemId, e);
        }
      }

      return {
        id: item.id,
        name: item.name,
        type: item.type,
        type_name: item.type_name,
        level: item.level || 1,
        leadership: item.leadership || 0,
        gender: item.gender || 0,
        ordinal: item.ordinal || 0,
        count: item.count || 1,
        inventory_type: item.inventory_type || 1,
        price: item.price || 0,
        sell_price: item.sell_price || Math.floor((item.price || 0) * 0.5),
        tradeble: item.tradeble !== false,
        premium: item.premium || false,
        valid_for_days: item.valid_for_days || 0,
        pioneer_points: item.pioneer_points || 0,
        seniority: item.seniority || 0,
        recycled_creation_price: item.recycled_creation_price || 0,
        recycled_items: recycled_items_parsed,
        store_available: item.store_available !== false,
      };
    } catch (error) {
      console.error("Error getting item data:", error);
      return null;
    }
  }

  async getGameData(gameId) {
    if (!dbClient) {
      DebugLogger.error("DB", "Database connection required for getGameData");
      return null;
    }

    try {
      const result = await dbClient.query(
        `
                SELECT
                    g.id,
                    g.name,
                    g.url,
                    g.npc_id,
                    g.xml,
                    g.icon_url,
                    g.type,
                    g.premium,
                    g.display_order,
                    g.one_on_one_visible,
                    gt.name as type_name,
                    n.name as npc_name
                FROM games g
                LEFT JOIN game_types gt ON g.type = gt.id
                LEFT JOIN npcs n ON g.npc_id = n.id
                WHERE g.id = $1
            `,
        [gameId],
      );

      if (result.rows.length === 0) {
        console.log(`Game ${gameId} not found in database`);
        return null;
      }

      const game = result.rows[0];

      // Parse XML data if it exists
      let xmlData = null;
      if (game.xml) {
        try {
          xmlData = JSON.parse(game.xml);
        } catch (e) {
          // XML might be actual XML string, not JSON
          xmlData = game.xml;
        }
      }

      return {
        id: game.id,
        name: game.name,
        url: game.url || "",
        npc_id: game.npc_id,
        npc_name: game.npc_name,
        xml: xmlData,
        icon_url: game.icon_url || "",
        type: game.type || 1,
        type_name: game.type_name,
        premium: game.premium || false,
        display_order: game.display_order || 0,
        one_on_one_visible: game.one_on_one_visible || false,
      };
    } catch (error) {
      console.error("Error getting game data:", error);
      return null;
    }
  }

  async getStoreData(storeId) {
    if (!dbClient) {
      DebugLogger.error("DB", "Database connection required for getStoreData");
      return null;
    }

    try {
      const result = await dbClient.query(
        "SELECT * FROM stores WHERE id = $1",
        [storeId],
      );

      if (result.rows.length === 0) {
        console.log(`Store ${storeId} not found in database`);
        return null;
      }

      const store = result.rows[0];
      let items = [];

      // Parse items - the items column contains comma-separated values
      if (store.items) {
        try {
          let itemIds = [];

          // Check if it's a string with comma-separated values
          if (typeof store.items === "string") {
            itemIds = store.items
              .split(",")
              .map((id) => parseInt(id.trim()))
              .filter((id) => !isNaN(id));
          } else {
            // Try parsing as JSON if it's not a string
            try {
              itemIds = JSON.parse(store.items);
            } catch (jsonError) {
              // If JSON parsing fails, convert to string and split
              itemIds = store.items
                .toString()
                .split(",")
                .map((id) => parseInt(id.trim()))
                .filter((id) => !isNaN(id));
            }
          }

          // Get full item data for each item in the store
          if (Array.isArray(itemIds) && itemIds.length > 0) {
            const itemsResult = await dbClient.query(
              `
                            SELECT
                                i.id,
                                i.name,
                                i.type,
                                i.level,
                                i.leadership,
                                i.gender,
                                i.price,
                                i.sell_price,
                                i.premium,
                                i.tradeble,
                                i.inventory_type,
                                i.store_available,
                                it.type_name as type_name
                            FROM items i
                            LEFT JOIN item_types it ON i.type = it.id
                            WHERE i.id = ANY($1) AND i.store_available = true
                            ORDER BY i.ordinal, i.id
                        `,
              [itemIds],
            );

            items = itemsResult.rows;
          }
        } catch (e) {
          console.error("Error parsing store items for store", storeId, e);
        }
      }

      return {
        id: store.id,
        items: items,
        itemCount: items.length,
      };
    } catch (error) {
      console.error("Error getting store data:", error);
      return null;
    }
  }

  async getStaticData() {
    // Return static game data
    return {
      version: "1.0",
      timestamp: Date.now(),
    };
  }

  generateGameToken(user, gameId) {
    // Generate a unique game token
    return crypto
      .createHash("md5")
      .update(user.id + gameId + Date.now())
      .digest("hex")
      .substring(0, 16);
  }

  getRoomUsersList(room) {
    // Get list of users in room with their basic info
    const users = [];

    // Add regular users
    for (let [userId, user] of room.users) {
      users.push({
        id: user.id,
        name: user.name,
        isSpectator: false,
        variables: user.getVariables(),
      });
    }

    // Add spectators
    for (let [userId, user] of room.spectators) {
      users.push({
        id: user.id,
        name: user.name,
        isSpectator: true,
        variables: user.getVariables(),
      });
    }

    return users;
  }

  // ---------- Static file serving ----------

  safeJoin(base, target) {
    try {
      const targetPath = path.posix.normalize("/" + (target || ""));
      const resolved = path.join(base, targetPath);
      if (!resolved.startsWith(base)) return null; // prevent traversal
      return resolved;
    } catch (e) {
      return null;
    }
  }

  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
      ".swf": "application/x-shockwave-flash",
      ".xml": "application/xml",
      ".json": "application/json",
      ".html": "text/html; charset=utf-8",
      ".htm": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".txt": "text/plain; charset=utf-8",
    };
    return map[ext] || "application/octet-stream";
  }

  serveStatic(req, res) {
    try {
      const rawUrl = req.url || "/";
      const pathname = decodeURIComponent(rawUrl.split("?")[0] || "/");

      // Primary resolution under GAME_PATH
      let abs = this.safeJoin(CONFIG.GAME_PATH, pathname);
      if (!abs) return false;

      const serveFile = (fullPath, urlShown) => {
        const mime = this.getMimeType(fullPath);
        res.writeHead(200, {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=86400",
        });
        fs.createReadStream(fullPath).pipe(res);
        DebugLogger.info("HTTP", `Served static file ${urlShown}`);
        return true;
      };

      // Serve direct hit
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        return serveFile(abs, pathname);
      }

      // Fallbacks for relative asset loads from inside room SWFs
      // Many room SWFs load avatar item assets via relative paths like
      //   ./items/<LAYER>/<LAYER>_<ordinal>.swf
      // which becomes /world_rooms/items/... at HTTP level. Remap those to /items/ at root.
      if (pathname.includes("/items/")) {
        const idx = pathname.indexOf("/items/");
        const itemsSub = pathname.substring(idx); // "/items/..."
        const remapped = this.safeJoin(CONFIG.GAME_PATH, itemsSub);
        if (
          remapped &&
          fs.existsSync(remapped) &&
          fs.statSync(remapped).isFile()
        ) {
          return serveFile(remapped, `${pathname} -> ${itemsSub}`);
        }
      }

      // No match
      return false;
    } catch (e) {
      DebugLogger.error("HTTP", "Static serving error", { error: e.message });
      return false;
    }
  }





  calculateGameRewards(user, gameId, score, level) {
    // Calculate rewards based on game performance
    const baseReward = level * 10;
    const scoreBonus = Math.floor(score / 100);

    return {
      activityPoints: baseReward + scoreBonus,
      gold: Math.floor((baseReward + scoreBonus) * 0.5),
      item: score > 1000 ? Math.floor(Math.random() * 100) + 1 : 0,
    };
  }

  updateUserGameStats(user, gameId, score, level, rewards) {
    // Update user statistics after game
    const currentPoints =
      user.getVariable(PROTOCOL.USERVARIABLES.LEADERSHIP) || 0;
    user.setVariable(
      PROTOCOL.USERVARIABLES.LEADERSHIP,
      currentPoints + rewards.activityPoints,
    );

    console.log(
      `Updated ${user.name} stats: +${rewards.activityPoints} points, +${rewards.gold} gold`,
    );
  }

  async processBuyItem(user, itemId, count) {
    if (!user || !user.accountId) {
      return { success: false, error: "Invalid user" };
    }

    // Get item data
    const itemData = await this.getItemData(itemId);
    if (!itemData) {
      return { success: false, error: "Item not found" };
    }

    // Check if item is available for purchase
    if (!itemData.store_available) {
      return { success: false, error: "Item not available for purchase" };
    }

    const totalCost = itemData.price * count;

    if (!dbClient) {
      DebugLogger.error(
        "DB",
        "Database connection required for processBuyItem",
      );
      return { success: false, error: "Database connection required" };
    }

    try {
      // Get current user gold and check if they have enough
      const playerResult = await dbClient.query(
        "SELECT gold FROM players WHERE id = $1",
        [user.dbId],
      );

      if (playerResult.rows.length === 0) {
        return { success: false, error: "Player not found" };
      }

      const currentGold = playerResult.rows[0].gold || 0;
      if (currentGold < totalCost) {
        return { success: false, error: "Not enough gold" };
      }

      // Start transaction
      await dbClient.query("BEGIN");

      try {
        // Deduct gold
        const newGold = currentGold - totalCost;
        await dbClient.query(
          "UPDATE players SET gold = $1, updated_at = NOW() WHERE id = $2",
          [newGold, user.dbId],
        );

        // Add item to inventory
        await this.addItemToInventory(user.dbId, itemId, count);

        // Commit transaction
        await dbClient.query("COMMIT");

        // Update user's cached gold value
        user.setVariable("gold", newGold);

        console.log(
          `User ${user.name} bought ${count}x item ${itemId} for ${totalCost} gold`,
        );
        return { success: true, newGold: newGold };
      } catch (error) {
        await dbClient.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.error("Error processing buy item:", error);
      return { success: false, error: "Server error processing purchase" };
    }
  }

  async processSellItem(user, itemId, count) {
    if (!user || !user.accountId) {
      return { success: false, error: "Invalid user" };
    }

    // Get item data
    const itemData = await this.getItemData(itemId);
    if (!itemData) {
      return { success: false, error: "Item not found" };
    }

    // Check if item is tradeable/sellable
    if (!itemData.tradeble) {
      return { success: false, error: "Item cannot be sold" };
    }

    if (!dbClient) {
      DebugLogger.error(
        "DB",
        "Database connection required for processSellItem",
      );
      return { success: false, error: "Database connection required" };
    }

    try {
      // Check if user has enough items to sell
      const inventory = await this.getUserInventory(user.dbId);
      const itemCount = inventory[itemId] || 0;

      if (itemCount < count) {
        return { success: false, error: "Not enough items to sell" };
      }

      // Calculate sell value
      const sellPrice = itemData.sell_price || Math.floor(itemData.price * 0.5);
      const totalValue = sellPrice * count;

      // Get current user gold
      const playerResult = await dbClient.query(
        "SELECT gold FROM players WHERE id = $1",
        [user.dbId],
      );

      if (playerResult.rows.length === 0) {
        return { success: false, error: "Player not found" };
      }

      const currentGold = playerResult.rows[0].gold || 0;

      // Start transaction
      await dbClient.query("BEGIN");

      try {
        // Add gold
        const newGold = currentGold + totalValue;
        await dbClient.query(
          "UPDATE players SET gold = $1, updated_at = NOW() WHERE id = $2",
          [newGold, user.dbId],
        );

        // Remove item from inventory
        await this.removeItemFromInventory(user.dbId, itemId, count);

        // Commit transaction
        await dbClient.query("COMMIT");

        // Update user's cached gold value
        user.setVariable("gold", newGold);

        console.log(
          `User ${user.name} sold ${count}x item ${itemId} for ${totalValue} gold`,
        );
        return { success: true, newGold: newGold };
      } catch (error) {
        await dbClient.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.error("Error processing sell item:", error);
      return { success: false, error: "Server error processing sale" };
    }
  }

  async processBuyAnimal(user, animalId) {
    if (!user || !user.accountId) {
      return { success: false, error: "Invalid user" };
    }

    if (!dbClient) {
      DebugLogger.error(
        "DB",
        "Database connection required for processBuyAnimal",
      );
      return { success: false, error: "Database connection required" };
    }

    try {
      // Get animal data
      const animalResult = await dbClient.query(
        `
                SELECT
                    a.id,
                    a.type_level,
                    a.max_age,
                    a.price,
                    a.quiz_id,
                    a.food_group,
                    a.clean_price,
                    a.item,
                    a.player_level,
                    a.pioneer_points
                FROM animals a
                WHERE a.id = $1
            `,
        [animalId],
      );

      if (animalResult.rows.length === 0) {
        return { success: false, error: "Animal not found" };
      }

      const animal = animalResult.rows[0];
      const animalPrice = animal.price || 500;

      // Check user level requirement
      if (animal.player_level && user.playerData.level < animal.player_level) {
        return {
          success: false,
          error: `Requires level ${animal.player_level}`,
        };
      }

      // Get current user data
      const playerResult = await dbClient.query(
        "SELECT gold, animals_adopted FROM players WHERE id = $1",
        [user.dbId],
      );

      if (playerResult.rows.length === 0) {
        return { success: false, error: "Player not found" };
      }

      const currentGold = playerResult.rows[0].gold || 0;
      if (currentGold < animalPrice) {
        return { success: false, error: "Not enough gold" };
      }

      // Parse current animals
      let animalsAdopted = {};
      try {
        animalsAdopted = JSON.parse(
          playerResult.rows[0].animals_adopted || "{}",
        );
      } catch (e) {
        console.error("Error parsing animals_adopted:", e);
      }

      // Start transaction
      await dbClient.query("BEGIN");

      try {
        // Deduct gold
        const newGold = currentGold - animalPrice;

        // Add animal to adopted animals
        const animalInstanceId = Date.now(); // Simple unique ID
        animalsAdopted[animalInstanceId] = {
          animal_id: animalId,
          type_level: animal.type_level,
          days_left: animal.max_age,
          size: 1,
          first_name: "",
          last_name: "",
          days_since_last_update: 0,
          adopted_date: new Date().toISOString(),
        };

        const animalsJson = JSON.stringify(animalsAdopted);

        // Update player data
        await dbClient.query(
          `
                    UPDATE players
                    SET gold = $1,
                        animals_adopted = $2,
                        animal_level = GREATEST(animal_level, $3),
                        updated_at = NOW()
                    WHERE id = $4
                `,
          [newGold, animalsJson, animal.type_level, user.dbId],
        );

        // Commit transaction
        await dbClient.query("COMMIT");

        // Update user variables
        user.setVariable("gold", newGold);
        user.setVariable(PROTOCOL.USERVARIABLES.ANIMAL, animalId);
        user.setVariable(
          PROTOCOL.USERVARIABLES.ANIMAL_TYPE_LEVEL,
          animal.type_level,
        );

        console.log(
          `User ${user.name} bought animal ${animalId} for ${animalPrice} gold`,
        );
        return {
          success: true,
          newGold: newGold,
          animalInstanceId: animalInstanceId,
          animal: animal,
        };
      } catch (error) {
        await dbClient.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.error("Error processing buy animal:", error);
      return {
        success: false,
        error: "Server error processing animal purchase",
      };
    }
  }

  async getAnimalStore() {
    if (!dbClient) {
      DebugLogger.error(
        "DB",
        "Database connection required for getAnimalStore",
      );
      return { animals: [] };
    }

    try {
      const result = await dbClient.query(`
                SELECT
                    a.id,
                    a.type_level,
                    a.max_age,
                    a.price,
                    a.quiz_id,
                    a.food_group,
                    a.clean_price,
                    a.item,
                    a.player_level,
                    a.pioneer_points,
                    s.name as store_name
                FROM animals a
                LEFT JOIN animal_stores s ON s.id = 1
                ORDER BY a.type_level, a.id
            `);

      return {
        animals: result.rows,
        storeData:
          result.rows.length > 0 ? { name: result.rows[0].store_name } : {},
      };
    } catch (error) {
      console.error("Error getting animal store:", error);
      return { animals: [] };
    }
  }

  async getAnimalFood(animalId = null) {
    if (!dbClient) {
      return { food: [] };
    }

    try {
      let query = `
                SELECT
                    af.id,
                    af.food_id,
                    af.price,
                    af.food_group,
                    af.nutrition_value,
                    af.description,
                    afg.items as group_items
                FROM animal_food af
                LEFT JOIN animal_food_groups afg ON af.food_group = afg.id
            `;

      let params = [];

      if (animalId) {
        // Get food for specific animal's food group
        query += `
                    WHERE af.food_group IN (
                        SELECT food_group FROM animals WHERE id = $1
                    )
                `;
        params.push(animalId);
      }

      query += " ORDER BY af.food_group, af.id";

      const result = await dbClient.query(query, params);

      return {
        food: result.rows,
      };
    } catch (error) {
      console.error("Error getting animal food:", error);
      return { food: [] };
    }
  }

  createTradeSession(user) {
    // Create a new trade session
    const tradeId = Date.now(); // Simple trade ID
    console.log(`Created trade session ${tradeId} for ${user.name}`);
    return tradeId;
  }

  async getRoomNPCs(roomId) {
    // Return an array of NPC objects keyed by numeric strings as per NPC.as constants
    const normalize = (list) => {
      const out = [];
      for (const n of list || []) {
        const obj = {};
        obj[PROTOCOL.NPC.ID] = n.id || 0;
        if (n.name !== undefined) obj[PROTOCOL.NPC.NAME] = n.name;
        if (n.history !== undefined) obj[PROTOCOL.NPC.HISTORY] = n.history;
        if (n.blubble !== undefined) obj[PROTOCOL.NPC.BLUBBLE] = n.blubble;
        obj[PROTOCOL.NPC.URL] = n.url || "";
        obj[PROTOCOL.NPC.PX] = n.px || 0;
        obj[PROTOCOL.NPC.PY] = n.py || 0;
        obj[PROTOCOL.NPC.MSGS] = Array.isArray(n.msgs) ? n.msgs : [];
        obj[PROTOCOL.NPC.ROOM_ID] = roomId;
        obj[PROTOCOL.NPC.PREMIUM_ONLY] = !!n.premium_only;
        out.push(obj);
      }
      return out;
    };

    if (!dbClient) {
      DebugLogger.warn(
        "DB",
        "No database for getRoomNPCs - returning empty list",
      );
      return normalize([]);
    }

    try {
      const result = await dbClient.query(
        `
                SELECT
                    n.id,
                    n.name,
                    n.history,
                    n.blubble,
                    n.url,
                    n.px,
                    n.py,
                    n.msgs,
                    n.premium_only
                FROM npcs n
                WHERE n.room_id = $1
                ORDER BY n.id
            `,
        [roomId],
      );

      const list = result.rows.map((npc) => {
        let messages = [];
        if (npc.msgs) {
          try {
            messages = JSON.parse(npc.msgs);
          } catch (e) {
            // Some legacy data is not JSON; ignore quietly to avoid noise
            DebugLogger.warn(
              "NPC",
              `Non-JSON msgs field for NPC ${npc.id} — ignoring`,
            );
            messages = [];
          }
        }
        return {
          id: npc.id,
          name: npc.name,
          history: npc.history,
          blubble: npc.blubble,
          url: npc.url,
          px: npc.px || 0,
          py: npc.py || 0,
          msgs: messages,
          premium_only: npc.premium_only || false,
        };
      });

      return normalize(list);
    } catch (error) {
      console.error("Error getting room NPCs:", error);
      // Return empty list on error (no file fallback)
      try {
        return [];
      } catch (e2) {
        return [];
      }
    }
  }

  async getRoomStaticData(roomId) {
    // Return an object keyed by ROOM.* numeric strings, with portals array keyed by PORTAL.*
    const normalize = (raw) => {
      const portalsSrc = Array.isArray(raw?.portals) ? raw.portals : [];
      const portals = portalsSrc.map((p) => {
        const o = {};
        o[PROTOCOL.PORTAL.ID] = p.id || 0;
        o[PROTOCOL.PORTAL.ROOM_A] = p.room_a || roomId;
        o[PROTOCOL.PORTAL.ROOM_B] = p.room_b || roomId;
        // Map state to numeric: open=1, closed=0 if strings used
        const st =
          typeof p.state === "string"
            ? p.state.toLowerCase() === "open"
              ? 1
              : 0
            : p.state || 0;
        o[PROTOCOL.PORTAL.STATE] = st;
        return o;
      });
      const out = {};
      out[PROTOCOL.ROOM.ID] = roomId;
      out[PROTOCOL.ROOM.SWF] = String(roomId);
      out[PROTOCOL.ROOM.SOUND] = raw?.sound || "";
      out[PROTOCOL.ROOM.PORTALS] = portals;
      out[PROTOCOL.ROOM.ZONE_ID] = raw?.zoneId || 1;
      out[PROTOCOL.ROOM.LEVEL] = raw?.level || 0;
      out[PROTOCOL.ROOM.SENIORITY] = raw?.seniority || 0;
      out[PROTOCOL.ROOM.LEADERSHIP] = raw?.leadership || 0;
      out[PROTOCOL.ROOM.PIONEER_POINTS] = raw?.pioneer_points || 0;
      out[PROTOCOL.ROOM.MUST_EQUIP] = !!raw?.mustEquip;
      out[PROTOCOL.ROOM.PREMIUM] = !!raw?.premium;
      out[PROTOCOL.ROOM.LIFE_LEVEL_TYPE] = raw?.lifeLevelType || null;
      return out;
    };

    if (!dbClient) {
      return normalize({ roomId, portals: [] });
    }

    try {
      // Get portals for this room
      const portalsResult = await dbClient.query(
        `
                SELECT
                    p.id,
                    p.room_a,
                    p.room_b,
                    p.state
                FROM portals p
                WHERE p.room_a = $1 OR p.room_b = $1
            `,
        [roomId],
      );

      const portals = portalsResult.rows.map((portal) => ({
        id: portal.id,
        room_a: portal.room_a,
        room_b: portal.room_b,
        state: portal.state,
      }));

      const staticData = {
        roomId: roomId,
        portals: portals,
        sound: "",
        zoneId: 1,
        level: 0,
        seniority: 0,
        leadership: 0,
        pioneer_points: 0,
        mustEquip: false,
        premium: false,
        lifeLevelType: null,
      };

      return normalize(staticData);
    } catch (error) {
      console.error("Error getting room static data:", error);
      // Fallback to empty portals if file-based data is not available
      try {
        return normalize({ roomId, portals: [] });
      } catch (e2) {
        return normalize({ roomId, portals: [] });
      }
    }
  }

  // Quest system methods
  async getUserQuests(userId) {
    if (!dbClient) {
      return { quests: [] };
    }

    try {
      const result = await dbClient.query(
        `
                SELECT
                    q.id,
                    q.name,
                    q.level,
                    q.premium,
                    q.priority,
                    q.group,
                    q.sub_group,
                    qg.name as group_name,
                    COUNT(pqt.id) as total_tasks,
                    COUNT(CASE WHEN pqt.completed = true THEN 1 END) as completed_tasks
                FROM quests q
                LEFT JOIN quest_groups qg ON q.group = qg.id
                LEFT JOIN player_quest_tasks pqt ON q.id = pqt.quest_id AND pqt.user_id = (SELECT user_id FROM players WHERE id = $1)
                WHERE q.level <= (SELECT level FROM players WHERE id = $1)
                AND (q.premium = false OR (SELECT is_premium FROM players WHERE id = $1) = true)
                GROUP BY q.id, qg.name
                ORDER BY q.priority, q.id
            `,
        [userId],
      );

      const quests = result.rows.map((quest) => {
        return {
          id: quest.id,
          name: quest.name,
          level: quest.level,
          premium: quest.premium,
          priority: quest.priority,
          group: quest.group,
          sub_group: quest.sub_group,
          group_name: quest.group_name,
          total_tasks: parseInt(quest.total_tasks) || 0,
          completed_tasks: parseInt(quest.completed_tasks) || 0,
          is_completed:
            quest.total_tasks > 0 &&
            quest.completed_tasks === quest.total_tasks,
        };
      });

      return { quests: quests };
    } catch (error) {
      console.error("Error getting user quests:", error);
      return { quests: [] };
    }
  }

  async getQuestTasks(userId, questId) {
    if (!dbClient) {
      return { tasks: [] };
    }

    try {
      const result = await dbClient.query(
        `
                SELECT
                    pqt.id,
                    pqt.task_id,
                    pqt.completed,
                    pqt.created_at,
                    pqt.updated_at
                FROM player_quest_tasks pqt
                WHERE pqt.user_id = $1 AND pqt.quest_id = $2
                ORDER BY pqt.task_id
            `,
        [userId, questId],
      );

      return { tasks: result.rows };
    } catch (error) {
      console.error("Error getting quest tasks:", error);
      return { tasks: [] };
    }
  }

  async completeQuestTask(userId, questId, taskId) {
    if (!dbClient) {
      return { success: false, error: "Database not available" };
    }

    try {
      // Start transaction
      await dbClient.query("BEGIN");

      try {
        // Update or insert quest task
        const existingTask = await dbClient.query(
          "SELECT id FROM player_quest_tasks WHERE user_id = $1 AND quest_id = $2 AND task_id = $3",
          [userId, questId, taskId],
        );

        if (existingTask.rows.length > 0) {
          // Update existing task
          await dbClient.query(
            "UPDATE player_quest_tasks SET completed = true, updated_at = NOW() WHERE id = $1",
            [existingTask.rows[0].id],
          );
        } else {
          // Insert new task
          await dbClient.query(
            `
                        INSERT INTO player_quest_tasks (user_id, quest_id, task_id, completed, created_at, updated_at)
                        VALUES ($1, $2, $3, true, NOW(), NOW())
                    `,
            [userId, questId, taskId],
          );
        }

        // Check if quest is now complete and give rewards if needed
        const questProgress = await this.checkQuestCompletion(userId, questId);

        await dbClient.query("COMMIT");

        return {
          success: true,
          questCompleted: questProgress.is_completed,
          rewards: questProgress.rewards,
        };
      } catch (error) {
        await dbClient.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.error("Error completing quest task:", error);
      return { success: false, error: "Server error completing task" };
    }
  }

  async checkQuestCompletion(userId, questId) {
    try {
      const result = await dbClient.query(
        `
                SELECT
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN completed = true THEN 1 END) as completed_tasks
                FROM player_quest_tasks
                WHERE user_id = $1 AND quest_id = $2
            `,
        [userId, questId],
      );

      const totalTasks = parseInt(result.rows[0].total_tasks);
      const completedTasks = parseInt(result.rows[0].completed_tasks);
      const isCompleted = totalTasks > 0 && completedTasks === totalTasks;

      // If quest is completed, calculate rewards (placeholder for now)
      let rewards = null;
      if (isCompleted) {
        rewards = {
          gold: 100, // Example reward
          experience: 50,
          items: [],
        };
      }

      return {
        is_completed: isCompleted,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        rewards: rewards,
      };
    } catch (error) {
      console.error("Error checking quest completion:", error);
      return { is_completed: false, rewards: null };
    }
  }

  // Card system methods
  async getUserCards(userId) {
    if (!dbClient) {
      return { cards: {}, albums: {} };
    }

    try {
      const result = await dbClient.query(
        `
                SELECT card_inventory, card_albums FROM players WHERE id = $1
            `,
        [userId],
      );

      if (result.rows.length === 0) {
        return { cards: {}, albums: {} };
      }

      const cardInventory = result.rows[0].card_inventory
        ? JSON.parse(result.rows[0].card_inventory)
        : {};
      const cardAlbums = result.rows[0].card_albums
        ? JSON.parse(result.rows[0].card_albums)
        : {};

      return { cards: cardInventory, albums: cardAlbums };
    } catch (error) {
      console.error("Error getting user cards:", error);
      return { cards: {}, albums: {} };
    }
  }

  async addCardToInventory(userId, cardId, count = 1) {
    if (!dbClient) {
      return false;
    }

    try {
      const cardData = await this.getUserCards(userId);
      const cards = cardData.cards;

      if (cards[cardId]) {
        cards[cardId] += count;
      } else {
        cards[cardId] = count;
      }

      const cardInventoryJson = JSON.stringify(cards);
      await dbClient.query(
        "UPDATE players SET card_inventory = $1, updated_at = NOW() WHERE id = $2",
        [cardInventoryJson, userId],
      );

      return true;
    } catch (error) {
      console.error("Error adding card to inventory:", error);
      return false;
    }
  }

  // Potion system methods
  async getUserPotions(userId) {
    if (!dbClient) {
      return {};
    }

    try {
      const result = await dbClient.query(
        `
                SELECT potions FROM players WHERE id = $1
            `,
        [userId],
      );

      if (result.rows.length === 0) {
        return {};
      }

      return result.rows[0].potions ? JSON.parse(result.rows[0].potions) : {};
    } catch (error) {
      console.error("Error getting user potions:", error);
      return {};
    }
  }

  async getPotionStore() {
    if (!dbClient) {
      return { potions: [] };
    }

    try {
      const result = await dbClient.query(`
                SELECT
                    p.id,
                    p.price,
                    p.affects_avatar,
                    p.type,
                    p.allow_non_pioneers,
                    ps.potions as store_potions,
                    ps.store_zones
                FROM potions p
                LEFT JOIN potion_stores ps ON ps.id = 1
                ORDER BY p.id
            `);

      return {
        potions: result.rows,
        storeData:
          result.rows.length > 0
            ? {
                store_potions: result.rows[0].store_potions,
                store_zones: result.rows[0].store_zones,
              }
            : {},
      };
    } catch (error) {
      console.error("Error getting potion store:", error);
      return { potions: [] };
    }
  }

  // House system methods
  async getHouseItems(userId = null) {
    if (!dbClient) {
      return { items: [] };
    }

    try {
      let query = `
                SELECT
                    hi.id,
                    hi.type,
                    hi.ordinal,
                    hi.color,
                    hi.price,
                    hi.sell_price,
                    hi.premium,
                    hi.seniority,
                    hi.store_available,
                    hi.electric_units,
                    hit.file_abrv as type_name
                FROM house_items hi
                LEFT JOIN house_item_types hit ON hi.type = hit.id
            `;

      if (userId) {
        // Could filter by user's house level or other criteria
        query += ` WHERE hi.id > 0`;
      }

      query += " ORDER BY hi.type, hi.id";

      const result = await dbClient.query(query);

      return { items: result.rows };
    } catch (error) {
      console.error("Error getting house items:", error);
      return { items: [] };
    }
  }

  async getHouseTypes() {
    if (!dbClient) {
      return { types: [] };
    }

    try {
      const result = await dbClient.query(`
                SELECT
                    ht.id,
                    ht.seniority,
                    ht.premium,
                    ht.price,
                    ht.size_change_price
                FROM house_types ht
                ORDER BY ht.price
            `);

      return { types: result.rows };
    } catch (error) {
      console.error("Error getting house types:", error);
      return { types: [] };
    }
  }

  // Recycling system methods
  async getRecycleItems(userId) {
    if (!dbClient) {
      return {};
    }

    try {
      const result = await dbClient.query(
        `
                SELECT recycle_inventory FROM players WHERE id = $1
            `,
        [userId],
      );

      if (result.rows.length === 0) {
        return {};
      }

      return result.rows[0].recycle_inventory
        ? JSON.parse(result.rows[0].recycle_inventory)
        : {};
    } catch (error) {
      console.error("Error getting recycle items:", error);
      return {};
    }
  }

  async getRecycleBins() {
    if (!dbClient) {
      return { bins: [] };
    }

    try {
      const result = await dbClient.query(`
                SELECT
                    rb.id,
                    rb.name,
                    rb.description,
                    rb.type,
                    rb.ordinal
                FROM recycle_bins rb
                ORDER BY rb.type, rb.id
            `);

      const bins = result.rows.map((bin) => {
        return {
          id: bin.id,
          name: bin.name,
          description: bin.description,
          type: bin.type,
          ordinal: bin.ordinal,
        };
      });

      return { bins: bins };
    } catch (error) {
      console.error("Error getting recycle bins:", error);
      return { bins: [] };
    }
  }

  // Credits store system methods
  async getCreditsStore() {
    if (!dbClient) {
      return { products: [] };
    }

    try {
      const result = await dbClient.query(`
                SELECT
                    csp.id,
                    csp.data,
                    csp.products,
                    csp.includes_subscription
                FROM credits_store_products csp
                ORDER BY csp.id
            `);

      return { products: result.rows };
    } catch (error) {
      console.error("Error getting credits store:", error);
      return { products: [] };
    }
  }

  // Handler implementations for unfinished methods
  handleCreateRoom(socket, roomId, content) {
    if (!socket.sfsUser) return;

    console.log(`User ${socket.sfsUser.name} wants to create room`);

    // Parse create room XML (simplified)
    const newRoomId = this.nextRoomId++;
    const newRoom = new Room(
      newRoomId,
      `Room_${newRoomId}`,
      20,
      5,
      true,
      false,
      false,
      false,
    );
    this.rooms.set(newRoomId, newRoom);

    // Add user to new room
    newRoom.addUser(socket.sfsUser, socket.sfsUser.id);
    socket.sfsUser.playerId = socket.sfsUser.id;
    // Update room user/spectator counts for all clients
    this.sendUserCountUpdate(newRoom);

    // Send join room success
    this.sendJoinRoomOK(socket, newRoom);

    // Broadcast room added to all users
    this.broadcastRoomAdded(newRoom);
  }

  handleSwitchSpectator(socket, roomId) {
    if (!socket.sfsUser) return;

    const room = this.rooms.get(roomId);
    if (!room || !room.getUser(socket.sfsUser.id)) return;

    const wasSpectator = socket.sfsUser.isSpectator;
    // Toggle spectator status
    socket.sfsUser.isSpectator = !socket.sfsUser.isSpectator;

    // Move user between spectators/users collections and update counts
    if (socket.sfsUser.isSpectator && !wasSpectator) {
      // Player -> Spectator
      if (room.users.has(socket.sfsUser.id)) {
        room.users.delete(socket.sfsUser.id);
        room.userCount = Math.max(0, room.userCount - 1);
      }
      room.spectators.set(socket.sfsUser.id, socket.sfsUser);
      room.spectatorCount += 1;
      socket.sfsUser.playerId = -1;
    } else if (!socket.sfsUser.isSpectator && wasSpectator) {
      // Spectator -> Player
      if (room.spectators.has(socket.sfsUser.id)) {
        room.spectators.delete(socket.sfsUser.id);
        room.spectatorCount = Math.max(0, room.spectatorCount - 1);
      }
      room.users.set(socket.sfsUser.id, socket.sfsUser);
      room.userCount += 1;
      // Assign a positive playerId as expected by SFS client
      socket.sfsUser.playerId = socket.sfsUser.id;
    }

    console.log(
      `User ${socket.sfsUser.name} switched spectator mode: ${socket.sfsUser.isSpectator}`,
    );

    // Prepare new player id (0 if spectator, >0 if player)
    const newPid = socket.sfsUser.isSpectator ? 0 : socket.sfsUser.playerId;

    // Notify the switching user (no @u attribute)
    const selfMsg = `<msg t='sys'><body action='swSpec' r='${roomId}'><pid id='${newPid}' /></body></msg>`;
    this.sendToSocket(socket, selfMsg);

    // Notify other users in room (include @u with the switching user's id)
    const othersMsg = `<msg t='sys'><body action='swSpec' r='${roomId}'><pid id='${newPid}' u='${socket.sfsUser.id}' /></body></msg>`;
    room.broadcastToRoom(othersMsg, socket.sfsUser);

    // Update counts for all clients
    this.sendUserCountUpdate(room);
  }

  handleRandomKey(socket) {
    // Generate a 6-digit random key as expected by the client
    const randomKey = Math.floor(Math.random() * 900000) + 100000;
    socket.randomKey = randomKey.toString(); // Store for login validation

    DebugLogger.debug("AUTH", "Generated random key for client", {
      connectionId: socket.connectionId,
      keyLength: socket.randomKey.length,
    });

    // Send in format expected by SysHandler.as handleRandomKey method
    // The ActionScript client expects: param1.params.key
    const message = `<msg t='sys'><body action='rndK' r='0'><k>${randomKey}</k></body></msg>`;

    // Log critical random key XML message
    DebugLogger.xml("system_random_key", "SENDING_RANDOM_KEY_XML", {
      connectionId: socket.connectionId,
      randomKey: randomKey,
      keyLength: randomKey.toString().length,
      message: message,
    });

    this.sendToSocket(socket, message);

    DebugLogger.debug("AUTH", "Random key sent - client can now login", {
      connectionId: socket.connectionId,
    });
  }

  handleRoundTripBench(socket) {
    if (!socket.sfsUser) return;

    const message = `<msg t='sys'><body action='roundTripRes' r='0'></body></msg>`;
    this.sendToSocket(socket, message);
  }

  broadcastRoomAdded(room) {
    const message = `<msg t='sys'><body action='roomAdd' r='0'><rm id='${room.id}' max='${room.maxUsers}' spec='${room.maxSpectators}' temp='${room.isTemp ? 1 : 0}' game='${room.isGame ? 1 : 0}' priv='${room.isPrivate ? 1 : 0}' limbo='${room.isLimbo ? 1 : 0}'><name><![CDATA[${room.name}]]></name></rm></body></msg>`;

    for (let [userId, user] of this.users) {
      user.sendMessage(message);
    }
  }

  // Additional extension handlers
  handleQuizStart(socket, gameId, messageType) {
    if (!socket.sfsUser) return;

    console.log(`Quiz ${gameId} started by ${socket.sfsUser.name}`);

    this.sendExtensionResponse(
      socket,
      {
        quizStarted: true,
        gameId: gameId,
      },
      messageType,
    );
  }

  handleQuizOver(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const gameId = params[PROTOCOL.COMMANDS.V_GAME_ID];
    const score = params[PROTOCOL.COMMANDS.V_GAME_SCORE] || 0;

    console.log(
      `Quiz over for ${socket.sfsUser.name}: game ${gameId}, score ${score}`,
    );

    this.sendExtensionResponse(
      socket,
      {
        quizCompleted: true,
        gameId: gameId,
        score: score,
      },
      messageType,
    );
  }

  handleBuyHouse(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const houseTypeId = params[PROTOCOL.COMMANDS.V_HOUSE_TYPE_ID];

    console.log(`${socket.sfsUser.name} buying house type ${houseTypeId}`);

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_HOUSE_BOUGHT]: "1",
        [PROTOCOL.COMMANDS.V_HOUSE_TYPE_ID]: houseTypeId,
      },
      messageType,
    );
  }

  handleEnterHouseRoom(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const houseUserId = params[PROTOCOL.COMMANDS.V_HOUSE_USER_ID];

    console.log(`${socket.sfsUser.name} entering house of user ${houseUserId}`);

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_HOUSE_ROOM_RESPONSE]: "1",
        houseEntered: true,
      },
      messageType,
    );
  }

  handleInitMultiplayerTask(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const taskId = params[PROTOCOL.COMMANDS.V_TASK_ID];

    console.log(
      `${socket.sfsUser.name} initializing multiplayer task ${taskId}`,
    );

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_MULTIPLAYER_TASK_INIT]: "1",
        [PROTOCOL.COMMANDS.V_TASK_ID]: taskId,
      },
      messageType,
    );
  }

  handleJoinMultiplayerTask(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const taskId = params[PROTOCOL.COMMANDS.V_TASK_ID];
    const taskInstanceId = params[PROTOCOL.COMMANDS.V_TASK_INSTANCE_ID];

    console.log(
      `${socket.sfsUser.name} joining multiplayer task ${taskId}:${taskInstanceId}`,
    );

    this.sendExtensionResponse(
      socket,
      {
        taskJoined: true,
        [PROTOCOL.COMMANDS.V_TASK_ID]: taskId,
        [PROTOCOL.COMMANDS.V_TASK_INSTANCE_ID]: taskInstanceId,
      },
      messageType,
    );
  }

  handleValidateSecurityCode(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const code = params[PROTOCOL.COMMANDS.V_CODE];

    console.log(`Validating security code for ${socket.sfsUser.name}`);

    // Mock validation - always succeed
    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_SECURITY_CODE_VALID]: "1",
      },
      messageType,
    );
  }

  handleGenerateSecurityCode(socket, params, messageType) {
    if (!socket.sfsUser) return;

    const newCode = Math.floor(Math.random() * 900000) + 100000; // 6-digit code

    console.log(
      `Generated security code for ${socket.sfsUser.name}: ${newCode}`,
    );

    this.sendExtensionResponse(
      socket,
      {
        [PROTOCOL.COMMANDS.S_NEW_SECURITY_CODE]: "1",
        [PROTOCOL.COMMANDS.V_CODE]: newCode.toString(),
      },
      messageType,
    );
  }

  sendTradeRequest(requester, target) {
    const message = `<msg t='sys'><body action='tradeReq' r='0'><user id='${requester.id}' n='${requester.name}' /></body></msg>`;
    target.sendMessage(message);
  }

  // Performance monitoring methods
  startPerformanceMonitoring() {
    DebugLogger.info("SERVER", "Starting performance monitoring");

    // Log server stats every 30 seconds
    setInterval(() => {
      const uptime = Date.now() - this.stats.startTime;
      const uptimeFormatted = this.formatUptime(uptime);

      const memoryUsage = process.memoryUsage();
      const memoryFormatted = {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      };

      DebugLogger.perf("Server Statistics", {
        uptime: uptimeFormatted,
        connections: {
          total: this.stats.totalConnections,
          current: this.stats.currentConnections,
        },
        users: {
          total: this.users.size,
          rooms: this.rooms.size,
        },
        activity: {
          totalMessages: this.stats.totalMessages,
          extensionsProcessed: this.stats.extensionsProcessed,
          dbQueries: this.stats.dbQueries,
          errors: this.stats.errors,
        },
        memory: memoryFormatted,
        database: {
          connected: this.stats.dbConnected || false,
        },
      });
    }, DEBUG_CONFIG.PERF_MONITORING_INTERVAL || 60000);

    // Log detailed user info every 5 minutes (only if performance logging is enabled)
    if (DEBUG_CONFIG.LOG_PERFORMANCE) {
      setInterval(() => {
        if (this.users.size > 0) {
          const usersInfo = Array.from(this.users.values()).map((user) => ({
            id: user.id,
            name: user.name,
            currentRoom: user.currentRoom ? user.currentRoom.id : null,
            isModerator: user.isModerator,
            isPremium: user.getVariable(PROTOCOL.USERVARIABLES.IS_PREMIUM),
          }));

          DebugLogger.info("USERS", `Active users summary`, {
            totalUsers: this.users.size,
            users: usersInfo,
          });
        }

        if (this.rooms.size > 0) {
          const roomsInfo = Array.from(this.rooms.values())
            .filter((room) => room.userCount > 0)
            .map((room) => ({
              id: room.id,
              name: room.name,
              userCount: room.userCount,
              maxUsers: room.maxUsers,
              isGame: room.isGame,
              isPremium: room.isPrivate,
            }));

          if (roomsInfo.length > 0) {
            DebugLogger.room("Active rooms summary", {
              totalActiveRooms: roomsInfo.length,
              rooms: roomsInfo,
            });
          }
        }
      }, 300000);
    }
  }

  formatUptime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Start the server
DebugLogger.info(
  "MAIN",
  "Starting SmartFoxServer Pro 1.6.6 Node.js implementation",
);
const server = new SmartFoxServer();

// Handle graceful shutdown
process.on("SIGTERM", () => {
  DebugLogger.info("MAIN", "SIGTERM received, shutting down gracefully");

  // Log final statistics
  const uptime = Date.now() - server.stats.startTime;
  const uptimeFormatted = server.formatUptime(uptime);

  DebugLogger.info("SHUTDOWN", "Final server statistics", {
    uptime: uptimeFormatted,
    totalConnections: server.stats.totalConnections,
    totalMessages: server.stats.totalMessages,
    extensionsProcessed: server.stats.extensionsProcessed,
    dbQueries: server.stats.dbQueries,
    errors: server.stats.errors,
    activeUsers: server.users.size,
    activeRooms: server.rooms.size,
  });

  if (dbClient) {
    DebugLogger.info("DB", "Closing database connection");
    dbClient.end();
  }

  DebugLogger.info("MAIN", "Server shutdown complete");
  process.exit(0);
});

process.on("SIGINT", () => {
  DebugLogger.info("MAIN", "SIGINT received, shutting down gracefully");

  // Log final statistics
  const uptime = Date.now() - server.stats.startTime;
  const uptimeFormatted = server.formatUptime(uptime);

  DebugLogger.info("SHUTDOWN", "Final server statistics", {
    uptime: uptimeFormatted,
    totalConnections: server.stats.totalConnections,
    totalMessages: server.stats.totalMessages,
    extensionsProcessed: server.stats.extensionsProcessed,
    dbQueries: server.stats.dbQueries,
    errors: server.stats.errors,
    activeUsers: server.users.size,
    activeRooms: server.rooms.size,
  });

  if (dbClient) {
    DebugLogger.info("DB", "Closing database connection");
    dbClient.end();
  }

  DebugLogger.info("MAIN", "Server shutdown complete");
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  DebugLogger.error("MAIN", "Uncaught Exception", {
    error: error.message,
    stack: error.stack,
  });

  // Log final statistics before crash
  if (server && server.stats) {
    const uptime = Date.now() - server.stats.startTime;
    DebugLogger.error("CRASH", "Server crashed - final statistics", {
      uptime: server.formatUptime(uptime),
      totalConnections: server.stats.totalConnections,
      errors: server.stats.errors,
      activeUsers: server.users.size,
    });
  }

  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  DebugLogger.error("MAIN", "Unhandled Promise Rejection", {
    reason: reason,
    promise: promise,
  });
});

DebugLogger.info(
  "MAIN",
  "🚀 SmartFoxServer Pro 1.6.6 Node.js implementation is running!",
);
DebugLogger.info("MAIN", "📡 Socket server ready for Flash clients");
DebugLogger.info("MAIN", "🌐 HTTP server ready for polling connections");
DebugLogger.info(
  "MAIN",
  "🔧 Debug logging enabled with comprehensive monitoring",
);
DebugLogger.info("MAIN", "⏹️  Use Ctrl+C to stop the server");
