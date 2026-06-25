import React from 'react';
import { Home, Search, FileBarChart, Settings, WifiOff, CloudAlert } from 'lucide-react';

export default function Layout({
  children,
  currentTab,
  onNavigate,
  syncState,
  onTriggerSync,
  currentUser,
  hideNavigation = false
}) {
  const tabs = [
    { id: 'home', label: 'اليوم', icon: Home },
    { id: 'search', label: 'بحث', icon: Search },
    { id: 'reports', label: 'تقارير', icon: FileBarChart },
    { id: 'settings', label: 'إعدادات', icon: Settings }
  ];

  return (
    <div className="w-full max-w-xl mx-auto min-h-screen bg-clinic-bg flex flex-col relative border-x border-clinic-border shadow-lg">
      
      {/* Dynamic Status Banners at the top */}
      <div className="sticky top-0 z-20 flex flex-col w-full text-center">
        
        {/* Sync Info Header */}
        {syncState.online && (
          <div className="bg-clinic-subtle border-b border-clinic-border py-1.5 px-4 text-[10px] text-gray-500 font-semibold flex items-center justify-between shadow-xs print:hidden">
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span>مزامنة سحابية نشطة ومؤمنة</span>
            </div>
            <span>نسخة الملف: #{syncState.version || 1}</span>
          </div>
        )}
        
        {/* Offline Banner */}
        {!syncState.online && (
          <div className="bg-clinic-coral text-white py-2 px-4 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md">
            <WifiOff size={14} />
            <span>وضع بدون إنترنت — البيانات محفوظة محلياً وهتتزامن لما النت يرجع ⚠️</span>
          </div>
        )}

        {/* Dirty / Unsaved Local Edits Banner */}
        {syncState.online && syncState.dirty && (
          <div
            onClick={onTriggerSync}
            className="bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-colors"
          >
            <CloudAlert size={14} />
            <span>توجد تعديلات محلية غير محفوظة. اضغط للمزامنة مع التليجرام 🔄</span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-clinic-bg overflow-x-hidden">
        {children}
      </main>

      {/* Persistent Bottom Navigation Bar */}
      {!hideNavigation && (
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-clinic-border flex items-center justify-around z-10 max-w-xl mx-auto shadow-2xl">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                className={`flex flex-col items-center justify-center flex-1 h-full gap-1 active:scale-95 transition-all ${
                  isActive
                    ? 'text-clinic-teal'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon size={22} className={isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'} />
                <span className={`text-[11px] font-bold ${isActive ? 'font-black' : ''}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
