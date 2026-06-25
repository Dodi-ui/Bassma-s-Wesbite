import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;

/**
 * Initializes the Supabase client
 */
export function initSupabase(url, anonKey) {
  if (!url || !anonKey) {
    supabaseClient = null;
    return null;
  }
  
  // Clean the URL: strip leading slash, trailing slashes, and /rest/v1
  let cleanedUrl = url.trim();
  if (cleanedUrl.startsWith('/')) {
    cleanedUrl = cleanedUrl.slice(1).trim();
  }
  if (cleanedUrl.endsWith('/')) {
    cleanedUrl = cleanedUrl.slice(0, -1);
  }
  if (cleanedUrl.endsWith('/rest/v1')) {
    cleanedUrl = cleanedUrl.slice(0, -8);
  }
  if (cleanedUrl.endsWith('/')) {
    cleanedUrl = cleanedUrl.slice(0, -1);
  }
  
  supabaseClient = createClient(cleanedUrl, anonKey);
  return supabaseClient;
}

/**
 * Gets the current Supabase client instance
 */
export function getSupabase() {
  return supabaseClient;
}

/**
 * Initializes and creates the required storage buckets if they do not exist.
 * The buckets are: 'prescriptions', 'voice-memos', and 'reports'.
 */
export async function initializeBuckets() {
  if (!supabaseClient) {
    throw new Error("Supabase client is not initialized. Please configure settings.");
  }

  const buckets = ['prescriptions', 'voice-memos', 'reports'];
  const results = [];

  for (const bucketName of buckets) {
    try {
      // Fetch buckets to see if it exists
      const { data: existingBuckets, error: listError } = await supabaseClient.storage.listBuckets();
      if (listError) throw listError;

      const exists = existingBuckets?.some(b => b.id === bucketName);

      if (!exists) {
        // Create bucket as private
        const { data, error } = await supabaseClient.storage.createBucket(bucketName, {
          public: false,
          fileSizeLimit: 10485760 // 10MB limit
        });
        if (error) throw error;
        results.push({ bucket: bucketName, status: 'created', data });
      } else {
        results.push({ bucket: bucketName, status: 'exists' });
      }
    } catch (err) {
      console.warn(`Error initializing bucket "${bucketName}":`, err.message);
      results.push({ bucket: bucketName, status: 'error', message: err.message });
    }
  }

  return results;
}

/**
 * Uploads a file (blob/file object) to a specific bucket
 */
export async function uploadFile(bucketName, filePath, fileBody) {
  if (!supabaseClient) {
    throw new Error("Supabase client is not initialized.");
  }

  const { data, error } = await supabaseClient.storage
    .from(bucketName)
    .upload(filePath, fileBody, {
      cacheControl: '3600',
      upsert: true
    });

  if (error) {
    throw error;
  }

  return data; // Returns { path, id, fullPath }
}

/**
 * Generates a signed URL for a file in a private bucket with a 1-hour expiry
 */
export async function getSignedUrl(bucketName, filePath) {
  if (!supabaseClient) {
    throw new Error("Supabase client is not initialized.");
  }

  if (!filePath) return "";

  // If the filePath is already a full http/https URL that is not a supabase url, just return it
  if (filePath.startsWith('http') && !filePath.includes('supabase.co')) {
    return filePath;
  }

  // Extract relative path if a full URL was stored by accident
  let relativePath = filePath;
  if (filePath.includes('/storage/v1/object/sign/')) {
    // If it's already a signed URL, it has a signature. But we want to re-sign it to refresh
    try {
      const url = new URL(filePath);
      const pathParts = url.pathname.split(`/storage/v1/object/sign/${bucketName}/`);
      if (pathParts.length > 1) {
        relativePath = decodeURIComponent(pathParts[1]);
      }
    } catch (e) {
      console.error("Failed to parse relative path from URL", e);
    }
  } else if (filePath.includes(`/storage/v1/object/private/${bucketName}/`)) {
    const parts = filePath.split(`/storage/v1/object/private/${bucketName}/`);
    if (parts.length > 1) {
      relativePath = decodeURIComponent(parts[1]);
    }
  }

  try {
    const { data, error } = await supabaseClient.storage
      .from(bucketName)
      .createSignedUrl(relativePath, 3600); // 1 hour expiry

    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error(`Error generating signed URL for ${bucketName}/${relativePath}:`, error);
    // If signing fails, return the original path or empty
    return "";
  }
}

/**
 * Downloads the master database JSON file from the private 'reports' bucket in Supabase.
 * Returns null if the file does not exist (indicating a fresh initialization is needed).
 */
export async function fetchMasterDbFromSupabase() {
  if (!supabaseClient) {
    throw new Error("Supabase client is not initialized.");
  }

  try {
    const { data, error } = await supabaseClient.storage
      .from('reports')
      .download('clinic_db.json');

    if (error) {
      if (error.message?.includes('Bucket not found') || error.message?.includes('bucket_not_found')) {
        throw new Error("المجلد السحابي غير موجود (Bucket not found). يرجى فتح لوحة تحكم Supabase وإنشاء مجلد تخزين (Bucket) باسم 'reports' ومجلد باسم 'prescriptions' ومجلد باسم 'voice-memos' للبدء.");
      }
      if (error.message?.includes('violates row-level security policy') || error.message?.includes('Row-level security policy') || error.message?.includes('policy violation')) {
        throw new Error("فشلت المزامنة بسبب سياسات الحماية (RLS Policy) في Supabase. يرجى فتح لوحة تحكم Supabase وإضافة سياسة (Policy) للمجلدات تسمح بالرفع والتحميل (SELECT, INSERT, UPDATE, DELETE) لجميع المستخدمين.");
      }
      // Handle file not found (404 / Object not found) gracefully for first-time boot
      if (error.message?.includes('Object not found') || error.status === 404 || error.error === 'Object not found') {
        console.log("Database file clinic_db.json not found in Supabase. Initializing default.");
        return null;
      }
      throw error;
    }

    const text = await data.text();
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to download database from Supabase:", error);
    throw error;
  }
}

/**
 * Uploads the updated database JSON file to the private 'reports' bucket in Supabase.
 * Automatically increments the database version and sets the update timestamp.
 */
export async function uploadMasterDbToSupabase(jsonData) {
  if (!supabaseClient) {
    throw new Error("Supabase client is not initialized.");
  }

  const updatedDb = {
    ...jsonData,
    meta: {
      ...jsonData.meta,
      version: (jsonData.meta?.version || 0) + 1,
      last_updated: new Date().toISOString()
    }
  };

  const blob = new Blob([JSON.stringify(updatedDb, null, 2)], { type: "application/json" });
  
  const { data, error } = await supabaseClient.storage
    .from('reports')
    .upload('clinic_db.json', blob, {
      cacheControl: '0', // Bypass cache so other devices pull the absolute latest state
      upsert: true
    });

  if (error) {
    if (error.message?.includes('Bucket not found') || error.message?.includes('bucket_not_found')) {
      throw new Error("المجلد السحابي غير موجود (Bucket not found). يرجى فتح لوحة تحكم Supabase وإنشاء مجلد تخزين (Bucket) باسم 'reports' ومجلد باسم 'prescriptions' ومجلد باسم 'voice-memos' للبدء.");
    }
    if (error.message?.includes('violates row-level security policy') || error.message?.includes('Row-level security policy') || error.message?.includes('policy violation')) {
      throw new Error("فشلت المزامنة بسبب سياسات الحماية (RLS Policy) في Supabase. يرجى فتح لوحة تحكم Supabase وإضافة سياسة (Policy) للمجلدات تسمح بالرفع والتحميل (SELECT, INSERT, UPDATE, DELETE) لجميع المستخدمين.");
    }
    throw error;
  }

  return updatedDb;
}

/**
 * Fetches the metadata of the master database JSON file from Supabase.
 * Useful for fast polling to check if the database file has changed on the server.
 */
export async function fetchMasterDbMetadataFromSupabase() {
  if (!supabaseClient) {
    return null;
  }

  try {
    const { data, error } = await supabaseClient.storage
      .from('reports')
      .list('', { limit: 1, search: 'clinic_db.json' });

    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error("Failed to fetch database file metadata from Supabase:", error);
    return null;
  }
}

