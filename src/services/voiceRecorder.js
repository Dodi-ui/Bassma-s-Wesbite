/**
 * Voice Recorder and Speech-to-Text Integration
 * Uses MediaRecorder for file capture and webkitSpeechRecognition for free Arabic (ar-EG) transcription.
 */

export class VoiceRecorderService {
  constructor() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = SpeechRecognition ? new SpeechRecognition() : null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    
    if (this.recognition) {
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = 'ar-EG'; // Egyptian Arabic dialect (handles Saidi very well)
    }
  }

  isSpeechSupported() {
    return !!this.recognition;
  }

  isRecordingSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Starts recording audio and transcribing speech simultaneously
   */
  async start({ onSpeechResult, onVolumeChange, onError }) {
    this.audioChunks = [];
    let transcribedText = "";

    try {
      // 1. Request microphone permissions
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 2. Set up MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // 3. Set up SpeechRecognition if supported
      if (this.recognition) {
        this.recognition.onresult = (event) => {
          let currentText = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              currentText += event.results[i][0].transcript + " ";
            }
          }
          if (currentText) {
            transcribedText += currentText;
            onSpeechResult(transcribedText.trim());
          }
        };

        this.recognition.onerror = (event) => {
          console.warn("Speech recognition error:", event.error);
          // Don't fail the whole recording if speech recognition fails
        };

        this.recognition.start();
      }

      // 4. Set up volume visualizer (waveform helpers)
      if (onVolumeChange) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(this.stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        this.volumeInterval = setInterval(() => {
          analyser.getByteFrequencyData(dataArray);
          // Calculate average volume
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          onVolumeChange(average); // Value between 0 and 255
        }, 100);
      }

      // 5. Start MediaRecorder
      this.mediaRecorder.start();

    } catch (err) {
      console.error("Failed to start voice recording:", err);
      if (onError) onError(err);
    }
  }

  /**
   * Stops recording and returns the raw audio blob
   */
  stop() {
    return new Promise((resolve) => {
      // Clear volume visualizer interval
      if (this.volumeInterval) {
        clearInterval(this.volumeInterval);
        this.volumeInterval = null;
      }

      // Stop speech recognition
      if (this.recognition) {
        this.recognition.stop();
      }

      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.onstop = () => {
          // Create OGG/Opus blob (or WebM if OGG not supported by browser)
          const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          
          // Stop all audio tracks to release the microphone hardware
          if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
          }

          resolve({
            blob: audioBlob,
            extension: mimeType.includes('ogg') ? 'ogg' : 'webm'
          });
        };
        this.mediaRecorder.stop();
      } else {
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }
        resolve(null);
      }
    });
  }
}
