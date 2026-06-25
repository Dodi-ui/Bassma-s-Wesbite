import React, { useState } from 'react';
import { Calendar, Users, Clock, Plus, Search, AlertCircle, RefreshCw } from 'lucide-react';

export default function DashboardScreen({ db, onUpdateDb, currentUser, onNavigate, setSelectedVisitId }) {
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const isDoctor = currentUser?.username === 'Dr. Bassma';

  // Get today's date in YYYY-MM-DD
  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = getTodayDateString();

  // Find if today's day record exists
  const todayDayRecord = db.days?.find(d => d.date === todayStr);
  const isDayOpen = todayDayRecord && todayDayRecord.status === 'open';

  // Calculate statistics from visits (excluding deleted ones)
  const todayVisits = db.visits?.filter(v => v.date === todayStr && !v.is_deleted) || [];
  
  // Total visits registered today
  const totalPatientsToday = todayVisits.length;
  const completedPatientsToday = todayVisits.filter(v => v.status === 'completed' || !v.status).length;
  const waitingPatientsToday = todayVisits.filter(v => v.status === 'waiting').length;
  
  const totalRevenue = todayVisits.reduce((sum, v) => sum + (Number(v.amount_paid) || 0), 0);

  // Live waiting queue (newest registered at bottom, oldest at top)
  const waitingQueue = todayVisits.filter(v => v.status === 'waiting');
  waitingQueue.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // Format today's date in Arabic
  const todayArabicDate = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const handleOpenDay = async () => {
    const newDay = {
      date: todayStr,
      status: 'open',
      opened_at: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      opened_by: currentUser.displayName,
      closed_at: null,
      total_patients: 0,
      total_revenue: 0,
      updated_at: new Date().toISOString()
    };

    const updatedDays = db.days ? [...db.days] : [];
    const existingIndex = updatedDays.findIndex(d => d.date === todayStr);

    if (existingIndex >= 0) {
      updatedDays[existingIndex] = newDay;
    } else {
      updatedDays.push(newDay);
    }

    const updatedDb = {
      ...db,
      days: updatedDays
    };

    await onUpdateDb(updatedDb, `🟢 تم فتح يوم جديد بالعيادة بواسطة ${currentUser.displayName}`);
  };

  const handleCloseDay = async () => {
    const updatedDays = db.days ? [...db.days] : [];
    const index = updatedDays.findIndex(d => d.date === todayStr);

    if (index >= 0) {
      updatedDays[index] = {
        ...updatedDays[index],
        status: 'closed',
        closed_at: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        closed_by: currentUser.displayName,
        total_patients: totalPatientsToday,
        total_revenue: totalRevenue,
        updated_at: new Date().toISOString()
      };

      const updatedDb = {
        ...db,
        days: updatedDays
      };

      setShowConfirmClose(false);
      await onUpdateDb(
        updatedDb,
        `🔴 تم إغلاق يوم العمل بواسطة ${currentUser.displayName}\nإجمالي الحالات: ${totalPatientsToday}\nالحالات المكتملة: ${completedPatientsToday}\nإجمالي الدخل: ${totalRevenue} ج.م`
      );
    }
  };

  const handleStartConsultation = (visitId) => {
    if (!isDoctor) return; // Only doctor can launch consultation room
    setSelectedVisitId(visitId);
    onNavigate('consultation');
  };

  return (
    <div className="flex-1 flex flex-col gap-6 p-4 pb-24 text-right">
      
      {/* Date Banner */}
      <div className="bg-clinic-teal text-white rounded-2xl p-5 shadow flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold mb-1">{todayArabicDate}</h2>
          <p className="text-teal-100 text-xs">أهلاً بك، {currentUser.displayName}</p>
        </div>
        <div className="bg-white/10 p-3 rounded-xl">
          <Calendar size={28} />
        </div>
      </div>

      {/* Day opening controls (Only doctor or lead assistant can do, let's keep it visible for all) */}
      <div className="w-full">
        {todayDayRecord && todayDayRecord.status === 'closed' ? (
          <div className="w-full py-5 px-4 bg-gray-50 border border-gray-200 rounded-2xl shadow-sm text-center flex flex-col items-center justify-center gap-1.5 animate-fade-in">
            <span className="text-2xl">🔒</span>
            <span className="text-lg font-bold text-gray-700">تم إغلاق يوم العمل اليوم بنجاح</span>
            <span className="text-xs text-gray-500 font-semibold">
              تم الإغلاق بواسطة {todayDayRecord.closed_by || 'المسؤول'} في تمام الساعة {todayDayRecord.closed_at || 'نهاية اليوم'}
            </span>
            <button
              onClick={handleOpenDay}
              className="mt-2 text-xs text-clinic-teal font-extrabold underline hover:text-[#0b6b66] active:scale-95 transition-all"
            >
              إعادة فتح اليوم (عند الحاجة)
            </button>
          </div>
        ) : !isDayOpen ? (
          <button
            onClick={handleOpenDay}
            className="w-full py-6 bg-clinic-mint text-clinic-text border-2 border-clinic-mint/30 hover:bg-[#92d8be] active:scale-98 transition-all rounded-2xl shadow-md text-xl font-bold flex flex-col items-center justify-center gap-1.5"
          >
            <span className="text-2xl">🟢</span>
            <span>فتح يوم العمل اليوم</span>
            <span className="text-[11px] font-normal opacity-75">يجب فتح اليوم لبدء تسجيل المرضى</span>
          </button>
        ) : (
          <button
            onClick={() => setShowConfirmClose(true)}
            className="w-full py-6 bg-clinic-coral text-white border-2 border-clinic-coral/30 hover:bg-[#ef5c5c] active:scale-98 transition-all rounded-2xl shadow-md text-xl font-bold flex flex-col items-center justify-center gap-1.5"
          >
            <span className="text-2xl">🔴</span>
            <span>إغلاق يوم العمل</span>
            <span className="text-[11px] font-normal text-red-100">اضغط لإنهاء اليوم وتصدير تقارير اليوم</span>
          </button>
        )}
      </div>

      {/* ==================== THE LIVE QUEUE SECTION ==================== */}
      <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <h3 className="text-sm font-extrabold text-gray-700 flex items-center gap-1.5">
            <Clock size={16} className="text-clinic-teal animate-pulse" />
            <span>قائمة الانتظار الحالية ({waitingQueue.length} مريض)</span>
          </h3>
          {isDayOpen && !isDoctor && (
            <button
              onClick={() => onNavigate('new-patient')}
              className="py-1.5 px-3 bg-clinic-teal text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow active:scale-95 transition-all"
            >
              <Plus size={12} />
              <span>إضافة للانتظار</span>
            </button>
          )}
        </div>

        {waitingQueue.length > 0 ? (
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
            {waitingQueue.map((visit, index) => {
              const patient = db.patients?.find(p => p.id === visit.patient_id);
              if (!patient) return null;

              return (
                <div
                  key={visit.id}
                  onClick={() => handleStartConsultation(visit.id)}
                  className={`border rounded-xl p-3.5 flex items-center justify-between transition-all hover-lift ${
                    isDoctor
                      ? 'border-clinic-teal/20 bg-clinic-teal/5 hover:bg-clinic-teal/10 cursor-pointer active:scale-98'
                      : 'border-clinic-border bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-clinic-teal/15 text-clinic-teal rounded-full flex items-center justify-center text-xs font-black">
                      {index + 1}
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-clinic-text">{patient.full_name}</h4>
                      <p className="text-[11px] text-gray-400 font-medium">
                        {patient.age} سنة · {patient.village}
                      </p>
                    </div>
                  </div>

                  <div className="text-left">
                    {isDoctor ? (
                      <span className="text-xs font-bold text-white bg-clinic-teal py-1.5 px-3 rounded-lg shadow-sm">
                        دخول الكشف 🩺
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-gray-500 bg-gray-200/65 py-1 px-2 rounded-lg">
                        قيد الانتظار ⌛
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-400 text-xs border border-dashed border-gray-200 rounded-xl">
            قائمة الانتظار فارغة حالياً.
          </div>
        )}
      </div>

      {/* Today Statistics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col justify-between h-28 hover-lift">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold">الحالات المكتملة</span>
            <Users size={16} className="text-clinic-teal" />
          </div>
          <div className="text-right">
            <span className="text-2xl font-extrabold text-clinic-text">{completedPatientsToday}</span>
            <span className="text-[10px] text-gray-400 block mt-0.5">من أصل {totalPatientsToday} مريض</span>
          </div>
        </div>

        <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col justify-between h-28 hover-lift">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold">دخل اليوم المالي</span>
            <span className="text-clinic-teal font-extrabold text-sm">ج.م</span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-extrabold text-clinic-text">{totalRevenue}</span>
            <span className="text-[10px] text-gray-400 block mt-0.5">جنيه مصري مقيد</span>
          </div>
        </div>
      </div>

      {/* Quick Action List */}
      <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm">
        <h3 className="text-xs font-bold text-gray-500 mb-3 border-b border-gray-100 pb-1.5">أدوات الوصول السريع</h3>
        <div className="flex flex-col gap-2">
          {!isDoctor && (
            <button
              onClick={() => {
                if (isDayOpen) {
                  onNavigate('new-patient');
                } else {
                  alert('يجب فتح يوم العمل أولاً لتسجيل مريض جديد.');
                }
              }}
              disabled={!isDayOpen}
              className={`w-full py-3.5 px-4 rounded-xl font-bold flex items-center justify-between transition-all text-sm ${
                isDayOpen
                  ? 'bg-clinic-teal text-white hover:bg-[#095b5e] shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
              }`}
            >
              <span>📝 تسجيل مريض بالاستقبال</span>
              <span className="text-[11px] font-normal">
                {isDayOpen ? 'متاح الآن' : 'يوم العمل مغلق'}
              </span>
            </button>
          )}

          <button
            onClick={() => onNavigate('search')}
            className="w-full py-3.5 px-4 bg-white border border-clinic-border hover:bg-gray-50 text-clinic-text rounded-xl font-bold flex items-center justify-between transition-all text-sm shadow-sm"
          >
            <span>🔍 بحث وتاريخ المرضى</span>
            <span className="text-[11px] font-normal text-gray-400">كامل الملفات</span>
          </button>
        </div>
      </div>

      {/* Close Day Confirmation Modal */}
      {showConfirmClose && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-right shadow-2xl border border-clinic-border">
            <div className="flex items-center gap-2 text-clinic-coral mb-4">
              <AlertCircle size={24} />
              <h3 className="text-lg font-bold">تأكيد إغلاق اليوم</h3>
            </div>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              هل أنت متأكد من إغلاق يوم العمل؟ عند إغلاق اليوم لن يتمكن المساعدون من إضافة مرضى جدد لهذا اليوم إلا بعد فتحه مجدداً.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCloseDay}
                className="flex-1 py-3 bg-clinic-coral text-white font-bold rounded-xl active:scale-95 transition-all text-center"
              >
                نعم، إغلاق
              </button>
              <button
                onClick={() => setShowConfirmClose(false)}
                className="flex-1 py-3 bg-gray-100 border border-clinic-border text-clinic-text font-bold rounded-xl active:scale-95 transition-all text-center"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
