/**
 * Service to interact with the Telegram Bot API as a database backend
 */

export const DEFAULT_DB_SCHEMA = {
  meta: {
    version: 1,
    last_updated: new Date().toISOString(),
    updated_by: "النظام",
    app_version: "1.0.0"
  },
  settings: {
    telegram_bot_token: "8682482176:AAHfiLU5o4yi0LV7f7aNiUIpn7MtvaZWgM0",
    telegram_chat_id: "-1004343582278",
    supabase_url: "https://nfcobdkkvicsbzusyxtm.supabase.co",
    supabase_anon_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mY29iZGtrdmljc2J6dXN5eHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMzQ3NDAsImV4cCI6MjA5NzkxMDc0MH0.UTR5dNQQUq4c5o3Gvn5hDL-BAfcfFQu3Fm63x2zNJLU",
    voice_api_provider: "browser",
    voice_api_key: "",
    clinic_pin: "1234"
  },
  days: [],
  patients: [],
  visits: []
};

/**
 * Helper to build Telegram API base URL
 */
const getBotUrl = (token) => `https://api.telegram.org/bot${token}`;

/**
 * Helper to wrap URLs with a CORS proxy in browser mode to bypass Telegram's lack of CORS headers.
 * Uses multiple proxy options with automatic fallback.
 */
const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

const needsCorsProxy = () => {
  if (typeof window === 'undefined') return false;
  // Capacitor/native apps don't need CORS proxy
  if (window.Capacitor) return false;
  return true;
};

/**
 * Fetches a URL with automatic CORS proxy fallback
 */
export async function fetchWithCorsProxy(url, options = {}) {
  if (!needsCorsProxy()) {
    return fetch(url, options);
  }

  // For POST requests with FormData, we can't easily proxy them.
  // Use the direct URL first, then fallback to proxies for GET only.
  const isGet = !options.method || options.method === 'GET';
  const isJson = options.headers?.['Content-Type'] === 'application/json';
  
  // For simple GET requests, try proxies
  if (isGet) {
    for (let i = 0; i < CORS_PROXIES.length; i++) {
      try {
        const proxiedUrl = CORS_PROXIES[i](url);
        const res = await fetch(proxiedUrl, { ...options, signal: AbortSignal.timeout(15000) });
        if (res.ok || res.status < 500) return res;
      } catch (e) {
        console.warn(`CORS proxy ${i} failed for GET:`, e.message);
      }
    }
    // Final fallback: try direct
    return fetch(url, options);
  }

  // For POST with JSON body, try proxies
  if (isJson) {
    for (let i = 0; i < CORS_PROXIES.length; i++) {
      try {
        const proxiedUrl = CORS_PROXIES[i](url);
        const res = await fetch(proxiedUrl, { ...options, signal: AbortSignal.timeout(15000) });
        if (res.ok || res.status < 500) return res;
      } catch (e) {
        console.warn(`CORS proxy ${i} failed for POST JSON:`, e.message);
      }
    }
    return fetch(url, options);
  }

  // For POST with FormData (file upload), try direct first, then each proxy
  try {
    const directRes = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    if (directRes.ok || directRes.status < 500) return directRes;
  } catch (e) {
    console.warn('Direct POST failed, trying proxies:', e.message);
  }
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    try {
      const proxiedUrl = CORS_PROXIES[i](url);
      const res = await fetch(proxiedUrl, { ...options, signal: AbortSignal.timeout(20000) });
      if (res.ok || res.status < 500) return res;
    } catch (e) {
      console.warn(`CORS proxy ${i} failed for FormData POST:`, e.message);
    }
  }
  throw new Error('فشل الاتصال بالتليجرام عبر جميع الوسطاء. تأكد من الاتصال بالإنترنت.');
}

// Legacy wrapper for compatibility
const getFinalUrl = (url) => {
  return needsCorsProxy() ? CORS_PROXIES[0](url) : url;
};

/**
 * Fetches the latest pinned JSON database from the Telegram channel
 */
export async function fetchMasterDb(token, chatId) {
  if (!token || !chatId) {
    throw new Error("MISSING_CREDENTIALS");
  }

  try {
    // 1. Get chat details to find the pinned message
    const chatRes = await fetchWithCorsProxy(`${getBotUrl(token)}/getChat?chat_id=${chatId}`);
    const chatData = await chatRes.json();

    if (!chatData.ok) {
      throw new Error(chatData.description || "فشل الاتصال بقناة التليجرام");
    }

    const pinnedMessage = chatData.result.pinned_message;
    if (!pinnedMessage) {
      console.log("No pinned message found in channel. Initializing default database.");
      return { db: DEFAULT_DB_SCHEMA, pinnedMessageId: null };
    }

    // 2. Check if the pinned message contains a document
    const document = pinnedMessage.document;
    if (!document || !document.file_name.endsWith(".json")) {
      console.log("Pinned message is not a JSON document. Initializing default database.");
      return { db: DEFAULT_DB_SCHEMA, pinnedMessageId: pinnedMessage.message_id };
    }

    // 3. Get the file path
    const fileRes = await fetchWithCorsProxy(`${getBotUrl(token)}/getFile?file_id=${document.file_id}`);
    const fileData = await fileRes.json();

    if (!fileData.ok) {
      throw new Error("فشل الحصول على مسار الملف من التليجرام");
    }

    const filePath = fileData.result.file_path;

    // 4. Download the file content (Bypassing CORS in browser)
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const downloadRes = await fetchWithCorsProxy(downloadUrl);
    if (!downloadRes.ok) {
      throw new Error("فشل تحميل ملف قاعدة البيانات من خادم التليجرام");
    }

    const dbJson = await downloadRes.json();
    return { db: dbJson, pinnedMessageId: pinnedMessage.message_id };
  } catch (error) {
    console.error("Error fetching master DB from Telegram:", error);
    throw error;
  }
}

/**
 * Uploads the updated database JSON to Telegram, pins it, and unpins the old one
 */
export async function uploadMasterDb(token, chatId, jsonData, oldPinnedMessageId = null) {
  if (!token || !chatId) {
    throw new Error("MISSING_CREDENTIALS");
  }

  try {
    // Increment version and set updated timestamp
    const updatedDb = {
      ...jsonData,
      meta: {
        ...jsonData.meta,
        version: (jsonData.meta?.version || 0) + 1,
        last_updated: new Date().toISOString()
      }
    };

    // 1. Create file blob
    const blob = new Blob([JSON.stringify(updatedDb, null, 2)], { type: "application/json" });
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("document", blob, "clinic_db.json");
    formData.append("caption", `تحديث قاعدة البيانات - نسخة رقم #${updatedDb.meta.version}\nبتاريخ: ${new Date().toLocaleString('ar-EG')}`);

    // 2. Upload document (Bypassing CORS in browser)
    const uploadRes = await fetchWithCorsProxy(`${getBotUrl(token)}/sendDocument`, {
      method: "POST",
      body: formData
    });
    const uploadData = await uploadRes.json();

    if (!uploadData.ok) {
      throw new Error(uploadData.description || "فشل رفع الملف للتليجرام");
    }

    const newMessageId = uploadData.result.message_id;

    // 3. Pin the new message (Bypassing CORS in browser)
    const pinRes = await fetchWithCorsProxy(`${getBotUrl(token)}/pinChatMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: newMessageId,
        disable_notification: true
      })
    });
    const pinData = await pinRes.json();

    if (!pinData.ok) {
      console.warn("Failed to pin new message on Telegram:", pinData.description);
    }

    // 4. Unpin the old message if provided (Bypassing CORS in browser)
    if (oldPinnedMessageId) {
      await fetchWithCorsProxy(`${getBotUrl(token)}/unpinChatMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: oldPinnedMessageId
        })
      }).catch(err => console.warn("Failed to unpin old message:", err));
    }

    return { db: updatedDb, pinnedMessageId: newMessageId };
  } catch (error) {
    console.error("Error uploading master DB to Telegram:", error);
    throw error;
  }
}

/**
 * Sends a human-readable audit log message to the Telegram channel
 */
export async function sendAuditLog(token, chatId, messageText) {
  if (!token || !chatId) return;

  try {
    // Bypassing CORS in browser
    await fetchWithCorsProxy(`${getBotUrl(token)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `📝 <b>سجل العيادة:</b>\n${messageText}`,
        parse_mode: "HTML"
      })
    });
  } catch (error) {
    console.error("Failed to send Telegram audit log:", error);
  }
}
