import localforage from 'localforage';
import { sendAuditLog, DEFAULT_DB_SCHEMA } from './telegramService';
import { 
  initSupabase, 
  initializeBuckets, 
  fetchMasterDbFromSupabase, 
  uploadMasterDbToSupabase,
  fetchMasterDbMetadataFromSupabase
} from './supabaseService';

// Configure localforage
localforage.config({
  name: 'BassmaClinicDB',
  storeName: 'clinic_store'
});

let localDb = { ...DEFAULT_DB_SCHEMA };
let isDirty = false;
let syncStatusListener = null;
let conflictListener = null;
let lastSyncedFileId = null;
let lastSyncedFileUpdatedAt = null;
let isSyncInProgress = false;

// Initialize connection checking
let onlineStatus = navigator.onLine;

window.addEventListener('online', () => {
  onlineStatus = true;
  triggerSyncStatusChange();
});

window.addEventListener('offline', () => {
  onlineStatus = false;
  triggerSyncStatusChange();
});

function triggerSyncStatusChange() {
  if (syncStatusListener) {
    syncStatusListener({
      online: onlineStatus,
      dirty: isDirty,
      version: localDb.meta?.version || 1
    });
  }
}

/**
 * Subscribes to sync status updates (online/offline/dirty changes)
 */
export function subscribeToSyncStatus(listener) {
  syncStatusListener = listener;
  triggerSyncStatusChange();
  return () => {
    syncStatusListener = null;
  };
}

/**
 * Subscribes to conflict notifications
 */
export function subscribeToConflict(listener) {
  conflictListener = listener;
  return () => {
    conflictListener = null;
  };
}

/**
 * Gets the current active database instance
 */
export function getDb() {
  return localDb;
}

/**
 * Saves database state locally and flags it as dirty if requested
 */
export async function saveDbLocally(newDb, setDirty = true) {
  localDb = newDb;
  if (setDirty) {
    isDirty = true;
  }
  await localforage.setItem('clinic_db', localDb);
  await localforage.setItem('is_dirty', isDirty);
  triggerSyncStatusChange();
}

/**
 * Check if app has valid credentials configured
 */
export function hasCredentials() {
  // We need both Telegram (for logs) and Supabase (for core database and storage)
  return !!(
    localDb.settings?.telegram_bot_token &&
    localDb.settings?.telegram_chat_id &&
    localDb.settings?.supabase_url &&
    localDb.settings?.supabase_anon_key
  );
}

/**
 * Initialize sync manager: load local cache, boot Supabase, and attempt initial sync
 */
export async function initSyncManager() {
  try {
    const cachedDb = await localforage.getItem('clinic_db');
    const cachedDirty = await localforage.getItem('is_dirty');
    
    lastSyncedFileId = await localforage.getItem('last_synced_file_id');
    lastSyncedFileUpdatedAt = await localforage.getItem('last_synced_file_updated_at');

    if (cachedDb) {
      localDb = cachedDb;
    } else {
      localDb = { ...DEFAULT_DB_SCHEMA };
    }

    // Force/lock credentials to ensure they are always used
    localDb.settings = {
      ...(localDb.settings || {}),
      telegram_bot_token: DEFAULT_DB_SCHEMA.settings.telegram_bot_token,
      telegram_chat_id: DEFAULT_DB_SCHEMA.settings.telegram_chat_id,
      supabase_url: DEFAULT_DB_SCHEMA.settings.supabase_url,
      supabase_anon_key: DEFAULT_DB_SCHEMA.settings.supabase_anon_key,
    };

    isDirty = cachedDirty === true;

    // Initialize Supabase if credentials exist
    if (localDb.settings?.supabase_url && localDb.settings?.supabase_anon_key) {
      initSupabase(localDb.settings.supabase_url, localDb.settings.supabase_anon_key);
    }

    triggerSyncStatusChange();

    // Run initial sync if online and has credentials
    if (onlineStatus && hasCredentials()) {
      await syncWithTelegram().catch(err => console.error("Initial sync failed:", err));
    }
  } catch (error) {
    console.error("Failed to initialize sync manager:", error);
  }
}

/**
 * Automatically merges local database and server database using Last-Write-Wins (LWW) resolution
 */
function mergeDatabases(local, server) {
  const merged = {
    ...server,
    meta: {
      ...server.meta,
      version: Math.max(local.meta?.version || 0, server.meta?.version || 0)
    },
    settings: {
      ...server.settings,
      ...local.settings // Always preserve local settings
    }
  };

  // Helper to merge lists by unique ID, keeping the one with the latest update timestamp
  const mergeArrayById = (localArr, serverArr) => {
    const map = new Map();
    
    // Add all server items
    (serverArr || []).forEach(item => {
      if (item && item.id) {
        map.set(item.id, item);
      }
    });

    // Merge local items: override if local is newer
    (localArr || []).forEach(item => {
      if (item && item.id) {
        const existing = map.get(item.id);
        if (!existing) {
          map.set(item.id, item);
        } else {
          // Compare dates
          const localTime = new Date(item.updated_at || item.created_at || 0).getTime();
          const serverTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
          if (localTime > serverTime) {
            map.set(item.id, item);
          }
        }
      }
    });

    return Array.from(map.values());
  };

  merged.patients = mergeArrayById(local.patients, server.patients);
  merged.visits = mergeArrayById(local.visits, server.visits);
  
  // Merge days array (keyed by date)
  const daysMap = new Map();
  (server.days || []).forEach(d => { if (d && d.date) daysMap.set(d.date, d); });
  (local.days || []).forEach(d => {
    if (d && d.date) {
      const existing = daysMap.get(d.date);
      if (!existing) {
        daysMap.set(d.date, d);
      } else {
        const localTime = new Date(d.updated_at || 0).getTime();
        const serverTime = new Date(existing.updated_at || 0).getTime();
        if (localTime > serverTime) {
          daysMap.set(d.date, d);
        }
      }
    }
  });
  merged.days = Array.from(daysMap.values());

  return merged;
}

/**
 * Synchronizes local database with Supabase Storage (bypasses all browser CORS blocks!)
 */
export async function syncWithTelegram() {
  if (isSyncInProgress) {
    console.log("Sync already in progress, skipping concurrent run.");
    return { status: 'in_progress' };
  }

  if (!onlineStatus) {
    return { status: 'offline' };
  }

  if (!hasCredentials()) {
    return { status: 'no_credentials' };
  }

  try {
    isSyncInProgress = true;
    // 1. Fetch current server file metadata first to see if it actually changed
    let serverMeta = null;
    try {
      serverMeta = await fetchMasterDbMetadataFromSupabase();
    } catch (err) {
      console.warn("Failed to check DB metadata, falling back to full check:", err.message);
    }

    if (serverMeta && !isDirty) {
      // If we are not dirty and the server metadata matches our last synced version, skip downloading
      if (lastSyncedFileId === serverMeta.id || lastSyncedFileUpdatedAt === serverMeta.updated_at) {
        return { status: 'up_to_date' };
      }
    }

    // 2. Fetch current server database from Supabase Storage
    let serverDb = await fetchMasterDbFromSupabase();
    if (!serverDb) {
      // If server file doesn't exist yet, mock server version as 0
      serverDb = { 
        ...localDb, 
        meta: { ...(localDb.meta || {}), version: 0 } 
      };
    }

    // --- CHECK FOR GLOBAL DATA CLEAR SIGNAL ---
    if (serverDb && serverDb.meta?.last_cleared) {
      const serverClearedTime = new Date(serverDb.meta.last_cleared).getTime();
      const localClearedTime = localDb.meta?.last_cleared ? new Date(localDb.meta.last_cleared).getTime() : 0;
      
      if (serverClearedTime > localClearedTime) {
        console.log("Global reset detected. Clearing local patient records...");
        const localSettings = localDb.settings || {};
        localDb = {
          ...serverDb,
          patients: [],
          visits: [],
          days: [],
          settings: {
            ...serverDb.settings,
            ...localSettings
          },
          meta: {
            ...(serverDb.meta || {}),
            last_cleared: serverDb.meta.last_cleared,
            version: Math.max(localDb.meta?.version || 0, serverDb.meta?.version || 0)
          }
        };
        isDirty = false;
        
        if (serverMeta) {
          lastSyncedFileId = serverMeta.id;
          lastSyncedFileUpdatedAt = serverMeta.updated_at;
        }
        
        await localforage.setItem('clinic_db', localDb);
        await localforage.setItem('is_dirty', isDirty);
        await localforage.setItem('last_synced_file_id', lastSyncedFileId);
        await localforage.setItem('last_synced_file_updated_at', lastSyncedFileUpdatedAt);
        
        triggerSyncStatusChange();
        return { status: 'synced_pulled', db: localDb };
      }
    }

    const localVer = localDb.meta?.version || 1;
    const serverVer = serverDb.meta?.version || 1;

    // If local database is completely empty, we can safely pull server changes without conflict
    const isLocalEmpty = (!localDb.patients || localDb.patients.length === 0) && 
                         (!localDb.visits || localDb.visits.length === 0);

    if (serverVer > localVer) {
      // Server version is newer
      if (isDirty && !isLocalEmpty) {
        // Automatic LWW Merge instead of throwing conflict errors!
        console.log(`Version mismatch: server version ${serverVer} > local version ${localVer}. Merging databases...`);
        const mergedDb = mergeDatabases(localDb, serverDb);
        
        localDb = mergedDb;
        
        console.log("Auto-uploading merged database...");
        const uploadedDb = await uploadMasterDbToSupabase(localDb);
        localDb = uploadedDb;
        isDirty = false;

        const newMeta = await fetchMasterDbMetadataFromSupabase();
        if (newMeta) {
          lastSyncedFileId = newMeta.id;
          lastSyncedFileUpdatedAt = newMeta.updated_at;
        }

        await localforage.setItem('clinic_db', localDb);
        await localforage.setItem('is_dirty', isDirty);
        await localforage.setItem('last_synced_file_id', lastSyncedFileId);
        await localforage.setItem('last_synced_file_updated_at', lastSyncedFileUpdatedAt);

        triggerSyncStatusChange();
        return { status: 'synced_pushed', db: localDb };
      } else {
        // Safe to pull server changes
        console.log(`Pulling newer database version from Supabase (${serverVer})`);
        
        // Preserve local settings so credentials/tokens are never lost
        const localSettings = localDb.settings || {};
        localDb = {
          ...serverDb,
          settings: {
            ...serverDb.settings,
            ...localSettings
          }
        };
        
        isDirty = false;
        if (serverMeta) {
          lastSyncedFileId = serverMeta.id;
          lastSyncedFileUpdatedAt = serverMeta.updated_at;
        }
        await localforage.setItem('clinic_db', localDb);
        await localforage.setItem('is_dirty', isDirty);
        await localforage.setItem('last_synced_file_id', lastSyncedFileId);
        await localforage.setItem('last_synced_file_updated_at', lastSyncedFileUpdatedAt);

        triggerSyncStatusChange();
        return { status: 'synced_pulled', db: localDb };
      }
    } else if (serverVer === localVer && serverMeta && lastSyncedFileUpdatedAt !== serverMeta.updated_at) {
      // Versions are equal but file metadata has changed, indicating another device updated the server file.
      if (isDirty && !isLocalEmpty) {
        console.log(`Metadata changed with equal versions (${serverVer}). Merging databases...`);
        const mergedDb = mergeDatabases(localDb, serverDb);
        // Ensure version is incremented to trigger other devices to pull
        mergedDb.meta.version = serverVer + 1;
        
        localDb = mergedDb;
        const uploadedDb = await uploadMasterDbToSupabase(localDb);
        localDb = uploadedDb;
        isDirty = false;

        const newMeta = await fetchMasterDbMetadataFromSupabase();
        if (newMeta) {
          lastSyncedFileId = newMeta.id;
          lastSyncedFileUpdatedAt = newMeta.updated_at;
        }

        await localforage.setItem('clinic_db', localDb);
        await localforage.setItem('is_dirty', isDirty);
        await localforage.setItem('last_synced_file_id', lastSyncedFileId);
        await localforage.setItem('last_synced_file_updated_at', lastSyncedFileUpdatedAt);

        triggerSyncStatusChange();
        return { status: 'synced_pushed', db: localDb };
      } else {
        console.log(`Metadata changed with equal versions (${serverVer}). Pulling server changes...`);
        const localSettings = localDb.settings || {};
        localDb = {
          ...serverDb,
          settings: {
            ...serverDb.settings,
            ...localSettings
          }
        };
        isDirty = false;
        
        lastSyncedFileId = serverMeta.id;
        lastSyncedFileUpdatedAt = serverMeta.updated_at;
        
        await localforage.setItem('clinic_db', localDb);
        await localforage.setItem('is_dirty', isDirty);
        await localforage.setItem('last_synced_file_id', lastSyncedFileId);
        await localforage.setItem('last_synced_file_updated_at', lastSyncedFileUpdatedAt);

        triggerSyncStatusChange();
        return { status: 'synced_pulled', db: localDb };
      }
    } else if (isDirty) {
      // Server is same or older, and we have local edits. Push our changes.
      console.log(`Pushing local edits to Supabase. Local version: ${localVer}`);
      const uploadedDb = await uploadMasterDbToSupabase(localDb);

      localDb = uploadedDb;
      isDirty = false;

      const newMeta = await fetchMasterDbMetadataFromSupabase();
      if (newMeta) {
        lastSyncedFileId = newMeta.id;
        lastSyncedFileUpdatedAt = newMeta.updated_at;
      }

      await localforage.setItem('clinic_db', localDb);
      await localforage.setItem('is_dirty', isDirty);
      await localforage.setItem('last_synced_file_id', lastSyncedFileId);
      await localforage.setItem('last_synced_file_updated_at', lastSyncedFileUpdatedAt);

      triggerSyncStatusChange();
      return { status: 'synced_pushed', db: localDb };
    } else {
      // Versions match and not dirty. No changes needed.
      if (serverMeta) {
        lastSyncedFileId = serverMeta.id;
        lastSyncedFileUpdatedAt = serverMeta.updated_at;
        await localforage.setItem('last_synced_file_id', lastSyncedFileId);
        await localforage.setItem('last_synced_file_updated_at', lastSyncedFileUpdatedAt);
      }
      return { status: 'up_to_date' };
    }
  } catch (error) {
    console.error("Sync error:", error);
    throw error;
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Resolves a version conflict manually (kept as fallback compatibility)
 * choice: 'use_local' (forces push) or 'use_server' (discards local edits)
 */
export async function resolveConflict(choice, serverDb = null) {
  if (!hasCredentials()) return;
  
  const token = localDb.settings.telegram_bot_token;
  const chatId = localDb.settings.telegram_chat_id;

  try {
    if (choice === 'use_local') {
      let actualServerDb = serverDb || await fetchMasterDbFromSupabase();
      if (!actualServerDb) {
        actualServerDb = { meta: { version: 0 } };
      }
      
      const forcedDb = {
        ...localDb,
        meta: {
          ...localDb.meta,
          version: (actualServerDb.meta?.version || 0)
        }
      };

      console.log("Forcing local changes onto Supabase. Version base:", forcedDb.meta.version);
      
      const uploadedDb = await uploadMasterDbToSupabase(forcedDb);

      localDb = uploadedDb;
      isDirty = false;

      const newMeta = await fetchMasterDbMetadataFromSupabase();
      if (newMeta) {
        lastSyncedFileId = newMeta.id;
        lastSyncedFileUpdatedAt = newMeta.updated_at;
      }

      await localforage.setItem('clinic_db', localDb);
      await localforage.setItem('is_dirty', isDirty);
      await localforage.setItem('last_synced_file_id', lastSyncedFileId);
      await localforage.setItem('last_synced_file_updated_at', lastSyncedFileUpdatedAt);
      
      await sendAuditLog(token, chatId, `⚠️ <b>تنبيه تعارض:</b> تم فرض التعديلات المحلية وتخطي التعارض بواسطة المسؤول.`);

      triggerSyncStatusChange();
      return { status: 'resolved_local_pushed' };
    } else if (choice === 'use_server') {
      let actualServerDb = serverDb || await fetchMasterDbFromSupabase();
      if (!actualServerDb) {
        actualServerDb = { ...DEFAULT_DB_SCHEMA };
      }
      
      const localSettings = localDb.settings || {};
      localDb = {
        ...actualServerDb,
        settings: {
          ...actualServerDb.settings,
          ...localSettings
        }
      };
      
      isDirty = false;

      const newMeta = await fetchMasterDbMetadataFromSupabase();
      if (newMeta) {
        lastSyncedFileId = newMeta.id;
        lastSyncedFileUpdatedAt = newMeta.updated_at;
      }

      await localforage.setItem('clinic_db', localDb);
      await localforage.setItem('is_dirty', isDirty);
      await localforage.setItem('last_synced_file_id', lastSyncedFileId);
      await localforage.setItem('last_synced_file_updated_at', lastSyncedFileUpdatedAt);

      triggerSyncStatusChange();
      return { status: 'resolved_server_pulled' };
    }
  } catch (error) {
    console.error("Failed to resolve conflict:", error);
    throw error;
  }
}
