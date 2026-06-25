/**
 * Service to interact with the AssemblyAI Speech-to-Text API
 */
import { fetchWithCorsProxy } from './telegramService';


/**
 * Starts a transcription job on AssemblyAI for a given audio URL
 */
export async function startAssemblyAiTranscription(apiKey, audioUrl) {
  if (!apiKey) throw new Error("AssemblyAI API key is missing");
  if (!audioUrl) throw new Error("Audio URL is missing");

  const response = await fetchWithCorsProxy("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      "authorization": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: "ar", // Arabic language support
      speech_model: "best" // Use best model for accuracy
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "فشل بدء تفريغ الصوت عبر AssemblyAI");
  }

  return await response.json(); // Returns { id, status, ... }
}

/**
 * Polls the status of an AssemblyAI transcription job
 */
export async function pollAssemblyAiStatus(apiKey, transcriptId) {
  if (!apiKey) throw new Error("AssemblyAI API key is missing");
  if (!transcriptId) throw new Error("Transcript ID is missing");

  const response = await fetchWithCorsProxy(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
    method: "GET",
    headers: {
      "authorization": apiKey
    }
  });

  if (!response.ok) {
    throw new Error("فشل التحقق من حالة تفريغ الصوت");
  }

  const data = await response.json();
  return data; // Returns { id, status, text, error, ... }
}

/**
 * Helper to fully transcribe an audio URL by starting the job and polling until completion
 */
export async function transcribeWithAssemblyAi(apiKey, audioUrl, onProgress) {
  try {
    if (onProgress) onProgress("starting");
    const job = await startAssemblyAiTranscription(apiKey, audioUrl);
    const transcriptId = job.id;

    if (onProgress) onProgress("processing");

    // Poll every 1.5 seconds
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const result = await pollAssemblyAiStatus(apiKey, transcriptId);
          
          if (result.status === "completed") {
            clearInterval(interval);
            resolve(result.text);
          } else if (result.status === "failed") {
            clearInterval(interval);
            reject(new Error(result.error || "فشل تفريغ الصوت"));
          }
        } catch (err) {
          clearInterval(interval);
          reject(err);
        }
      }, 1500);
    });
  } catch (error) {
    console.error("AssemblyAI transcription error:", error);
    throw error;
  }
}
