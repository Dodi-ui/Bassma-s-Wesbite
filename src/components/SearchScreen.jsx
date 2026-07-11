import React, { useState, useEffect } from 'react';
import { Search, User, MapPin, Calendar, ArrowLeft } from 'lucide-react';
import { getSignedUrl } from '../services/supabaseService';

export default function SearchScreen({ db, onNavigate, setSelectedPatientId }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, name, village, date

  const patients = db.patients || [];
  const visits = db.visits || [];

  // Helper to find latest visit for a patient
  const getLatestVisit = (patientId) => {
    const patientVisits = visits.filter(v => v.patient_id === patientId);
    if (patientVisits.length === 0) return null;
    // Sort descending
    patientVisits.sort((a, b) => new Date(b.date) - new Date(a.date));
    return patientVisits[0];
  };

  // Filtered patients
  const filteredPatients = patients.filter(patient => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;

    const latestVisit = getLatestVisit(patient.id);

    const nameMatch = patient.full_name?.toLowerCase().includes(q);
    const villageMatch = patient.village?.toLowerCase().includes(q);
    const phoneMatch = patient.phone?.includes(q);
    const dateMatch = latestVisit ? latestVisit.date?.includes(q) : false;
    const complaintMatch = latestVisit ? latestVisit.complaint_text?.toLowerCase().includes(q) : false;

    if (filterType === 'name') return nameMatch;
    if (filterType === 'village') return villageMatch;
    if (filterType === 'date') return dateMatch;

    return nameMatch || villageMatch || phoneMatch || dateMatch || complaintMatch;
  });

  // Sort patients: those with newer visits first
  const sortedPatients = [...filteredPatients].sort((a, b) => {
    const visitA = getLatestVisit(a.id);
    const visitB = getLatestVisit(b.id);
    
    if (!visitA && !visitB) return 0;
    if (!visitA) return 1;
    if (!visitB) return -1;
    
    return new Date(visitB.date) - new Date(visitA.date);
  });

  const [signedAudios, setSignedAudios] = useState({});

  // Sign latest visit audio URLs for display in search cards
  useEffect(() => {
    const signAudios = async () => {
      const urls = {};
      for (const patient of sortedPatients) {
        const latestVisit = getLatestVisit(patient.id);
        if (latestVisit?.complaint_audio_url && db.settings?.supabase_url) {
          try {
            const signed = await getSignedUrl('voice-memos', latestVisit.complaint_audio_url);
            urls[latestVisit.id] = signed;
          } catch (e) {
            console.error("Failed to sign audio in search list:", e);
          }
        }
      }
      setSignedAudios(urls);
    };

    if (sortedPatients.length > 0) {
      signAudios();
    }
  }, [sortedPatients.length, db]);

  const handlePatientTap = (patientId) => {
    setSelectedPatientId(patientId);
    onNavigate('patient-profile');
  };

  return (
    <div className="flex-1 flex flex-col pb-20 bg-clinic-bg text-right">
      {/* Sticky Search Header */}
      <div className="sticky top-0 bg-white border-b border-clinic-border p-4 z-10 flex flex-col gap-3 shadow-sm">
        <div className="relative">
          <input
            type="text"
            placeholder="ابحث بالاسم أو القرية أو التلفون أو التاريخ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-clinic-border focus:border-clinic-teal focus:outline-none text-base font-medium text-right"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'name', label: 'بالاسم' },
            { id: 'village', label: 'بالقرية' },
            { id: 'date', label: 'بالزيارة (تاريخ)' }
          ].map(chip => (
            <button
              key={chip.id}
              onClick={() => setFilterType(chip.id)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                filterType === chip.id
                  ? 'bg-clinic-teal text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results List */}
      <div className="p-4 flex flex-col gap-3">
        {sortedPatients.length > 0 ? (
          sortedPatients.map(patient => {
            const latestVisit = getLatestVisit(patient.id);
            return (
              <div
                key={patient.id}
                onClick={() => handlePatientTap(patient.id)}
                className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm active:scale-98 hover:border-clinic-teal/40 transition-all cursor-pointer flex flex-col gap-2"
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-bold text-clinic-teal flex items-center gap-1.5">
                    <User size={16} />
                    <span>{patient.full_name}</span>
                  </h3>
                  {latestVisit && (
                    <span className="text-xs font-bold text-clinic-text bg-clinic-mint/20 px-2.5 py-1 rounded-lg">
                      {latestVisit.amount_paid} ج.م
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <MapPin size={12} />
                    {patient.village} · {patient.age} سنة
                  </span>
                  {patient.phone && <span>· هاتف: {patient.phone}</span>}
                </div>

                {latestVisit ? (
                  <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-2 text-xs text-gray-400">
                    <div className="flex justify-between items-center w-full">
                      <span className="truncate max-w-[180px] text-clinic-text font-medium">الشكوى: {latestVisit.complaint_text || 'لا يوجد'}</span>
                      <span className="flex items-center gap-1 text-[11px] flex-shrink-0">
                        <Calendar size={12} />
                        آخر زيارة: {new Date(latestVisit.date).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                    {latestVisit.complaint_audio_url && signedAudios[latestVisit.id] && (
                      <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] font-bold text-clinic-teal flex-shrink-0">🎙️ الشكوى الصوتية:</span>
                        <audio src={signedAudios[latestVisit.id]} controls className="h-6 w-36 max-w-full text-xs" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                    لا توجد زيارات مسجلة
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400 gap-3">
            <span className="text-4xl">🔍</span>
            <p className="text-sm font-semibold">مفيش نتائج بحث متطابقة</p>
            <p className="text-xs">تأكد من كتابة الكلمة بشكل صحيح، أو ابحث بفلاتر مختلفة.</p>
          </div>
        )}
      </div>
    </div>
  );
}
