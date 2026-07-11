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
      speech_models: ["universal-3-5-pro", "universal-2"] // Flagship model and fallback
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

    // Poll every 1500ms
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const result = await pollAssemblyAiStatus(apiKey, transcriptId);
          
          if (result.status === "completed") {
            clearInterval(interval);
            resolve({ text: result.text, id: transcriptId });
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

/**
 * Runs a task on LLM Gateway to analyze the transcript (extract symptoms, complaints, etc.)
 * Replaces the sunset LeMUR API.
 */
export async function queryLeMurTask(apiKey, transcriptId, prompt) {
  if (!apiKey) throw new Error("AssemblyAI API key is missing");
  if (!transcriptId) throw new Error("Transcript ID is missing");

  // 1. Get the transcription text first by calling status endpoint
  const transcript = await pollAssemblyAiStatus(apiKey, transcriptId);
  const transcriptText = transcript.text || "";

  if (!transcriptText) {
    throw new Error("لا يوجد نص للتفريغ لتحليله");
  }

  // 2. Call the LLM Gateway
  const response = await fetchWithCorsProxy("https://llm-gateway.assemblyai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "system",
          content: "You are an AI medical assistant for a clinic. Analyze the provided doctor-patient audio transcription and answer the user prompt concisely and professionally."
        },
        {
          role: "user",
          content: `Here is the transcribed text of the consultation:\n"${transcriptText}"\n\nTask: ${prompt}`
        }
      ],
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || errorData.error || "فشل تحليل المحادثة بالذكاء الاصطناعي عبر بوابة LLM");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "فشل تحليل المحادثة";
}


