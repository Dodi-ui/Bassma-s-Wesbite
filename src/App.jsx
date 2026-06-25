import React, { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  initSyncManager,
  subscribeToSyncStatus,
  subscribeToConflict,
  getDb,
  saveDbLocally,
  syncWithTelegram,
  resolveConflict
} from './services/syncManager';
import { sendAuditLog } from './services/telegramService';

// View Imports
import Layout from './components/Layout';
import LoginScreen from './components/LoginScreen';
import DashboardScreen from './components/DashboardScreen';
import NewPatientScreen from './components/NewPatientScreen';
import ConsultationScreen from './components/ConsultationScreen';
import SearchScreen from './components/SearchScreen';
import PatientProfileScreen from './components/PatientProfileScreen';
import ReportsScreen from './components/ReportsScreen';
import SettingsScreen from './components/SettingsScreen';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('home'); // home, search, reports, settings
  const [activeScreen, setActiveScreen] = useState('home'); // home, search, reports, settings, new-patient, patient-profile, consultation
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [selectedVisitId, setSelectedVisitId] = useState(null); // Doctor's active consultation

  // Database and Sync States
  const [db, setDb] = useState(null);
  const [syncState, setSyncState] = useState({ online: navigator.onLine, dirty: false, version: 1 });
  const [conflictInfo, setConflictInfo] = useState(null); // { localVer, serverVer, serverDb }
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Initialize DB and sync listeners
  useEffect(() => {
    const startApp = async () => {
      setIsInitializing(true);
      await initSyncManager();
      
      // Get initial database
      setDb({ ...getDb() });
      setIsInitializing(false);

      // Subscribe to sync status updates (online/dirty/version)
      const unsubscribeSync = subscribeToSyncStatus((status) => {
        setSyncState(status);
        // Refresh local DB in state on change
        setDb({ ...getDb() });
      });

      // Subscribe to database version conflict notifications
      const unsubscribeConflict = subscribeToConflict((info) => {
        setConflictInfo(info);
      });

      return () => {
        unsubscribeSync();
        unsubscribeConflict();
      };
    };

    startApp();
  }, []);

  // Periodic polling for multi-device synchronization (every 5 seconds for real-time responsiveness)
  useEffect(() => {
    if (isInitializing || !currentUser) return;

    const interval = setInterval(() => {
      if (syncState.online && !syncState.dirty) {
        console.log("Background sync: checking for updates...");
        syncWithTelegram().then(res => {
          if (res.status === 'synced_pulled') {
            console.log("Background sync pulled new changes.");
            setDb({ ...getDb() });
          }
        }).catch(err => console.error("Background sync failed:", err));
      }
    }, 5000); // 5 seconds

    return () => clearInterval(interval);
  }, [isInitializing, currentUser, syncState.online, syncState.dirty]);

  // Handle local database updates
  const handleUpdateDb = async (newDb, auditMessage = "") => {
    const updatedDb = {
      ...newDb,
      meta: {
        ...(newDb.meta || {}),
        version: (newDb.meta?.version || 1) + 1,
        last_updated: new Date().toISOString()
      }
    };
    setDb(updatedDb);
    // 1. Save locally and flag as dirty
    await saveDbLocally(updatedDb, true);
    
    // 2. Try to sync immediately in background
    if (syncState.online) {
      try {
        setIsSyncing(true);
        await syncWithTelegram();
        setIsSyncing(false);
        setDb({ ...getDb() });

        // Post audit log to Telegram bot
        if (auditMessage) {
          const token = newDb.settings?.telegram_bot_token;
          const chatId = newDb.settings?.telegram_chat_id;
          await sendAuditLog(token, chatId, auditMessage);
        }
      } catch (err) {
        console.error("Auto sync failed:", err);
        setIsSyncing(false);
      }
    }
  };

  // Trigger manual sync
  const handleTriggerSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await syncWithTelegram();
      setIsSyncing(false);
      setDb({ ...getDb() });
      
      if (res.status === 'synced_pulled') {
        alert("تم تحديث البيانات بنجاح طبقاً لأحدث نسخة على السيرفر.");
      } else if (res.status === 'synced_pushed') {
        alert("تم رفع تعديلاتك المحلية ومزامنتها بنجاح.");
      } else if (res.status === 'up_to_date') {
        alert("قاعدة البيانات محدثة بالكامل مع السيرفر.");
      }
    } catch (err) {
      console.error("Sync error:", err);
      setIsSyncing(false);
      alert("حدث خطأ أثناء المزامنة: " + err.message);
    }
  };

  // Resolve conflict choices
  const handleResolveConflict = async (choice) => {
    if (!conflictInfo) return;
    setIsSyncing(true);
    try {
      await resolveConflict(choice, conflictInfo.serverDb);
      setConflictInfo(null);
      setIsSyncing(false);
      setDb({ ...getDb() });
      alert(choice === 'use_local' ? 'تم اعتماد تعديلاتك المحلية ورفعها للملف.' : 'تم استرجاع نسخة السيرفر بنجاح.');
    } catch (err) {
      console.error("Conflict resolution failed:", err);
      setIsSyncing(false);
      alert("فشل حل التعارض: " + err.message);
    }
  };

  // Login handler
  const handleLogin = (user) => {
    setCurrentUser(user);
    // Check if Telegram credentials are set. If not, direct them to Settings.
    const database = getDb();
    if (!database.settings?.telegram_bot_token || !database.settings?.telegram_chat_id) {
      setCurrentTab('settings');
      setActiveScreen('settings');
    } else {
      setCurrentTab('home');
      setActiveScreen('home');
    }
  };

  // Logout handler
  const handleLogout = () => {
    if (window.confirm("هل تريد تسجيل الخروج؟")) {
      setCurrentUser(null);
    }
  };

  // Navigations routing helper
  const handleNavigate = (screen) => {
    // If navigating to bottom tabs
    if (['home', 'search', 'reports', 'settings'].includes(screen)) {
      setCurrentTab(screen);
      setActiveScreen(screen);
    } else {
      setActiveScreen(screen);
    }
  };

  // Loading Screen
  if (isInitializing || !db) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-clinic-bg text-clinic-teal gap-3">
        <Loader2 className="animate-spin" size={48} />
        <span className="text-sm font-bold">جاري تحميل البيانات المحلية للعيادة...</span>
      </div>
    );
  }

  // Not Logged In Screen
  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} savedPin={db.settings?.clinic_pin} />;
  }

  // Render sub-screens based on active screen
  const renderScreen = () => {
    switch (activeScreen) {
      case 'home':
        return (
          <DashboardScreen
            db={db}
            onUpdateDb={handleUpdateDb}
            currentUser={currentUser}
            onNavigate={handleNavigate}
            setSelectedVisitId={setSelectedVisitId}
          />
        );
      case 'search':
        return (
          <SearchScreen
            db={db}
            onNavigate={handleNavigate}
            setSelectedPatientId={setSelectedPatientId}
          />
        );
      case 'reports':
        return (
          <ReportsScreen
            db={db}
            currentUser={currentUser}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            db={db}
            onUpdateDb={handleUpdateDb}
            onLogout={handleLogout}
          />
        );
      case 'new-patient':
        return (
          <NewPatientScreen
            db={db}
            onUpdateDb={handleUpdateDb}
            currentUser={currentUser}
            onNavigate={handleNavigate}
          />
        );
      case 'consultation':
        return (
          <ConsultationScreen
            db={db}
            visitId={selectedVisitId}
            onUpdateDb={handleUpdateDb}
            currentUser={currentUser}
            onNavigate={handleNavigate}
          />
        );
      case 'patient-profile':
        return (
          <PatientProfileScreen
            db={db}
            patientId={selectedPatientId}
            onUpdateDb={handleUpdateDb}
            currentUser={currentUser}
            onNavigate={handleNavigate}
          />
        );
      default:
        return <div>الشاشة غير موجودة</div>;
    }
  };

  const isMainTab = ['home', 'search', 'reports', 'settings'].includes(activeScreen);

  return (
    <Layout
      currentTab={currentTab}
      onNavigate={handleNavigate}
      syncState={syncState}
      onTriggerSync={handleTriggerSync}
      currentUser={currentUser}
      hideNavigation={!isMainTab}
    >
      {renderScreen()}

      {/* VERSION CONFLICT RESOLUTION MODAL OVERLAY */}
      {conflictInfo && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-right shadow-2xl border border-clinic-border flex flex-col gap-4">
            <div className="flex items-center gap-2 text-yellow-600 border-b border-gray-100 pb-2">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">تعارض في إصدارات البيانات</h3>
            </div>
            
            <p className="text-gray-600 text-sm leading-relaxed">
              قام مستخدم آخر بتحديث ملف المرضى على السيرفر أثناء عملك بدون إنترنت.
              <br />
              <b>نسخة السيرفر الحالية:</b> #{conflictInfo.serverVer}
              <br />
              <b>نسختك المحلية الحالية:</b> #{conflictInfo.localVer}
            </p>
            
            <p className="text-xs text-clinic-coral font-bold bg-red-50 p-2.5 rounded-lg">
              ⚠️ اختيار "اعتماد نسختك المحلية" سيؤدي إلى الكتابة فوق التعديلات التي قام بها المستخدم الآخر. يرجى التنسيق أولاً.
            </p>

            <div className="flex flex-col gap-2 mt-2">
              <button
                onClick={() => handleResolveConflict('use_server')}
                disabled={isSyncing}
                className="w-full py-3 bg-clinic-teal text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-sm"
              >
                {isSyncing ? <RefreshCw className="animate-spin" size={16} /> : null}
                <span>استخدام نسخة السيرفر (تحديث نسختك)</span>
              </button>
              <button
                onClick={() => handleResolveConflict('use_local')}
                disabled={isSyncing}
                className="w-full py-3 bg-white border border-clinic-teal text-clinic-teal font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-sm"
              >
                {isSyncing ? <RefreshCw className="animate-spin" size={16} /> : null}
                <span>اعتماد نسختي المحلية (الكتابة فوق السيرفر)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
