// ── companion-state.js (frontend module) ──────────────────────────────────────
//
// Frontend companion state event reporting
// Reports user events (goodnight, work_start, etc.) to backend

console.log("[companion-state] module loaded");

const COMPANION_STATE_ENDPOINT = window.getConfigValue?.("COMPANION_STATE_ENDPOINT") || "";

/**
 * Report user event to companion state engine
 * @param {string} eventType - "user_message" | "goodnight" | "work_start" | "meeting_start" | "back"
 * @param {object} metadata - Additional event metadata
 */
export async function reportUserEvent(eventType, metadata = {}) {
  if (!COMPANION_STATE_ENDPOINT) {
    console.log("[companion-state] endpoint not configured, skipping event report");
    return;
  }

  if (!window.currentUserId) {
    console.log("[companion-state] no user ID, skipping event report");
    return;
  }

  const event = {
    type: eventType,
    timestamp: new Date().toISOString(),
    metadata,
  };

  try {
    const response = await fetch(`${COMPANION_STATE_ENDPOINT}/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: window.currentUserId,
        event,
      }),
    });

    if (!response.ok) {
      console.warn("[companion-state] event report failed:", response.status);
    } else {
      console.log("[companion-state] event reported:", eventType);
    }
  } catch (err) {
    console.error("[companion-state] event report error:", err);
  }
}

/**
 * Detect goodnight keywords in user message
 * @param {string} message - User message text
 * @returns {boolean}
 */
export function detectGoodnight(message) {
  const goodnightPattern = /晚安|睡了|睡觉|要睡|去睡|困了|先睡|睡啦/i;
  return goodnightPattern.test(message);
}

/**
 * Detect work/meeting keywords in user message
 * @param {string} message - User message text
 * @returns {"work_start" | "meeting_start" | null}
 */
export function detectWorkStatus(message) {
  const workPattern = /上班了|去上班|开始工作|去工作|上工了/i;
  const meetingPattern = /开会了|去开会|会议开始|进会议/i;

  if (meetingPattern.test(message)) return "meeting_start";
  if (workPattern.test(message)) return "work_start";
  return null;
}

/**
 * Auto-report events based on user message content
 * Call this after sending a user message
 * @param {string} messageText - User message content
 */
export async function autoReportFromMessage(messageText) {
  if (detectGoodnight(messageText)) {
    await reportUserEvent("goodnight", { message_preview: messageText.slice(0, 50) });
  }

  const workStatus = detectWorkStatus(messageText);
  if (workStatus) {
    await reportUserEvent(workStatus, { message_preview: messageText.slice(0, 50) });
  }
}

// Expose to window for integration
window.SPCompanionState = {
  reportUserEvent,
  detectGoodnight,
  detectWorkStatus,
  autoReportFromMessage,
};

console.log("[companion-state] functions exposed to window.SPCompanionState");
