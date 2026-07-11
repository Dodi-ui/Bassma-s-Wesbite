import React, { useState, useEffect } from 'react';
import { ArrowRight, Calendar, FileText, Activity, MessageSquare, Edit3, Trash2, Plus, X, Camera, Mic, Volume2 } from 'lucide-react';
import { getSignedUrl } from '../services/supabaseService';

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

export default function PatientProfileScreen({ db, patientId, onUpdateDb, currentUser, onNavigate }) {
  const [patient, setPatient] = useState(null);
  const [patientVisits, setPatientVisits] = useState([]);
  
  // Modals / Overlays
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState(null);
  const [signedMedia, setSignedMedia] = useState({}); // { [visitId_type]: signedUrl }

  // Edit Mode States
  const [isEditingPatient, setIsEditingPatient] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editVillage, setEditVillage] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const [editingVisit, setEditingVisit] = useState(null); // holds copy of visit being edited
  
  // Adding New Visit to this Patient
  const [isAddingVisit, setIsAddingVisit] = useState(false);
  const [newVisitAmount, setNewVisitAmount] = useState('200');
  const [newVisitComplaint, setNewVisitComplaint] = useState('');
  const [newVisitFollowUp, setNewVisitFollowUp] = useState('');
  const [newVisitType, setNewVisitType] = useState('checkup'); // 'checkup' or 'followup'

  // Load patient & visits
  useEffect(() => {
    if (!patientId || !db) return;
    
    const foundPatient = db.patients?.find(p => p.id === patientId && !p.is_deleted);
    setPatient(foundPatient || null);

    if (foundPatient) {
      setEditName(foundPatient.full_name);
      setEditAge(foundPatient.age);
      setEditVillage(foundPatient.village);
      setEditPhone(foundPatient.phone || '');
    }

    const foundVisits = db.visits?.filter(v => v.patient_id === patientId && !v.is_deleted) || [];
    // Sort visits by date descending (newest first)
    foundVisits.sort((a, b) => new Date(b.date) - new Date(a.date));
    setPatientVisits(foundVisits);
  }, [patientId, db]);

  // Sign URLs on the fly for media items
  useEffect(() => {
    const signAllMedia = async () => {
      const urls = {};
      for (const visit of patientVisits) {
        if (visit.prescription_image_url) {
          const key = `${visit.id}_img`;
          try {
            const signed = await getSignedUrl('prescriptions', visit.prescription_image_url);
            urls[key] = signed;
          } catch (e) {
            console.error("Error signing image", e);
          }
        }
        if (visit.complaint_audio_url) {
          const key = `${visit.id}_audio`;
          try {
            const signed = await getSignedUrl('voice-memos', visit.complaint_audio_url);
            urls[key] = signed;
          } catch (e) {
            console.error("Error signing audio", e);
          }
        }
      }
      setSignedMedia(urls);
    };

    if (patientVisits.length > 0 && db.settings?.supabase_url) {
      signAllMedia();
    }
  }, [patientVisits, db.settings]);

  if (!patient) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-clinic-bg">
        <p className="text-gray-500 font-bold mb-4">المريض غير موجود أو تم حذفه.</p>
        <button onClick={() => onNavigate('search')} className="py-2 px-6 bg-clinic-teal text-white rounded-xl font-bold">
          العودة للبحث
        </button>
      </div>
    );
  }

  // Save updated patient details
  const handleSavePatientDetails = async () => {
    if (!editName.trim()) return alert("الاسم مطلوب.");
    if (!editAge.trim()) return alert("السن مطلوب.");
    if (!editVillage.trim()) return alert("البلد مطلوبة.");

    const updatedPatients = db.patients.map(p => {
      if (p.id === patient.id) {
        return {
          ...p,
          full_name: editName.trim(),
          age: editAge.trim(),
          village: editVillage.trim(),
          phone: editPhone.trim(),
          updated_at: new Date().toISOString()
        };
      }
      return p;
    });

    const updatedDb = {
      ...db,
      patients: updatedPatients
    };

    await onUpdateDb(updatedDb, `✏️ تم تعديل البيانات الشخصية للمريض: ${editName.trim()}`);
    setIsEditingPatient(false);
  };

  // Soft delete patient (and optionally all their visits)
  const handleDeletePatient = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف المريض ${patient.full_name} نهائياً من العرض؟ (حذف مؤقت)`)) return;

    const nowIso = new Date().toISOString();
    const updatedPatients = db.patients.map(p => {
      if (p.id === patient.id) {
        return { 
          ...p, 
          is_deleted: true,
          updated_at: nowIso
        };
      }
      return p;
    });

    // Also soft delete patient visits
    const updatedVisits = db.visits.map(v => {
      if (v.patient_id === patient.id) {
        return { 
          ...v, 
          is_deleted: true,
          updated_at: nowIso
        };
      }
      return v;
    });

    const updatedDb = {
      ...db,
      patients: updatedPatients,
      visits: updatedVisits
    };

    await onUpdateDb(updatedDb, `🗑️ تم حذف ملف المريض: ${patient.full_name}`);
    onNavigate('search');
  };

  // Open edit modal for a visit
  const startEditVisit = (visit) => {
    setEditingVisit({ ...visit });
  };

  // Save edited visit
  const handleSaveVisitEdits = async () => {
    if (!editingVisit) return;
    
    const updatedVisits = db.visits.map(v => {
      if (v.id === editingVisit.id) {
        return {
          ...editingVisit,
          updated_at: new Date().toISOString()
        };
      }
      return v;
    });

    const updatedDb = {
      ...db,
      visits: updatedVisits
    };

    await onUpdateDb(updatedDb, `✏️ تم تعديل تفاصيل زيارة المريض: ${patient.full_name} بتاريخ ${editingVisit.date}`);
    setEditingVisit(null);
    if (selectedVisit && selectedVisit.id === editingVisit.id) {
      setSelectedVisit(editingVisit);
    }
  };

  // Soft delete a specific visit
  const handleDeleteVisit = async (visitId, visitDate) => {
    if (!window.confirm(`هل أنت متأكد من حذف هذه الزيارة بتاريخ ${visitDate}؟`)) return;

    const updatedVisits = db.visits.map(v => {
      if (v.id === visitId) {
        return { 
          ...v, 
          is_deleted: true,
          updated_at: new Date().toISOString()
        };
      }
      return v;
    });

    const updatedDb = {
      ...db,
      visits: updatedVisits
    };

    await onUpdateDb(updatedDb, `🗑️ تم حذف زيارة للمريض: ${patient.full_name} بتاريخ ${visitDate}`);
    setSelectedVisit(null);
  };

  // Add new visit
  const handleAddNewVisit = async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Check if day is open
    const todayDayRecord = db.days?.find(d => d.date === todayStr);
    const isDayOpen = todayDayRecord && todayDayRecord.status === 'open';

    if (!isDayOpen) {
      return alert("عذراً، يجب فتح يوم العمل أولاً من الصفحة الرئيسية لتسجيل زيارة جديدة.");
    }

    const newVisit = {
      id: uuidv4(),
      patient_id: patient.id,
      date: todayStr,
      day_status: 'open',
      visit_type: newVisitType,
      complaint_text: newVisitComplaint.trim(),
      complaint_audio_url: "",
      diagnosis: "",
      medications: "",
      lung_readings: "",
      follow_up_date: newVisitFollowUp || null,
      amount_paid: parseFloat(newVisitAmount) || 0,
      prescription_image_url: "",
      created_at: new Date().toISOString(),
      created_by: currentUser.displayName,
      updated_at: null
    };

    const updatedVisits = db.visits ? [...db.visits] : [];
    updatedVisits.push(newVisit);

    const updatedDb = {
      ...db,
      visits: updatedVisits
    };

    await onUpdateDb(updatedDb, `➕ تم تسجيل زيارة متابعة للمريض: ${patient.full_name} بقيمة ${newVisitAmount} ج.م`);
    
    // Reset state
    setIsAddingVisit(false);
    setNewVisitComplaint('');
    setNewVisitFollowUp('');
    setNewVisitType('checkup');
    setNewVisitAmount('200');
  };

  return (
    <div className="flex-1 flex flex-col pb-20 bg-clinic-bg text-right">
      {/* Sticky Header */}
      <div className="sticky top-0 bg-white border-b border-clinic-border px-4 py-4 z-10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('search')}
            className="p-2 hover:bg-gray-100 rounded-full active:scale-95 transition-all text-clinic-teal"
          >
            <ArrowRight size={24} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-clinic-teal">{patient.full_name}</h1>
            <p className="text-xs text-gray-400">{patient.village} · {patient.age} سنة</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsEditingPatient(true)}
            className="p-2.5 bg-gray-50 border border-clinic-border hover:bg-gray-100 rounded-xl active:scale-95 transition-all text-clinic-text flex items-center gap-1 text-xs font-bold"
          >
            <Edit3 size={14} />
            <span>تعديل الاسم</span>
          </button>
          <button
            onClick={handleDeletePatient}
            className="p-2.5 bg-red-50 border border-red-200 hover:bg-red-100 rounded-xl active:scale-95 transition-all text-clinic-coral flex items-center gap-1 text-xs font-bold"
          >
            <Trash2 size={14} />
            <span>حذف المريض</span>
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="p-4 flex flex-col gap-6">
        {/* Contact Info Card */}
        {patient.phone && (
          <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm text-sm">
            <span className="font-bold text-gray-500">رقم الهاتف: </span>
            <a href={`tel:${patient.phone}`} className="text-clinic-teal font-bold hover:underline select-all">{patient.phone}</a>
          </div>
        )}

        {/* Visit History Section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-700">سجل الزيارات المتابعة</h2>
            <button
              onClick={() => setIsAddingVisit(true)}
              className="py-2 px-3 bg-clinic-teal text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
            >
              <Plus size={14} />
              <span>تسجيل زيارة جديدة</span>
            </button>
          </div>

          {patientVisits.length > 0 ? (
            <div className="flex flex-col gap-3">
              {patientVisits.map(visit => {
                const imgKey = `${visit.id}_img`;
                const audioKey = `${visit.id}_audio`;
                const imgSigned = signedMedia[imgKey];
                const audioSigned = signedMedia[audioKey];

                return (
                  <div
                    key={visit.id}
                    className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div
                        onClick={() => setSelectedVisit(visit)}
                        className="flex items-center gap-2 text-clinic-teal cursor-pointer hover:underline flex-wrap"
                      >
                        <Calendar size={16} />
                        <span className="font-bold text-sm">
                          {new Date(visit.date).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                        {visit.visit_type === 'followup' ? (
                          <span className="text-[9px] font-extrabold bg-purple-50 border border-purple-200 text-purple-700 px-1.5 py-0.5 rounded-full">
                            استشارة
                          </span>
                        ) : (
                          <span className="text-[9px] font-extrabold bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5 rounded-full">
                            كشف
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold bg-clinic-mint/20 px-2 py-1 rounded-lg text-clinic-text">
                        {visit.amount_paid} ج.م
                      </span>
                    </div>

                    <div onClick={() => setSelectedVisit(visit)} className="cursor-pointer flex flex-col gap-1 text-sm text-clinic-text">
                      {visit.complaint_text && (
                        <p className="line-clamp-2"><span className="font-bold text-gray-400">الشكوى:</span> {visit.complaint_text}</p>
                      )}
                      {visit.follow_up_date && (
                        <p className="text-xs font-semibold text-clinic-teal">📅 موعد الاستشارة: {new Date(visit.follow_up_date).toLocaleDateString('ar-EG')}</p>
                      )}
                    </div>

                    {/* Media Previews in card */}
                    <div className="flex flex-wrap gap-2 items-center">
                      {imgSigned && (
                        <div
                          onClick={() => setZoomPhotoUrl(imgSigned)}
                          className="w-12 h-12 rounded-lg overflow-hidden border border-clinic-border cursor-zoom-in"
                        >
                          <img src={imgSigned} alt="روشتة مصغرة" className="w-full h-full object-cover" />
                        </div>
                      )}
                      {audioSigned && (
                        <div className="flex items-center gap-1.5 py-1 px-3 bg-gray-50 border border-clinic-border rounded-xl">
                          <Volume2 size={14} className="text-clinic-teal" />
                          <audio src={audioSigned} controls className="h-6 w-36 max-w-full text-xs" />
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex justify-end gap-2 pt-2 border-t border-gray-50">
                      <button
                        onClick={() => startEditVisit(visit)}
                        className="py-1.5 px-3 bg-gray-50 border border-clinic-border hover:bg-gray-100 rounded-lg active:scale-95 transition-all text-xs font-bold text-clinic-text flex items-center gap-1"
                      >
                        <Edit3 size={12} />
                        <span>تعديل</span>
                      </button>
                      <button
                        onClick={() => handleDeleteVisit(visit.id, visit.date)}
                        className="py-1.5 px-3 bg-red-50 border border-red-100 hover:bg-red-100 rounded-lg active:scale-95 transition-all text-xs font-bold text-clinic-coral flex items-center gap-1"
                      >
                        <Trash2 size={12} />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-clinic-card border border-clinic-border border-dashed rounded-2xl p-8 text-center text-gray-400">
              لا توجد زيارات مسجلة لهذا المريض حتى الآن.
            </div>
          )}
        </div>
      </div>

      {/* VISIT DETAIL MODAL */}
      {selectedVisit && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6 text-right shadow-2xl border border-clinic-border flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-clinic-teal">تفاصيل الزيارة</h3>
                {selectedVisit.visit_type === 'followup' ? (
                  <span className="text-[10px] font-extrabold bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5 rounded-full">
                    استشارة
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">
                    كشف
                  </span>
                )}
              </div>
              <button onClick={() => setSelectedVisit(null)} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-4 text-sm text-clinic-text">
              <div>
                <span className="block text-xs text-gray-400 font-bold mb-1">التاريخ</span>
                <p className="font-semibold text-base">{new Date(selectedVisit.date).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>

              <div>
                <span className="block text-xs text-gray-400 font-bold mb-1">المدفوع</span>
                <p className="font-extrabold text-clinic-teal text-base">{selectedVisit.amount_paid} ج.م</p>
              </div>

              {selectedVisit.complaint_text && (
                <div>
                  <span className="block text-xs text-gray-400 font-bold mb-1">الشكوى</span>
                  <p className="bg-gray-50 border border-clinic-border rounded-xl p-3 whitespace-pre-wrap">{selectedVisit.complaint_text}</p>
                </div>
              )}

              {selectedVisit.complaint_audio_url && signedMedia[`${selectedVisit.id}_audio`] && (
                <div>
                  <span className="block text-xs text-gray-400 font-bold mb-1">التسجيل الصوتي للشكوى</span>
                  <audio src={signedMedia[`${selectedVisit.id}_audio`]} controls className="w-full mt-1" />
                </div>
              )}

              {/* Clinical details hidden per clinical workflow request */}

              {selectedVisit.follow_up_date && (
                <div>
                  <span className="block text-xs text-gray-400 font-bold mb-1">موعد المتابعة القادمة</span>
                  <p className="font-semibold">{new Date(selectedVisit.follow_up_date).toLocaleDateString('ar-EG')}</p>
                </div>
              )}

              {selectedVisit.prescription_image_url && signedMedia[`${selectedVisit.id}_img`] && (
                <div>
                  <span className="block text-xs text-gray-400 font-bold mb-1">صورة الروشتة</span>
                  <img
                    src={signedMedia[`${selectedVisit.id}_img`]}
                    alt="صورة الروشتة"
                    onClick={() => setZoomPhotoUrl(signedMedia[`${selectedVisit.id}_img`])}
                    className="w-full rounded-xl border border-clinic-border shadow-sm max-h-48 object-contain mt-1 cursor-zoom-in"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-gray-100 pt-3 mt-2">
              <button
                onClick={() => { startEditVisit(selectedVisit); }}
                className="flex-1 py-3 bg-clinic-teal text-white font-bold rounded-xl text-center shadow-sm"
              >
                تعديل الزيارة
              </button>
              <button
                onClick={() => setSelectedVisit(null)}
                className="flex-1 py-3 bg-gray-100 border border-clinic-border text-clinic-text font-bold rounded-xl text-center"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL SCREEN ZOOM PHOTO VIEWER */}
      {zoomPhotoUrl && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
          <button
            onClick={() => setZoomPhotoUrl(null)}
            className="absolute top-4 left-4 p-2 bg-white/10 text-white rounded-full hover:bg-white/20 active:scale-95 transition-all"
          >
            <X size={24} />
          </button>
          <img src={zoomPhotoUrl} alt="الروشتة بالتكبير" className="max-w-full max-h-[90vh] object-contain rounded shadow" />
        </div>
      )}

      {/* EDIT PATIENT DETAILS MODAL */}
      {isEditingPatient && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-right shadow-2xl border border-clinic-border flex flex-col gap-4">
            <h3 className="text-lg font-bold text-clinic-teal border-b border-gray-100 pb-2">تعديل بيانات المريض</h3>
            
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">الاسم ثلاثي</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-clinic-border focus:outline-none focus:border-clinic-teal"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">السن</label>
                <input
                  type="text"
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-clinic-border focus:outline-none focus:border-clinic-teal"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">البلد / القرية</label>
                <input
                  type="text"
                  value={editVillage}
                  onChange={(e) => setEditVillage(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-clinic-border focus:outline-none focus:border-clinic-teal"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-clinic-border focus:outline-none focus:border-clinic-teal"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSavePatientDetails}
                className="flex-1 py-3 bg-clinic-teal text-white font-bold rounded-xl text-center"
              >
                حفظ التعديلات
              </button>
              <button
                onClick={() => setIsEditingPatient(false)}
                className="flex-1 py-3 bg-gray-100 border border-clinic-border text-clinic-text font-bold rounded-xl text-center"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT VISIT MODAL */}
      {editingVisit && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6 text-right shadow-2xl border border-clinic-border flex flex-col gap-4">
            <h3 className="text-lg font-bold text-clinic-teal border-b border-gray-100 pb-2">تعديل بيانات الزيارة</h3>

            <div className="flex flex-col gap-3 text-sm">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">حالة المريض (هل هو كشف جديد أم استشارة؟)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingVisit({ ...editingVisit, visit_type: 'checkup', amount_paid: 200 })}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      editingVisit.visit_type !== 'followup'
                        ? 'bg-clinic-teal text-white border-clinic-teal shadow-xs'
                        : 'bg-white text-clinic-text border-clinic-border hover:bg-gray-50'
                    }`}
                  >
                    كشف جديد (200 ج.م)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingVisit({ ...editingVisit, visit_type: 'followup', amount_paid: 70 })}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      editingVisit.visit_type === 'followup'
                        ? 'bg-clinic-teal text-white border-clinic-teal shadow-xs'
                        : 'bg-white text-clinic-text border-clinic-border hover:bg-gray-50'
                    }`}
                  >
                    استشارة متابعة (70 ج.م)
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">المبلغ المدفوع (ج.م)</label>
                <input
                  type="number"
                  value={editingVisit.amount_paid}
                  onChange={(e) => setEditingVisit({ ...editingVisit, amount_paid: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 rounded-xl border border-clinic-border focus:outline-none focus:border-clinic-teal font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">الشكوى</label>
                <textarea
                  rows={3}
                  value={editingVisit.complaint_text}
                  onChange={(e) => setEditingVisit({ ...editingVisit, complaint_text: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-clinic-border focus:outline-none focus:border-clinic-teal resize-none"
                />
              </div>
              {/* Clinical inputs removed per workflow simplification */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">موعد المتابعة القادم</label>
                <input
                  type="date"
                  value={editingVisit.follow_up_date || ''}
                  onChange={(e) => setEditingVisit({ ...editingVisit, follow_up_date: e.target.value || null })}
                  className="w-full px-3 py-2.5 rounded-xl border border-clinic-border focus:outline-none focus:border-clinic-teal text-right"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSaveVisitEdits}
                className="flex-1 py-3 bg-clinic-teal text-white font-bold rounded-xl text-center"
              >
                حفظ
              </button>
              <button
                onClick={() => setEditingVisit(null)}
                className="flex-1 py-3 bg-gray-100 border border-clinic-border text-clinic-text font-bold rounded-xl text-center"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD VISIT MODAL */}
      {isAddingVisit && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6 text-right shadow-2xl border border-clinic-border flex flex-col gap-4">
            <h3 className="text-lg font-bold text-clinic-teal border-b border-gray-100 pb-2">تسجيل زيارة متابعة جديدة</h3>
            
            <p className="text-xs text-gray-400">سيتم ربط الزيارة تلقائياً بملف المريض: {patient.full_name}</p>

            <div className="flex flex-col gap-3 text-sm">
              <div>
                <label className="block text-xs font-bold text-clinic-text mb-1.5">حالة المريض (هل هو كشف جديد أم استشارة؟) *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewVisitType('checkup');
                      setNewVisitAmount('200');
                    }}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                      newVisitType === 'checkup'
                        ? 'bg-clinic-teal text-white border-clinic-teal shadow-xs'
                        : 'bg-white text-clinic-text border-clinic-border hover:bg-gray-50'
                    }`}
                  >
                    كشف جديد (200 ج.م)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewVisitType('followup');
                      setNewVisitAmount('70');
                    }}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                      newVisitType === 'followup'
                        ? 'bg-clinic-teal text-white border-clinic-teal shadow-xs'
                        : 'bg-white text-clinic-text border-clinic-border hover:bg-gray-50'
                    }`}
                  >
                    استشارة متابعة (70 ج.م)
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-clinic-text mb-1">المبلغ المدفوع (ج.م) *</label>
                <input
                  type="number"
                  value={newVisitAmount}
                  onChange={(e) => setNewVisitAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-clinic-border focus:outline-none focus:border-clinic-teal font-bold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-clinic-text mb-1">الشكوى</label>
                <textarea
                  rows={3}
                  value={newVisitComplaint}
                  onChange={(e) => setNewVisitComplaint(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-clinic-border focus:outline-none focus:border-clinic-teal resize-none"
                  placeholder="شكوى المريض الحالية..."
                />
              </div>
              {/* Clinical inputs removed per workflow simplification */}
              <div>
                <label className="block text-xs font-bold text-clinic-text mb-1">موعد المتابعة القادمة</label>
                <input
                  type="date"
                  value={newVisitFollowUp}
                  onChange={(e) => setNewVisitFollowUp(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-clinic-border focus:outline-none focus:border-clinic-teal text-right"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleAddNewVisit}
                className="flex-1 py-3 bg-clinic-teal text-white font-bold rounded-xl text-center shadow-sm"
              >
                تسجيل وحفظ
              </button>
              <button
                onClick={() => setIsAddingVisit(false)}
                className="flex-1 py-3 bg-gray-100 border border-clinic-border text-clinic-text font-bold rounded-xl text-center"
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
