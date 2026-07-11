import React, { useState } from 'react';
import { ArrowRight, UserPlus, Loader2 } from 'lucide-react';

// Fallback UUID generator
function uuidv4() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function NewPatientScreen({ db, onUpdateDb, currentUser, onNavigate }) {
  // Form States
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [village, setVillage] = useState('');
  const [phone, setPhone] = useState('');
  const [amountPaid, setAmountPaid] = useState('200'); // Default checkup fee as helper
  const [visitType, setVisitType] = useState('checkup'); // 'checkup' or 'followup'

  // Loading States
  const [isSaving, setIsSaving] = useState(false);

  // Form submission
  const handleSave = async (stayOnForm = false) => {
    // Form Validation
    if (!fullName.trim()) return alert("يرجى إدخال اسم المريض ثلاثي.");
    if (!age.trim()) return alert("يرجى إدخال سن المريض.");
    if (!village.trim()) return alert("يرجى إدخال البلد أو القرية.");
    if (!amountPaid.trim()) return alert("يرجى إدخال المبلغ المدفوع.");

    setIsSaving(true);

    try {
      const patientId = uuidv4();
      const visitId = uuidv4();
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Create Patient Record
      const newPatient = {
        id: patientId,
        full_name: fullName.trim(),
        age: age.trim(),
        village: village.trim(),
        phone: phone.trim(),
        created_at: new Date().toISOString(),
        created_by: currentUser.displayName
      };

      // 2. Create Visit Record with 'waiting' status
      const newVisit = {
        id: visitId,
        patient_id: patientId,
        date: todayStr,
        day_status: 'open',
        status: 'waiting', // Mark as waiting in the doctor's queue!
        visit_type: visitType,
        complaint_text: '',
        complaint_audio_url: '',
        diagnosis: '',
        medications: '',
        lung_readings: '',
        follow_up_date: null,
        amount_paid: parseFloat(amountPaid) || 0,
        prescription_image_url: '',
        created_at: new Date().toISOString(),
        created_by: currentUser.displayName,
        updated_at: null
      };

      const updatedPatients = db.patients ? [...db.patients] : [];
      updatedPatients.push(newPatient);

      const updatedVisits = db.visits ? [...db.visits] : [];
      updatedVisits.push(newVisit);

      const updatedDb = {
        ...db,
        patients: updatedPatients,
        visits: updatedVisits
      };

      await onUpdateDb(updatedDb, `📥 الاستقبال: تم تسجيل المريض ${fullName.trim()} وإضافته لقائمة الانتظار بنجاح.`);

      setIsSaving(false);
      
      // Reset form
      setFullName('');
      setAge('');
      setVillage('');
      setPhone('');
      setAmountPaid('200');
      setVisitType('checkup');

      if (!stayOnForm) {
        onNavigate('home');
      } else {
        alert("تمت الإضافة لقائمة الانتظار بنجاح، يمكنك تسجيل حالة أخرى.");
      }

    } catch (err) {
      console.error("Failed to register patient:", err);
      alert("حدث خطأ أثناء حفظ البيانات: " + err.message);
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-24 bg-clinic-bg">
      {/* Sticky Header */}
      <div className="sticky top-0 bg-white border-b border-clinic-border px-4 py-4 z-10 flex items-center gap-3">
        <button
          onClick={() => onNavigate('home')}
          className="p-2 hover:bg-gray-100 rounded-full active:scale-95 transition-all text-clinic-teal"
        >
          <ArrowRight size={24} />
        </button>
        <h1 className="text-xl font-bold text-clinic-teal">تسجيل مريض جديد (الاستقبال)</h1>
      </div>

      <div className="p-4 flex flex-col gap-6 text-right">
        {/* Core Info Section */}
        <div className="bg-clinic-card border border-clinic-border rounded-2xl p-6 shadow-sm flex flex-col gap-5">
          <h2 className="text-sm font-extrabold text-gray-500 border-b border-gray-100 pb-2 flex items-center gap-1.5">
            <UserPlus size={18} className="text-clinic-teal" />
            <span>تسجيل المريض وإضافته لغرفة الكشف</span>
          </h2>

          <div>
            <label className="block text-sm font-bold text-clinic-text mb-1.5">الاسم ثلاثي *</label>
            <input
              type="text"
              placeholder="مثال: محمد أحمد عبدالله"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border border-clinic-border focus:border-clinic-teal focus:outline-none text-base font-semibold"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-clinic-text mb-1.5">السن (رقم أو كتابة) *</label>
              <input
                type="text"
                placeholder="مثال: ٤٥ سنة أو 45"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-clinic-border focus:border-clinic-teal focus:outline-none text-base font-semibold"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-clinic-text mb-1.5">البلد / القرية *</label>
              <input
                type="text"
                placeholder="مثال: القرنة"
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-clinic-border focus:border-clinic-teal focus:outline-none text-base font-semibold"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-clinic-text mb-1.5">حالة المريض (هل هو كشف جديد أم استشارة؟) *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setVisitType('checkup');
                  setAmountPaid('200');
                }}
                className={`py-3 px-4 rounded-xl border text-sm font-bold transition-all ${
                  visitType === 'checkup'
                    ? 'bg-clinic-teal text-white border-clinic-teal shadow-md'
                    : 'bg-white text-clinic-text border-clinic-border hover:bg-gray-50'
                }`}
              >
                كشف جديد (200 ج.م)
              </button>
              <button
                type="button"
                onClick={() => {
                  setVisitType('followup');
                  setAmountPaid('70');
                }}
                className={`py-3 px-4 rounded-xl border text-sm font-bold transition-all ${
                  visitType === 'followup'
                    ? 'bg-clinic-teal text-white border-clinic-teal shadow-md'
                    : 'bg-white text-clinic-text border-clinic-border hover:bg-gray-50'
                }`}
              >
                استشارة متابعة (70 ج.م)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-clinic-text mb-1.5">رقم التلفون (اختياري)</label>
              <input
                type="tel"
                placeholder="مثال: 01001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-clinic-border focus:border-clinic-teal focus:outline-none text-base font-semibold"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-clinic-text mb-1.5">المدفوع بالظبط (ج.م) *</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  placeholder="200.00"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-clinic-border focus:border-clinic-teal focus:outline-none text-base font-extrabold text-left"
                  required
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">ج.م</span>
              </div>
            </div>
          </div>
        </div>

        {/* Informative Help Card */}
        <div className="bg-clinic-teal/5 border border-clinic-teal/15 rounded-2xl p-4 text-xs text-clinic-teal leading-relaxed">
          💡 **ملاحظة للمساعد**: بمجرد النقر على حفظ، سيتم إرسال حالة المريض مباشرة لغرفة الطبيبة د. بسمة لتظهر في قائمة الانتظار الحالية داخل شاشتها لحظياً.
        </div>
      </div>

      {/* Sticky Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-clinic-border p-4 z-10 flex gap-3 shadow-lg max-w-xl mx-auto">
        <button
          onClick={() => handleSave(false)}
          disabled={isSaving}
          className="flex-1 py-4 bg-clinic-teal text-white font-bold rounded-xl shadow-md active:scale-95 transition-all text-center flex items-center justify-center gap-2 cursor-pointer disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="animate-spin" size={20} /> : null}
          <span>حفظ للانتظار 📥</span>
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={isSaving}
          className="flex-1 py-4 bg-white border border-clinic-teal text-clinic-teal font-bold rounded-xl active:scale-95 transition-all text-center flex items-center justify-center gap-2 cursor-pointer disabled:border-gray-300 disabled:text-gray-300 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="animate-spin" size={20} /> : null}
          <span>حفظ وإضافة آخر</span>
        </button>
      </div>
    </div>
  );
}
