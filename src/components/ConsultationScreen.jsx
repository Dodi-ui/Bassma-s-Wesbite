import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, Mic, Camera, Trash2, Check, RefreshCw, X, Loader2, User, Phone, MapPin, DollarSign, Calendar, Sparkles } from 'lucide-react';
import { VoiceRecorderService } from '../services/voiceRecorder';
import { uploadFile, getSignedUrl } from '../services/supabaseService';
import { transcribeWithAssemblyAi, queryLeMurTask } from '../services/assemblyAiService';

const recorderService = new VoiceRecorderService();

export default function ConsultationScreen({ db, visitId, onUpdateDb, currentUser, onNavigate }) {
  const [visit, setVisit] = useState(null);
  const [patient, setPatient] = useState(null);

  // Clinical States (Only complaint text and follow-up date)
  const [complaintText, setComplaintText] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  // Dual Transcription States
  const [googleTranscription, setGoogleTranscription] = useState('');
  const [assemblyAiTranscription, setAssemblyAiTranscription] = useState('');
  const [isAssemblyAiLoading, setIsAssemblyAiLoading] = useState(false);
  const [assemblyAiError, setAssemblyAiError] = useState('');

  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioExt, setAudioExt] = useState('webm');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [hasRecordedVoice, setHasRecordedVoice] = useState(false);
  const [tempTranscribedText, setTempTranscribedText] = useState('');

  // Photo States
  const [photos, setPhotos] = useState([]); // Array of { file, previewUrl }
  const fileInputRef = useRef(null);

  // Saving States
  const [isSaving, setIsSaving] = useState(false);

  // Load visit and patient
  useEffect(() => {
    if (!visitId || !db) return;
    const foundVisit = db.visits?.find(v => v.id === visitId);
    if (foundVisit) {
      setVisit(foundVisit);
      const foundPatient = db.patients?.find(p => p.id === foundVisit.patient_id);
      if (foundPatient) {
        setPatient(foundPatient);
      }
      
      setComplaintText(foundVisit.complaint_text || '');
      setGoogleTranscription(foundVisit.complaint_text || '');
      setFollowUpDate(foundVisit.follow_up_date || '');
    }
  }, [visitId, db]);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    };
  }, [photos]);

  if (!visit || !patient) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-clinic-bg">
        <p className="text-gray-500 font-bold mb-4">زيارة الانتظار غير موجودة.</p>
        <button onClick={() => onNavigate('home')} className="py-2 px-6 bg-clinic-teal text-white rounded-xl font-bold">
          العودة للرئيسية
        </button>
      </div>
    );
  }

  // Voice recording handlers
  const handleStartRecording = async () => {
    setTempTranscribedText('');
    setGoogleTranscription('');
    setAssemblyAiTranscription('');
    setAssemblyAiError('');
    setAudioBlob(null);
    setIsRecording(true);
    setVolumeLevel(0);

    await recorderService.start({
      onSpeechResult: (text) => {
        setTempTranscribedText(text);
        setGoogleTranscription(text);
      },
      onVolumeChange: (vol) => {
        setVolumeLevel(vol);
      },
      onError: (err) => {
        console.error("Recording error:", err);
        setIsRecording(false);
        alert("فشل تشغيل الميكروفون. تأكد من إعطاء الصلاحيات.");
      }
    });
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    setIsProcessingVoice(true);
    
    const result = await recorderService.stop();
    setIsProcessingVoice(false);

    if (result) {
      setAudioBlob(result.blob);
      setAudioExt(result.extension);
      setHasRecordedVoice(true);

      // If speech recognition got text, set it
      if (tempTranscribedText) {
        setGoogleTranscription(tempTranscribedText);
        setComplaintText(tempTranscribedText); // Default to Google first
      }

      // Check if AssemblyAI key is configured to run AI symptom analysis using text
      const assemblyKey = db.settings?.voice_api_key;

      if (assemblyKey && tempTranscribedText && tempTranscribedText.trim().length > 10) {
        setIsAssemblyAiLoading(true);
        setAssemblyAiError('');
        
        try {
          // Use LLM Gateway directly with the browser-transcribed text
          // This completely bypasses the CORS-blocked audio upload to AssemblyAI
          const transcriptText = tempTranscribedText;
          const prompt = "This is a transcribed doctor-patient medical consultation in Arabic. Identify what the patient is complaining about and aching from. Summarize it clearly, concisely, and professionally in simple Egyptian Arabic (العامية المصرية) in one paragraph. Write the clinical complaints and symptoms directly, without introducing yourself or writing any introductory/meta remarks.";

          const llmResponse = await fetch("https://llm-gateway.assemblyai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "authorization": assemblyKey,
              "content-type": "application/json"
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              messages: [
                {
                  role: "system",
                  content: "You are an AI medical assistant for a clinic. Analyze the provided doctor-patient consultation transcription and answer the user prompt concisely and professionally."
                },
                {
                  role: "user",
                  content: `Here is the transcribed Arabic consultation:\n"${transcriptText}"\n\nTask: ${prompt}`
                }
              ],
              max_tokens: 500
            })
          });

          if (!llmResponse.ok) {
            const errData = await llmResponse.json().catch(() => ({}));
            throw new Error(errData.error?.message || "فشل الاتصال بخدمة LLM Gateway");
          }

          const llmData = await llmResponse.json();
          const aiSummary = llmData.choices?.[0]?.message?.content || "";
          
          if (aiSummary) {
            setAssemblyAiTranscription(aiSummary);
            setComplaintText(aiSummary); // Auto-fill the complaint text with AI analysis!
          }
        } catch (err) {
          console.error("LLM Gateway symptom analysis failed:", err);
          setAssemblyAiError("فشل تحليل الذكاء الاصطناعي. تم الاعتماد على تفريغ المتصفح.");
        } finally {
          setIsAssemblyAiLoading(false);
        }
      } else if (assemblyKey && (!tempTranscribedText || tempTranscribedText.trim().length <= 10)) {
        // Browser transcription was empty — cannot run AI analysis
        setAssemblyAiError("لم يُكتشف نص كافٍ من الميكروفون لتشغيل تحليل الذكاء الاصطناعي.");
      }
    }
  };

  const handleResetVoice = () => {
    setAudioBlob(null);
    setHasRecordedVoice(false);
    setTempTranscribedText('');
    setGoogleTranscription('');
    setAssemblyAiTranscription('');
    setAssemblyAiError('');
  };

  // Photo handlers
  const triggerCamera = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handlePhotoCapture = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newPhotos = files.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file)
    }));

    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const handleDeletePhoto = (indexToDelete) => {
    const photoToDelete = photos[indexToDelete];
    if (photoToDelete) {
      URL.revokeObjectURL(photoToDelete.previewUrl);
    }
    setPhotos(prev => prev.filter((_, idx) => idx !== indexToDelete));
  };

  // Save consultation details and complete visit
  const handleSaveConsultation = async () => {
    setIsSaving(true);

    try {
      let uploadedAudioUrl = "";
      let uploadedPhotoUrl = "";

      // 1. Upload audio memo if present and supabase is configured
      if (audioBlob && db.settings?.supabase_url) {
        const audioPath = `${patient.id}/${visit.id}_complaint.${audioExt}`;
        try {
          await uploadFile('voice-memos', audioPath, audioBlob);
          uploadedAudioUrl = audioPath;
        } catch (uploadErr) {
          console.error("Audio upload failed:", uploadErr);
          alert("حدث خطأ أثناء رفع التسجيل الصوتي لسحابة Supabase. تم حفظ البيانات النصية فقط.");
        }
      }

      // 2. Upload photos if present and supabase is configured
      if (photos.length > 0 && db.settings?.supabase_url) {
        const photoPaths = [];
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          // Compress image to save storage space and bypass 1GB free tier limits
          let fileToUpload = photo.file;
          try {
            fileToUpload = await compressImage(photo.file);
          } catch (compressErr) {
            console.warn("Failed to compress image, using original:", compressErr);
          }
          
          const fileExt = fileToUpload.name.split('.').pop() || 'jpg';
          const photoPath = `${patient.id}/${visit.id}_prescription_${i}.${fileExt}`;
          try {
            await uploadFile('prescriptions', photoPath, fileToUpload);
            photoPaths.push(photoPath);
          } catch (uploadErr) {
            console.error("Photo upload failed:", uploadErr);
          }
        }
        if (photoPaths.length > 0) {
          uploadedPhotoUrl = photoPaths[0]; // Save primary
        }
      }

      // 3. Update the visit record (mark status as completed)
      const updatedVisits = db.visits.map(v => {
        if (v.id === visit.id) {
          return {
            ...v,
            status: 'completed', // Completed and out of queue!
            complaint_text: complaintText.trim(),
            complaint_audio_url: uploadedAudioUrl || v.complaint_audio_url,
            diagnosis: '', 
            medications: '', 
            lung_readings: '', 
            follow_up_date: followUpDate || null,
            prescription_image_url: uploadedPhotoUrl || v.prescription_image_url,
            updated_at: new Date().toISOString()
          };
        }
        return v;
      });

      const updatedDb = {
        ...db,
        visits: updatedVisits
      };

      await onUpdateDb(updatedDb, `🩺 الطبيبة بسمة أتمت الكشف الطبي للمريض: ${patient.full_name}`);
      
      setIsSaving(false);
      onNavigate('home');
    } catch (err) {
      console.error("Failed to complete consultation:", err);
      alert("حدث خطأ أثناء حفظ الكشف: " + err.message);
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-24 bg-clinic-bg select-none">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-clinic-border px-4 py-4 z-10 flex items-center gap-3">
        <button
          onClick={() => onNavigate('home')}
          className="p-2 hover:bg-gray-100 rounded-full active:scale-95 transition-all text-clinic-teal"
        >
          <ArrowRight size={24} />
        </button>
        <h1 className="text-xl font-bold text-clinic-teal font-cairo">غرفة الكشف الطبي</h1>
      </div>

      <div className="p-4 flex flex-col gap-6 text-right">
        
        {/* Patient Registration Summary (Read Only for Doctor) */}
        <div className="bg-clinic-teal/5 border border-clinic-teal/20 rounded-2xl p-4 shadow-sm flex flex-col gap-3 transition-all duration-200 hover:shadow-md">
          <h3 className="text-sm font-extrabold text-clinic-teal flex items-center gap-1.5 border-b border-clinic-teal/10 pb-1.5">
            <User size={16} />
            <span>بيانات المريض من الاستقبال</span>
          </h3>

          <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-sm text-clinic-text">
            <div>
              <span className="text-xs text-gray-400 block">اسم المريض</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-bold">{patient.full_name}</span>
                {visit.visit_type === 'followup' ? (
                  <span className="text-[10px] font-extrabold bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5 rounded-full">
                    استشارة
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">
                    كشف
                  </span>
                )}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-400 block">السن والبلد</span>
              <span className="font-semibold">{patient.age} سنة · {patient.village}</span>
            </div>
            {patient.phone && (
              <div>
                <span className="text-xs text-gray-400 block">رقم الهاتف</span>
                <span className="font-mono">{patient.phone}</span>
              </div>
            )}
            <div>
              <span className="text-xs text-gray-400 block">المبلغ المدفوع</span>
              <span className="font-bold text-clinic-teal">{visit.amount_paid} ج.م</span>
            </div>
          </div>
        </div>

        {/* Voice Complaint Section (With Dual Transcription & Pulse Animation) */}
        <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col gap-4 transition-all duration-200 hover:shadow-md">
          <h2 className="text-sm font-bold text-gray-500 border-b border-gray-100 pb-2">🎙️ تسجيل شكوى المريض صوتياً</h2>
          
          {(!db.settings?.voice_api_key || !db.settings?.supabase_url) && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3.5 text-xs text-yellow-800 text-right leading-relaxed">
              ⚠️ <strong>تنبيه للمساعد / الطبيب:</strong> لم يتم إدخال مفتاح الذكاء الاصطناعي (AssemblyAI API Key) أو إعدادات السحابة في صفحة الإعدادات. لن يعمل تفريغ الصوت وتلخيص الشكوى بالذكاء الاصطناعي تلقائياً حتى يتم إدخالهما.
            </div>
          )}
          
          <div className="flex flex-col items-center justify-center py-5 bg-gray-50 rounded-xl border border-dashed border-gray-200 transition-all duration-300">
            {isRecording ? (
              <div className="flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="w-20 h-20 bg-clinic-coral text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all animate-pulse-recording"
                >
                  <Check size={36} />
                </button>
                <span className="text-sm text-clinic-coral font-bold animate-pulse">جاري تسجيل صوت المريض وتفريغه...</span>
                
                {/* Volume visualizer */}
                <div className="flex gap-1 items-end h-8">
                  {[...Array(8)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-clinic-coral rounded-full transition-all duration-100"
                      style={{ height: `${Math.max(4, (volumeLevel / 255) * 32 * (i % 2 === 0 ? 0.8 : 1.2))}px` }}
                    />
                  ))}
                </div>
              </div>
            ) : isProcessingVoice ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="animate-spin text-clinic-teal" size={32} />
                <span className="text-sm text-gray-500 font-medium">جاري معالجة الصوت...</span>
              </div>
            ) : hasRecordedVoice ? (
              <div className="w-full px-4 flex flex-col gap-4 text-center">
                <p className="text-sm text-emerald-800 font-bold">🎙️ تم تسجيل الشكوى بنجاح!</p>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleResetVoice}
                    className="py-2.5 px-4 bg-clinic-coral text-white rounded-xl font-bold flex items-center gap-1.5 text-sm active:scale-95 transition-all shadow-sm"
                  >
                    <RefreshCw size={16} />
                    <span>إعادة التسجيل</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartRecording}
                className="w-20 h-20 bg-clinic-teal text-white rounded-full flex items-center justify-center shadow hover:bg-[#095b5e] active:scale-95 transition-all hover:shadow-lg"
              >
                <Mic size={36} />
              </button>
            )}

            {!isRecording && !hasRecordedVoice && !isProcessingVoice && (
              <span className="text-xs text-gray-400 mt-2">اضغط للبدء بتسجيل شكوى المريض مباشرة</span>
            )}
          </div>

          {/* DUAL TRANSCRIPTION INTERFACE */}
          {(googleTranscription || isAssemblyAiLoading || assemblyAiTranscription || assemblyAiError) && (
            <div className="flex flex-col gap-3 mt-2 border-t border-gray-50 pt-4">
              <h3 className="text-xs font-bold text-gray-400">اختر التفريغ الأكثر دقة لشكوى المريض:</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Method 1: Google Web-Speech (Browser Native) */}
                {googleTranscription && (
                  <div className={`border rounded-xl p-3 flex flex-col justify-between gap-3 transition-all ${
                    complaintText === googleTranscription 
                      ? 'border-clinic-teal bg-clinic-teal/5 shadow-sm' 
                      : 'border-clinic-border bg-white'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between border-b border-gray-100 pb-1.5 mb-2">
                        <span className="text-xs font-extrabold text-clinic-teal">🌐 تفريغ جوجل المدمج (فوري)</span>
                        {complaintText === googleTranscription && (
                          <span className="text-[10px] bg-clinic-teal text-white px-2 py-0.5 rounded-md font-bold">معتمد حالياً</span>
                        )}
                      </div>
                      <p className="text-sm text-clinic-text font-medium leading-relaxed">{googleTranscription}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setComplaintText(googleTranscription)}
                      className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${
                        complaintText === googleTranscription
                          ? 'bg-clinic-teal text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-clinic-text'
                      }`}
                    >
                      اعتماد هذا التفريغ
                    </button>
                  </div>
                )}

                {/* Method 2: AssemblyAI Speech Engine */}
                {(isAssemblyAiLoading || assemblyAiTranscription || assemblyAiError) && (
                  <div className={`border rounded-xl p-3 flex flex-col justify-between gap-3 transition-all ${
                    complaintText === assemblyAiTranscription 
                      ? 'border-clinic-teal bg-clinic-teal/5 shadow-sm' 
                      : 'border-clinic-border bg-white'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between border-b border-gray-100 pb-1.5 mb-2">
                        <span className="text-xs font-extrabold text-indigo-700 flex items-center gap-1">
                          <Sparkles size={14} className="text-indigo-500 animate-pulse" />
                          <span>تفريغ الذكاء الاصطناعي (AssemblyAI)</span>
                        </span>
                        {complaintText === assemblyAiTranscription && assemblyAiTranscription && (
                          <span className="text-[10px] bg-clinic-teal text-white px-2 py-0.5 rounded-md font-bold">معتمد حالياً</span>
                        )}
                      </div>

                      {isAssemblyAiLoading && (
                        <div className="flex items-center gap-2 py-4 text-xs text-gray-400 font-bold justify-center">
                          <Loader2 className="animate-spin text-indigo-500" size={16} />
                          <span>جاري التحليل واستخلاص اللهجة الصعيدية...</span>
                        </div>
                      )}

                      {assemblyAiError && (
                        <p className="text-xs text-clinic-coral font-semibold py-2">{assemblyAiError}</p>
                      )}

                      {assemblyAiTranscription && (
                        <p className="text-sm text-clinic-text font-medium leading-relaxed">{assemblyAiTranscription}</p>
                      )}
                    </div>

                    {assemblyAiTranscription && (
                      <button
                        type="button"
                        onClick={() => setComplaintText(assemblyAiTranscription)}
                        className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${
                          complaintText === assemblyAiTranscription
                            ? 'bg-clinic-teal text-white'
                            : 'bg-gray-100 hover:bg-gray-200 text-clinic-text'
                        }`}
                      >
                        اعتماد هذا التفريغ
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Editable Final Textbox */}
              <div className="mt-2">
                <label className="block text-xs font-bold text-gray-500 mb-1">الشكوى المعتمدة والنهائية (يمكنك التعديل عليها يدوياً):</label>
                <textarea
                  rows={3}
                  placeholder="اكتب شكوى المريض أو قم بتعديل التفريغ المعتمد هنا..."
                  value={complaintText}
                  onChange={(e) => setComplaintText(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-clinic-border focus:border-clinic-teal focus:outline-none text-sm font-semibold leading-relaxed resize-none transition-all duration-200"
                />
              </div>
            </div>
          )}
        </div>

        {/* Prescription Camera Section */}
        <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col gap-4 transition-all duration-200 hover:shadow-md">
          <h2 className="text-sm font-bold text-gray-500 border-b border-gray-100 pb-2">📷 تصوير الروشتات الصادرة أو التحاليل</h2>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={handlePhotoCapture}
            className="hidden"
            multiple
          />

          <button
            type="button"
            onClick={triggerCamera}
            className="w-full py-4 bg-white border-2 border-dashed border-clinic-teal text-clinic-teal hover:bg-clinic-teal/5 active:scale-98 transition-all rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow"
          >
            <Camera size={20} />
            <span>تصوير الروشتة (فتح الكاميرا الخلفية)</span>
          </button>

          {photos.length > 0 && (
            <div className="flex gap-3 overflow-x-auto py-2">
              {photos.map((photo, idx) => (
                <div key={idx} className="relative flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-clinic-border shadow-sm active:scale-95 transition-all">
                  <img src={photo.previewUrl} alt={`روشتة ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(idx)}
                    className="absolute top-1 right-1 p-1 bg-clinic-coral text-white rounded-full shadow hover:bg-red-600 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Optional Follow-up Date Section */}
        <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col gap-3 transition-all duration-200 hover:shadow-md">
          <h2 className="text-sm font-bold text-gray-500 border-b border-gray-100 pb-2 flex items-center gap-1.5">
            <Calendar size={16} className="text-clinic-teal" />
            <span>موعد المتابعة القادمة (استشارة - اختياري)</span>
          </h2>
          <div>
            <label className="block text-xs font-bold text-clinic-text mb-1">تحديد تاريخ الاستشارة القادمة</label>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-clinic-border focus:border-clinic-teal focus:outline-none text-base text-right font-semibold"
            />
          </div>
        </div>

      </div>

      {/* Sticky footer action to save and close */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-clinic-border p-4 z-10 shadow-lg max-w-xl mx-auto">
        <button
          onClick={handleSaveConsultation}
          disabled={isSaving}
          className="w-full py-4 bg-clinic-teal text-white font-bold rounded-xl shadow-md active:scale-95 transition-all text-center flex items-center justify-center gap-2 cursor-pointer disabled:bg-gray-300 disabled:shadow-none"
        >
          {isSaving ? <Loader2 className="animate-spin" size={20} /> : null}
          <span>حفظ وإنهاء الكشف الطبي 💾</span>
        </button>
      </div>
    </div>
  );
}

// Helper to compress image client-side to save storage space (target: max 1200px and 70% jpeg quality)
function compressImage(file, maxDimension = 1200, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(compressedFile);
        }, 'image/jpeg', quality);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

