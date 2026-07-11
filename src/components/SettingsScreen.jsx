import React, { useState } from 'react';
import { Settings, Shield, RefreshCw, LogOut, Key, Check, Loader2, Info, Trash2, Smartphone, Download } from 'lucide-react';
import { initializeBuckets, initSupabase } from '../services/supabaseService';
import { syncWithTelegram } from '../services/syncManager';

export default function SettingsScreen({ db, onUpdateDb, onLogout, onDbRefresh }) {
  // Credentials States
  const [botToken, setBotToken] = useState(db.settings?.telegram_bot_token || '');
  const [chatId, setChatId] = useState(db.settings?.telegram_chat_id || '');
  const [supabaseUrl, setSupabaseUrl] = useState(db.settings?.supabase_url || '');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(db.settings?.supabase_anon_key || '');
  const [speechProvider, setSpeechProvider] = useState(db.settings?.voice_api_provider || 'browser');
  const [voiceApiKey, setVoiceApiKey] = useState(db.settings?.voice_api_key || '');

  // PIN Change States
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Status indicators
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  // Handle Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsSuccess('');

    try {
      // Sanitize Chat ID (remove trailing hyphens, ensure starts with single hyphen)
      let cleanChatId = chatId.trim();
      cleanChatId = cleanChatId.replace(/[-]+$/, '');
      if (!cleanChatId.startsWith('-')) {
        cleanChatId = '-' + cleanChatId;
      }

      // Sanitize Supabase URL (strip leading slash if present)
      let cleanSupabaseUrl = supabaseUrl.trim();
      if (cleanSupabaseUrl.startsWith('/')) {
        cleanSupabaseUrl = cleanSupabaseUrl.slice(1).trim();
      }

      // Update state fields to display the sanitized results in the form inputs
      setChatId(cleanChatId);
      setSupabaseUrl(cleanSupabaseUrl);

      const updatedSettings = {
        ...db.settings,
        telegram_bot_token: botToken.trim(),
        telegram_chat_id: cleanChatId,
        supabase_url: cleanSupabaseUrl,
        supabase_anon_key: supabaseAnonKey.trim(),
        voice_api_provider: speechProvider,
        voice_api_key: voiceApiKey.trim()
      };

      const updatedDb = {
        ...db,
        settings: updatedSettings
      };

      // 1. Save locally & attempt upload
      await onUpdateDb(updatedDb, `⚙️ تم تحديث إعدادات النظام وقنوات الاتصال بواسطة المسؤول.`);
      
      // 2. Initialize Supabase locally with new credentials
      if (cleanSupabaseUrl && supabaseAnonKey.trim()) {
        initSupabase(cleanSupabaseUrl, supabaseAnonKey.trim());
        // Try creating/checking buckets
        const bucketResults = await initializeBuckets();
        console.log("Bucket initialization results:", bucketResults);
      }

      setIsSavingSettings(false);
      setSettingsSuccess('تم حفظ الإعدادات بنجاح وتفعيل قنوات الاتصال! 🎉');
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("حدث خطأ أثناء حفظ الإعدادات: " + err.message);
      setIsSavingSettings(false);
    }
  };

  // Handle Change PIN
  const handleChangePin = async (e) => {
    e.preventDefault();
    setPinSuccess('');

    const expectedCurrentPin = db.settings?.clinic_pin || '1234';

    if (currentPinInput !== expectedCurrentPin) {
      return alert("الرمز السري الحالي غير صحيح.");
    }
    if (newPin.length < 4 || newPin.length > 6) {
      return alert("الرمز السري الجديد يجب أن يكون بين 4 إلى 6 أرقام.");
    }
    if (newPin !== confirmPin) {
      return alert("الرمزان الجديدان غير متطابقين.");
    }

    try {
      const updatedSettings = {
        ...db.settings,
        clinic_pin: newPin
      };

      const updatedDb = {
        ...db,
        settings: updatedSettings
      };

      await onUpdateDb(updatedDb, `🔑 تم تغيير الرمز السري الخاص بالعيادة.`);
      setPinSuccess('تم تغيير الرمز السري بنجاح! 🔒');
      setCurrentPinInput('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      console.error("Failed to update PIN:", err);
      alert("فشل تغيير الرمز السري: " + err.message);
    }
  };

  // Force Manual Sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const res = await syncWithTelegram();
      setIsSyncing(false);
      
      if (res.status === 'offline') {
        alert("أنت خارج الشبكة حالياً. يرجى الاتصال بالإنترنت للمزامنة.");
      } else if (res.status === 'no_credentials') {
        alert("يرجى إدخال إعدادات التليجرام أولاً.");
      } else if (res.status === 'synced_pulled') {
        alert("تمت المزامنة بنجاح وتنزيل تحديثات جديدة من السيرفر! 📥");
      } else if (res.status === 'synced_pushed') {
        alert("تمت المزامنة بنجاح ورفع تعديلاتك المحلية للسيرفر! 📤");
      } else if (res.status === 'up_to_date') {
        alert("قاعدة البيانات محدثة بالكامل مع السيرفر! ✅");
      }

      onDbRefresh?.();
    } catch (err) {
      console.error("Manual sync failed:", err);
      alert("فشلت المزامنة: " + err.message);
      setIsSyncing(false);
    }
  };

  // Reset patient records but keep configuration intact
  const handleResetPatientsData = async () => {
    if (!window.confirm("⚠️ تحذير: هل أنت متأكد من مسح كافة سجلات المرضى والزيارات والتقارير المالية والبدء بصفحة فارغة؟\n(سيتم الاحتفاظ بالرموز وإعدادات Supabase وتليجرام)")) {
      return;
    }
    setIsSavingSettings(true);
    try {
      const updatedDb = {
        ...db,
        days: [],
        patients: [],
        visits: [],
        meta: {
          ...db.meta,
          version: (db.meta?.version || 0) + 1,
          last_updated: new Date().toISOString(),
          last_cleared: new Date().toISOString()
        }
      };

      await onUpdateDb(updatedDb, "🧹 تم تصفير سجلات العيادة (المرضى والزيارات) لبدء العمل من جديد.");
      alert("تم تصفير جميع سجلات المرضى ومزامنة الملف السحابي بنجاح! 🗑️");
    } catch (err) {
      console.error("Failed to reset patient data:", err);
      alert("حدث خطأ أثناء تصفير البيانات: " + err.message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Clear local data and start completely fresh
  const handleClearAllData = async () => {
    if (!window.confirm("⚠️ تحذير أمني: هل أنت متأكد من مسح جميع البيانات المحلية والإعدادات والرموز السرية من هذا الجهاز بالكامل والبدء من جديد؟")) {
      return;
    }
    try {
      const localforage = (await import('localforage')).default;
      await localforage.clear();
      localStorage.clear();
      sessionStorage.clear();
      
      alert("تم مسح جميع البيانات بنجاح! سيتم الآن إعادة تشغيل التطبيق.");
      window.location.reload();
    } catch (err) {
      console.error("Failed to clear local data:", err);
      alert("حدث خطأ أثناء مسح البيانات: " + err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-24 bg-clinic-bg text-right">
      {/* Header */}
      <div className="bg-white border-b border-clinic-border p-4 shadow-sm">
        <h1 className="text-xl font-bold text-clinic-teal flex items-center gap-2">
          <Settings size={22} />
          <span>الإعدادات والاتصال</span>
        </h1>
      </div>

      <div className="p-4 flex flex-col gap-6">
        {/* Quick Actions Grid */}
        <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <h3 className="text-sm font-bold text-gray-700">إجراءات سريعة للمسؤول</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="py-3 px-3 bg-clinic-teal text-white font-bold rounded-xl active:scale-95 text-xs flex flex-col items-center justify-center gap-1.5 shadow transition-all disabled:bg-gray-300"
            >
              {isSyncing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
              <span>مزامنة يدوية</span>
            </button>
            <button
              onClick={handleResetPatientsData}
              disabled={isSavingSettings}
              className="py-3 px-3 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-xl active:scale-95 text-xs flex flex-col items-center justify-center gap-1.5 transition-all hover:bg-emerald-100"
            >
              <Trash2 size={14} className="text-emerald-700" />
              <span>تصفير بيانات المرضى</span>
            </button>
            <button
              onClick={handleClearAllData}
              className="py-3 px-3 bg-amber-50 border border-amber-200 text-amber-700 font-bold rounded-xl active:scale-95 text-xs flex flex-col items-center justify-center gap-1.5 transition-all hover:bg-amber-100"
            >
              <Trash2 size={14} className="text-amber-600" />
              <span>مسح وبدء جديد شامل</span>
            </button>
            <button
              onClick={onLogout}
              className="py-3 px-3 bg-red-50 border border-red-200 text-clinic-coral font-bold rounded-xl active:scale-95 text-xs flex flex-col items-center justify-center gap-1.5 transition-all"
            >
              <LogOut size={14} />
              <span>تسجيل خروج</span>
            </button>
          </div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSaveSettings} className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col gap-4">
          <h2 className="text-sm font-bold text-gray-500 border-b border-gray-100 pb-2 flex items-center gap-1.5">
            <Shield size={16} />
            <span>إعدادات الاتصال والربط السحابي</span>
          </h2>

          <div>
            <label className="block text-xs font-bold text-clinic-text mb-1 flex items-center justify-between">
              <span>رمز التليجرام (Telegram Bot Token)</span>
              <span className="text-[10px] text-clinic-teal bg-clinic-bg px-2 py-0.5 rounded-md border border-clinic-border">مقفل 🔒</span>
            </label>
            <input
              type="password"
              placeholder="مثال: 123456:ABC-def..."
              value={botToken}
              disabled
              className="w-full px-3 py-2.5 rounded-xl border border-clinic-border text-left font-mono text-sm bg-gray-50 text-gray-400 cursor-not-allowed select-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-clinic-text mb-1 flex items-center justify-between">
              <span>معرف القناة (Channel Chat ID)</span>
              <span className="text-[10px] text-clinic-teal bg-clinic-bg px-2 py-0.5 rounded-md border border-clinic-border">مقفل 🔒</span>
            </label>
            <input
              type="text"
              placeholder="مثال: -100123456789"
              value={chatId}
              disabled
              className="w-full px-3 py-2.5 rounded-xl border border-clinic-border text-left font-mono text-sm bg-gray-50 text-gray-400 cursor-not-allowed select-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-clinic-text mb-1 flex items-center justify-between">
              <span>Supabase API URL</span>
              <span className="text-[10px] text-clinic-teal bg-clinic-bg px-2 py-0.5 rounded-md border border-clinic-border">مقفل 🔒</span>
            </label>
            <input
              type="text"
              placeholder="https://xxxx.supabase.co"
              value={supabaseUrl}
              disabled
              className="w-full px-3 py-2.5 rounded-xl border border-clinic-border text-left font-mono text-sm bg-gray-50 text-gray-400 cursor-not-allowed select-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-clinic-text mb-1 flex items-center justify-between">
              <span>Supabase Anon Key</span>
              <span className="text-[10px] text-clinic-teal bg-clinic-bg px-2 py-0.5 rounded-md border border-clinic-border">مقفل 🔒</span>
            </label>
            <input
              type="password"
              placeholder="eyJhbGciOi..."
              value={supabaseAnonKey}
              disabled
              className="w-full px-3 py-2.5 rounded-xl border border-clinic-border text-left font-mono text-xs bg-gray-50 text-gray-400 cursor-not-allowed select-none"
            />
          </div>

          <div className="border-t border-gray-50 pt-3">
            <label className="block text-xs font-bold text-clinic-text mb-1">مفرغ الصوت (Speech-to-Text Provider)</label>
            <select
              value={speechProvider}
              onChange={(e) => setSpeechProvider(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-clinic-border text-right text-sm focus:outline-none focus:border-clinic-teal bg-white"
            >
              <option value="browser">مفرغ المتصفح المجاني المدمج (جوجل أندرويد)</option>
              <option value="assemblyai">AssemblyAI (مفتاح API إضافي)</option>
            </select>
          </div>

          {speechProvider !== 'browser' && (
            <div>
              <label className="block text-xs font-bold text-clinic-text mb-1">مفتاح API لمزود تفريغ الصوت</label>
              <input
                type="password"
                placeholder="API Key"
                value={voiceApiKey}
                onChange={(e) => setVoiceApiKey(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-clinic-border text-left font-mono text-sm focus:outline-none focus:border-clinic-teal"
              />
            </div>
          )}

          {settingsSuccess && (
            <div className="bg-clinic-mint/20 border border-clinic-mint/40 text-emerald-800 p-3 rounded-xl text-xs font-semibold flex items-center gap-1.5">
              <Check size={16} />
              <span>{settingsSuccess}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSavingSettings}
            className="w-full py-3.5 bg-clinic-teal text-white font-bold rounded-xl active:scale-95 shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:bg-gray-300"
          >
            {isSavingSettings ? <Loader2 className="animate-spin" size={18} /> : null}
            <span>حفظ إعدادات الاتصال</span>
          </button>
        </form>

        {/* Change PIN Form */}
        <form onSubmit={handleChangePin} className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col gap-4">
          <h2 className="text-sm font-bold text-gray-500 border-b border-gray-100 pb-2 flex items-center gap-1.5">
            <Key size={16} />
            <span>تغيير الرمز السري للعيادة (Clinic PIN)</span>
          </h2>

          <div>
            <label className="block text-xs font-bold text-clinic-text mb-1">الرمز السري الحالي</label>
            <input
              type="password"
              maxLength={6}
              pattern="[0-9]*"
              inputMode="numeric"
              placeholder="****"
              value={currentPinInput}
              onChange={(e) => setCurrentPinInput(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-clinic-border text-center font-mono text-lg tracking-widest focus:outline-none focus:border-clinic-teal"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-clinic-text mb-1">الرمز الجديد (4-6 أرقام)</label>
              <input
                type="password"
                maxLength={6}
                pattern="[0-9]*"
                inputMode="numeric"
                placeholder="****"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-clinic-border text-center font-mono text-lg tracking-widest focus:outline-none focus:border-clinic-teal"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-clinic-text mb-1">تأكيد الرمز الجديد</label>
              <input
                type="password"
                maxLength={6}
                pattern="[0-9]*"
                inputMode="numeric"
                placeholder="****"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-clinic-border text-center font-mono text-lg tracking-widest focus:outline-none focus:border-clinic-teal"
                required
              />
            </div>
          </div>

          {pinSuccess && (
            <div className="bg-clinic-mint/20 border border-clinic-mint/40 text-emerald-800 p-3 rounded-xl text-xs font-semibold flex items-center gap-1.5">
              <Check size={16} />
              <span>{pinSuccess}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 bg-white border border-clinic-teal text-clinic-teal font-bold rounded-xl active:scale-95 transition-all text-center"
          >
            تحديث الرمز السري
          </button>
        </form>

        {/* Mobile App Installation Guide */}
        <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col gap-4">
          <h2 className="text-sm font-bold text-gray-500 border-b border-gray-100 pb-2 flex items-center gap-1.5">
            <Smartphone size={16} />
            <span>تنزيل وتثبيت التطبيق على الهاتف</span>
          </h2>

          <p className="text-xs text-gray-600 leading-relaxed">
            يمكنك تشغيل هذا النظام كبرنامج هاتف ذكي كامل (بدون شريط المتصفح العلوي ومع أيقونة خاصة بالعيادة) عبر إحدى الطرق التالية:
          </p>

          {/* Option 1: PWA Installation instructions */}
          <div className="bg-clinic-bg border border-clinic-border rounded-xl p-3 flex flex-col gap-2">
            <h4 className="text-xs font-bold text-clinic-teal flex items-center gap-1">
              <span>📱 الطريقة الأولى: التثبيت المباشر (PWA) - ينصح به</span>
            </h4>
            <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside">
              <li>
                <strong>لهواتف الأندرويد (Chrome):</strong> اضغط على زر الخيارات (الثلاث نقاط) في أعلى المتصفح، ثم اختر <strong>"تثبيت التطبيق" (Install App)</strong> أو <strong>"إضافة إلى الشاشة الرئيسية"</strong>.
              </li>
              <li>
                <strong>لهواتف الآيفون (Safari):</strong> اضغط على زر <strong>المشاركة (Share)</strong> في الأسفل، ثم مرر القائمة واختر <strong>"إضافة إلى الشاشة الرئيسية" (Add to Home Screen)</strong>.
              </li>
            </ul>
          </div>

          {/* Option 2: APK Download link */}
          <div className="bg-clinic-bg border border-clinic-border rounded-xl p-3 flex flex-col gap-3">
            <h4 className="text-xs font-bold text-clinic-teal">
              <span>🤖 الطريقة الثانية: تحميل ملف التطبيق للأندرويد (APK)</span>
            </h4>
            <p className="text-[11px] text-gray-500 leading-normal">
              إذا كنت تفضل تثبيت التطبيق كملف APK مستقل على جهازك أو أجهزة المساعدين، يمكنك تحميله مباشرة من هنا:
            </p>
            <a
              href="bassma-clinic.apk"
              download="bassma-clinic.apk"
              className="py-2.5 px-4 bg-white border border-clinic-teal text-clinic-teal font-bold rounded-xl active:scale-95 text-xs flex items-center justify-center gap-2 transition-all shadow-sm hover:bg-clinic-teal hover:text-white"
            >
              <Download size={14} />
              <span>تحميل تطبيق الأندرويد (bassma-clinic.apk)</span>
            </a>
          </div>
        </div>

        {/* Force Update / Clear Cache Section */}
        <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col gap-4">
          <h2 className="text-sm font-bold text-gray-500 border-b border-gray-100 pb-2 flex items-center gap-1.5">
            <RefreshCw size={16} className="text-clinic-teal" />
            <span>تحديث وصيانة التطبيق</span>
          </h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            إذا قمت بتنزيل تحديثات جديدة أو واجهت أي مشاكل في العرض، يمكنك مسح الملفات المؤقتة (الكاش) وإجبار المتصفح على تحميل النسخة الأخيرة فوراً.
          </p>
          <button
            onClick={handleForceClearCache}
            className="py-3 px-4 bg-clinic-teal text-white font-bold rounded-xl active:scale-95 text-xs flex items-center justify-center gap-2 transition-all shadow-md hover:bg-[#095b5e] cursor-pointer"
          >
            <RefreshCw size={14} />
            <span>تحديث التطبيق ومسح الكاش 🔄</span>
          </button>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3 text-xs text-blue-800 leading-relaxed shadow-sm">
          <Info size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-1">دليل المزامنة والأمان:</p>
            <p>1. يتم تخزين نسخة احتياطية من البيانات مشفرة محلياً على هاتفك للعمل بدون إنترنت.</p>
            <p className="mt-1">2. عند فتح الإنترنت، يقوم التطبيق بمزامنة أي تعديلات تلقائياً مع قناة التليجرام الخاصة بك.</p>
            <p className="mt-1">3. تأكد من الاحتفاظ بـ Bot Token و Channel Chat ID في مكان آمن لضمان استرجاع البيانات.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to clear cache
const handleForceClearCache = async () => {
  if (window.confirm("🔄 هل تريد إجبار التطبيق على التحديث وحذف الملفات المؤقتة القديمة (الكاش) من هذا الجهاز؟")) {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (let key of keys) {
          await caches.delete(key);
        }
      }
      localStorage.removeItem('is_dirty');
      sessionStorage.clear();
      
      alert("تم مسح الملفات المؤقتة بنجاح! سيتم الآن إعادة تحميل الصفحة بالنسخة الجديدة.");
      window.location.reload();
    } catch (err) {
      console.error("Force reload failed:", err);
      window.location.reload();
    }
  }
};

