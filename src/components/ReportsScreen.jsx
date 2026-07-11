import React, { useState, useRef } from 'react';
import { Calendar, Download, Send, Share2, Printer, CheckCircle, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { uploadFile, getSignedUrl } from '../services/supabaseService';
import { sendAuditLog } from '../services/telegramService';

export default function ReportsScreen({ db, currentUser }) {
  const [reportType, setReportType] = useState('daily'); // daily, monthly
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  const dailyReportRef = useRef(null);
  const monthlyReportRef = useRef(null);

  const getTodayDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const todayStr = getTodayDateString();

  // Find daily stats
  const todayVisits = db.visits?.filter(v => v.date === todayStr && !v.is_deleted) || [];
  const dailyPatientsCount = todayVisits.length;
  const dailyCheckupsCount = todayVisits.filter(v => v.visit_type !== 'followup').length;
  const dailyFollowupsCount = todayVisits.filter(v => v.visit_type === 'followup').length;
  const dailyTotalRevenue = todayVisits.reduce((sum, v) => sum + (Number(v.amount_paid) || 0), 0);

  // Find monthly stats
  const monthlyVisits = db.visits?.filter(v => v.date.startsWith(selectedMonth) && !v.is_deleted) || [];
  const monthlyDays = db.days?.filter(d => d.date.startsWith(selectedMonth)) || [];
  
  const openDaysCount = monthlyDays.filter(d => d.status === 'open' || d.status === 'closed').length;
  const monthlyPatientsCount = monthlyVisits.length;
  const monthlyCheckupsCount = monthlyVisits.filter(v => v.visit_type !== 'followup').length;
  const monthlyFollowupsCount = monthlyVisits.filter(v => v.visit_type === 'followup').length;
  const monthlyTotalRevenue = monthlyVisits.reduce((sum, v) => sum + (Number(v.amount_paid) || 0), 0);
  const avgPatientsPerDay = openDaysCount > 0 ? (monthlyPatientsCount / openDaysCount).toFixed(1) : 0;

  // Generate date list in that month
  const monthlyBreakdown = {};
  monthlyVisits.forEach(v => {
    if (!monthlyBreakdown[v.date]) {
      monthlyBreakdown[v.date] = { patients: 0, revenue: 0, checkups: 0, followups: 0 };
    }
    monthlyBreakdown[v.date].patients += 1;
    monthlyBreakdown[v.date].revenue += Number(v.amount_paid) || 0;
    if (v.visit_type === 'followup') {
      monthlyBreakdown[v.date].followups += 1;
    } else {
      monthlyBreakdown[v.date].checkups += 1;
    }
  });

  // Split daily visits for dual-column layout (only uses 2 columns if length > 1)
  const dailyHalf = Math.ceil(todayVisits.length / 2);
  const dailyLeft = todayVisits.slice(0, dailyHalf);
  const dailyRight = todayVisits.slice(dailyHalf);

  // Split monthly breakdown dates
  const monthlyDates = Object.keys(monthlyBreakdown).sort((a, b) => new Date(b) - new Date(a));
  const monthlyHalf = Math.ceil(monthlyDates.length / 2);
  const monthlyLeft = monthlyDates.slice(0, monthlyHalf);
  const monthlyRight = monthlyDates.slice(monthlyHalf);

  // Arabic date for today
  const todayArabicDate = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Arabic selected month name
  const getSelectedMonthArabicName = () => {
    const [year, month] = selectedMonth.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
  };

  // Helper to generate PDF from React HTML Ref
  const generateReportPdfBlob = async (ref, fileName) => {
    const element = ref.current;
    if (!element) return null;

    const originalStyle = element.style.cssText;
    element.style.padding = '20px';
    element.style.background = '#FFFFFF';
    element.style.color = '#2C3E50';

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: false,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      element.style.cssText = originalStyle; // Restore styles

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; 
      const pageHeight = 295; 
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      return {
        blob: pdf.output('blob'),
        pdf
      };
    } catch (e) {
      console.error("PDF canvas render error:", e);
      alert("حدث خطأ أثناء معالجة الصور والتصميم: " + e.message + "\nتلميح: يمكنك استخدام زر 'طباعة ورقية 🖨️' لحفظ التقرير كملف PDF نظيف وعالي الجودة.");
      element.style.cssText = originalStyle;
      return null;
    }
  };

  // Trigger browser download of PDF
  const handleDownloadPdf = async () => {
    setIsLoading(true);
    setSuccessMsg('');
    
    const activeRef = reportType === 'daily' ? dailyReportRef : monthlyReportRef;
    const name = reportType === 'daily' 
      ? `تقرير_يوم_${todayStr}.pdf` 
      : `تقرير_شهر_${selectedMonth}.pdf`;

    const result = await generateReportPdfBlob(activeRef, name);
    setIsLoading(false);

    if (result) {
      result.pdf.save(name);
      setSuccessMsg('تم تحميل ملف الـ PDF بنجاح على جهازك.');
    } else {
      alert('فشل توليد ملف التقرير.');
    }
  };

  // Send report to Telegram Bot Channel
  const handleSendToTelegram = async () => {
    if (!db.settings?.telegram_bot_token || !db.settings?.telegram_chat_id) {
      return alert("يرجى ضبط إعدادات التليجرام أولاً لإرسال التقارير.");
    }
    if (!db.settings?.supabase_url) {
      return alert("يرجى ضبط إعدادات Supabase لرفع ملفات الـ PDF ومشاركتها.");
    }

    setIsLoading(true);
    setSuccessMsg('');

    const activeRef = reportType === 'daily' ? dailyReportRef : monthlyReportRef;
    const reportName = reportType === 'daily' ? `daily_${todayStr}` : `monthly_${selectedMonth}`;
    const fileName = `report_${reportName}_${Date.now()}.pdf`;

    const result = await generateReportPdfBlob(activeRef, fileName);

    if (!result) {
      setIsLoading(false);
      return alert("فشل إنشاء ملف الـ PDF.");
    }

    try {
      // 1. Upload to Supabase Storage
      await uploadFile('reports', fileName, result.blob);
      
      // 2. Generate signed URL
      const signedUrl = await getSignedUrl('reports', fileName);

      // 3. Post summary and download link to Telegram
      const token = db.settings.telegram_bot_token;
      const chatId = db.settings.telegram_chat_id;

      let msg = "";
      if (reportType === 'daily') {
        msg = `📄 <b>تقرير يوم العمل (${todayArabicDate}):</b>\n`;
        msg += `👥 عدد الحالات: ${dailyPatientsCount} حالة (${dailyCheckupsCount} كشف · ${dailyFollowupsCount} استشارة)\n`;
        msg += `💰 إجمالي الدخل: ${dailyTotalRevenue} ج.م\n`;
        msg += `🔗 رابط تحميل ملف التقرير: <a href="${signedUrl}">تحميل PDF</a>\n`;
        msg += `بواسطة: ${currentUser.displayName}`;
      } else {
        msg = `📊 <b>تقرير الشهر (${getSelectedMonthArabicName()}):</b>\n`;
        msg += `🗓️ أيام العمل المفتوحة: ${openDaysCount} يوم\n`;
        msg += `👥 إجمالي المرضى: ${monthlyPatientsCount} مريض (${monthlyCheckupsCount} كشف · ${monthlyFollowupsCount} استشارة)\n`;
        msg += `💰 إجمالي الدخل الشهري: ${monthlyTotalRevenue} ج.م\n`;
        msg += `📈 متوسط المرضى يومياً: ${avgPatientsPerDay} حالة/يوم\n`;
        msg += `🔗 رابط تحميل التقرير الشهري: <a href="${signedUrl}">تحميل PDF</a>\n`;
        msg += `بواسطة: ${currentUser.displayName}`;
      }

      await sendAuditLog(token, chatId, msg);
      
      setIsLoading(false);
      setSuccessMsg('تم رفع التقرير إلى Supabase وإرسال رابط التحميل لقناة التليجرام بنجاح! 🚀');

    } catch (err) {
      console.error("Failed to send report to Telegram:", err);
      alert("فشل إرسال التقرير: " + err.message);
      setIsLoading(false);
    }
  };

  // Share report link
  const handleShareReport = async () => {
    setIsLoading(true);
    const activeRef = reportType === 'daily' ? dailyReportRef : monthlyReportRef;
    const fileName = `report_${reportType}_${Date.now()}.pdf`;
    
    const result = await generateReportPdfBlob(activeRef, fileName);
    setIsLoading(false);

    if (!result) return alert("فشل إنشاء ملف التقرير.");

    if (navigator.canShare && navigator.share) {
      try {
        const file = new File([result.blob], fileName, { type: 'application/pdf' });
        await navigator.share({
          files: [file],
          title: `تقرير عيادة د. بسمة`,
          text: `تقرير عيادة د. بسمة للأمراض الصدرية - ${reportType === 'daily' ? todayArabicDate : getSelectedMonthArabicName()}`
        });
      } catch (err) {
        console.warn("Sharing failed:", err);
      }
    } else {
      result.pdf.save(fileName);
    }
  };

  // Print report natively
  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col pb-24 bg-clinic-bg text-right print:bg-white print:pb-0">
      {/* Header (Hidden on Print) */}
      <div className="bg-white border-b border-clinic-border p-4 shadow-sm print:hidden">
        <h1 className="text-xl font-bold text-clinic-teal mb-3">التقارير المالية واليومية</h1>
        
        {/* Tab Selector */}
        <div className="flex gap-2">
          <button
            onClick={() => { setReportType('daily'); setSuccessMsg(''); }}
            className={`flex-1 py-3 rounded-xl font-bold transition-all text-sm border ${
              reportType === 'daily'
                ? 'bg-clinic-teal text-white border-clinic-teal shadow-md'
                : 'bg-white text-clinic-text border-clinic-border'
            }`}
          >
            تقرير اليوم
          </button>
          <button
            onClick={() => { setReportType('monthly'); setSuccessMsg(''); }}
            className={`flex-1 py-3 rounded-xl font-bold transition-all text-sm border ${
              reportType === 'monthly'
                ? 'bg-clinic-teal text-white border-clinic-teal shadow-md'
                : 'bg-white text-clinic-text border-clinic-border'
            }`}
          >
            التقرير الشهري
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-6 print:p-0 print:gap-0">
        {/* Month Selector for Monthly Report (Hidden on Print) */}
        {reportType === 'monthly' && (
          <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm print:hidden">
            <label className="block text-sm font-bold text-gray-500 mb-2">اختر الشهر المراد تصديره:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(e.target.value); setSuccessMsg(''); }}
              className="w-full px-4 py-2.5 rounded-xl border border-clinic-border text-right text-base font-semibold"
            />
          </div>
        )}

        {/* Action Panel (Hidden on Print) */}
        <div className="bg-clinic-card border border-clinic-border rounded-2xl p-4 shadow-sm flex flex-col gap-3 print:hidden">
          <h3 className="text-sm font-bold text-gray-700">خيارات التصدير والطباعة</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleDownloadPdf}
              disabled={isLoading}
              className="py-3 px-3 bg-gray-50 border border-clinic-border hover:bg-gray-100 active:scale-95 text-clinic-text rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <Download size={16} className="text-clinic-teal" />
              <span>تحميل PDF</span>
            </button>
            <button
              onClick={handleSendToTelegram}
              disabled={isLoading}
              className="py-3 px-3 bg-gray-50 border border-clinic-border hover:bg-gray-100 active:scale-95 text-clinic-text rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <Send size={16} className="text-clinic-teal" />
              <span>إرسال لتلجرام</span>
            </button>
            <button
              onClick={handleShareReport}
              disabled={isLoading}
              className="py-3 px-3 bg-gray-50 border border-clinic-border hover:bg-gray-100 active:scale-95 text-clinic-text rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <Share2 size={16} className="text-clinic-teal" />
              <span>مشاركة التقرير</span>
            </button>
            <button
              onClick={handlePrintReport}
              disabled={isLoading}
              className="py-3 px-3 bg-clinic-teal text-white hover:bg-[#095b5e] active:scale-95 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md"
            >
              <Printer size={16} />
              <span>طباعة ورقية 🖨️</span>
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-[11px] leading-relaxed text-right font-medium">
            💡 <strong>تنبيه لمستخدمي التطبيق المنزّل (APK):</strong> إذا كنت تستخدم التطبيق المثبت على الهاتف كبرنامج، فقد يتم حظر التحميل المباشر للـ PDF بواسطة نظام أندرويد. يرجى استخدام زر <strong>"إرسال لتلجرام"</strong> لإرساله مباشرة لقناتك، أو الضغط على <strong>"طباعة ورقية 🖨️"</strong> واختيار <strong>"حفظ كـ PDF"</strong> من قائمة خيارات الطباعة في الهاتف.
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-clinic-teal py-2 text-xs font-bold">
              <Loader2 className="animate-spin" size={16} />
              <span>جاري إنشاء التقرير ورفعه...</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-clinic-mint/20 border border-clinic-mint/40 text-emerald-800 p-3 rounded-xl text-xs font-semibold flex items-start gap-1.5">
              <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* ==================== REPORT RENDER AREA ==================== */}

        {/* DAILY REPORT CONTAINER */}
        {reportType === 'daily' && (
          <div
            ref={dailyReportRef}
            className="print-report bg-white border border-clinic-border rounded-2xl p-5 shadow-sm text-right flex flex-col gap-4 text-clinic-text print:border-none print:shadow-none print:p-0 print:m-0"
          >
            {/* Report Header */}
            <div className="text-center border-b border-gray-100 pb-3">
              <h2 className="text-base font-bold text-clinic-teal">عيادة د. بسمة للأمراض الصدرية</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">تقرير يوم العمل المالي والتشغيلي</p>
              <h3 className="text-xs font-bold text-clinic-text mt-2 bg-gray-50 py-1 px-2.5 rounded-lg inline-block print:bg-white print:border print:border-gray-200">
                التاريخ: {todayArabicDate}
              </h3>
            </div>

            {/* Quick Metrics (Flexbox for html2canvas compatibility) */}
            <div className="flex gap-3">
              <div className="flex-1 border border-gray-100 bg-gray-50/50 rounded-xl p-2 text-center print:bg-white print:border-gray-200">
                <span className="block text-[10px] text-gray-400 font-bold mb-0.5">إجمالي الحالات</span>
                <span className="text-xl font-black text-clinic-teal">{dailyPatientsCount}</span>
                <span className="block text-[9px] text-gray-400 font-bold mt-0.5">({dailyCheckupsCount} كشف · {dailyFollowupsCount} استشارة)</span>
              </div>
              <div className="flex-1 border border-gray-100 bg-gray-50/50 rounded-xl p-2 text-center print:bg-white print:border-gray-200">
                <span className="block text-[10px] text-gray-400 font-bold mb-0.5">إجمالي الإيراد</span>
                <span className="text-xl font-black text-clinic-teal">{dailyTotalRevenue} ج.م</span>
              </div>
            </div>

            {/* Patient Table (Dense Parallel Two-Column Layout) */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 mb-1.5">قائمة المرضى المقيدين اليوم</h3>
              {todayVisits.length > 0 ? (
                <div className="flex gap-3">
                  {/* Left Column Table */}
                  <div className={`overflow-x-auto border border-gray-100 rounded-xl print:border-gray-200 ${dailyRight.length > 0 ? 'flex-1' : 'w-full'}`}>
                    <table className="w-full text-right text-[9px] leading-tight">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 font-bold print:bg-gray-100">
                          <th className="py-1 px-1.5">الاسم</th>
                          <th className="py-1 px-1.5">البلد</th>
                          <th className="py-1 px-1.5 text-left">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyLeft.map((v, i) => {
                          const patient = db.patients?.find(p => p.id === v.patient_id);
                          return (
                            <tr key={v.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 print:border-gray-100">
                              <td className="py-1 px-1.5 font-semibold text-clinic-text truncate max-w-[80px]">
                                {patient?.full_name || 'غير معروف'} {v.visit_type === 'followup' ? '(س)' : '(ك)'}
                              </td>
                              <td className="py-1 px-1.5 text-gray-500 truncate max-w-[55px]">{patient?.village || 'غير معروف'}</td>
                              <td className="py-1 px-1.5 text-left font-bold text-clinic-teal">{v.amount_paid} ج.م</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Right Column Table */}
                  {dailyRight.length > 0 && (
                    <div className="flex-1 overflow-x-auto border border-gray-100 rounded-xl print:border-gray-200">
                      <table className="w-full text-right text-[9px] leading-tight">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 font-bold print:bg-gray-100">
                            <th className="py-1 px-1.5">الاسم</th>
                            <th className="py-1 px-1.5">البلد</th>
                            <th className="py-1 px-1.5 text-left">المبلغ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailyRight.map((v, i) => {
                            const patient = db.patients?.find(p => p.id === v.patient_id);
                            return (
                              <tr key={v.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 print:border-gray-100">
                                <td className="py-1 px-1.5 font-semibold text-clinic-text truncate max-w-[80px]">
                                  {patient?.full_name || 'غير معروف'} {v.visit_type === 'followup' ? '(س)' : '(ك)'}
                                </td>
                                <td className="py-1 px-1.5 text-gray-500 truncate max-w-[55px]">{patient?.village || 'غير معروف'}</td>
                                <td className="py-1 px-1.5 text-left font-bold text-clinic-teal">{v.amount_paid} ج.م</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center py-4 text-xs text-gray-400 bg-gray-50 rounded-xl">
                  لم يتم تسجيل أي زيارات مرضى لهذا اليوم حتى الآن.
                </p>
              )}
            </div>
            
            <div className="text-[9px] text-gray-400 text-center border-t border-gray-50 pt-2.5 mt-1 print:border-gray-200">
              تم تصدير هذا التقرير داخلياً بواسطة نظام العيادة الذكي.
            </div>
          </div>
        )}

        {/* MONTHLY REPORT CONTAINER */}
        {reportType === 'monthly' && (
          <div
            ref={monthlyReportRef}
            className="print-report bg-white border border-clinic-border rounded-2xl p-5 shadow-sm text-right flex flex-col gap-4 text-clinic-text print:border-none print:shadow-none print:p-0 print:m-0"
          >
            {/* Report Header */}
            <div className="text-center border-b border-gray-100 pb-3">
              <h2 className="text-base font-bold text-clinic-teal">عيادة د. بسمة للأمراض الصدرية</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">الالتقرير الشهري المالي العام</p>
              <h3 className="text-xs font-bold text-clinic-text mt-2 bg-gray-50 py-1 px-2.5 rounded-lg inline-block print:bg-white print:border print:border-gray-200">
                شهر: {getSelectedMonthArabicName()}
              </h3>
            </div>

            {/* Monthly Metrics (Flexbox for html2canvas compatibility) */}
            <div className="flex flex-col gap-2.5">
              <div className="flex gap-2.5">
                <div className="flex-1 border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-center print:bg-white print:border-gray-200">
                  <span className="block text-[9px] text-gray-400 font-bold mb-0.5">أيام العمل المفتوحة</span>
                  <span className="text-lg font-black text-clinic-teal">{openDaysCount}</span>
                </div>
                <div className="flex-1 border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-center print:bg-white print:border-gray-200">
                  <span className="block text-[9px] text-gray-400 font-bold mb-0.5">متوسط المرضى يومياً</span>
                  <span className="text-lg font-black text-clinic-teal">{avgPatientsPerDay}</span>
                </div>
              </div>
              <div className="flex gap-2.5">
                <div className="flex-1 border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-center print:bg-white print:border-gray-200">
                  <span className="block text-[9px] text-gray-400 font-bold mb-0.5">إجمالي الحالات</span>
                  <span className="text-lg font-black text-clinic-teal">{monthlyPatientsCount}</span>
                  <span className="block text-[8px] text-gray-400 font-bold mt-0.5">({monthlyCheckupsCount} كشف · {monthlyFollowupsCount} استشارة)</span>
                </div>
                <div className="flex-1 border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-center print:bg-white print:border-gray-200">
                  <span className="block text-[9px] text-gray-400 font-bold mb-0.5">إجمالي الدخل</span>
                  <span className="text-lg font-black text-clinic-teal">{monthlyTotalRevenue} ج.م</span>
                </div>
              </div>
            </div>

            {/* Daily Breakdown Table (Dense Parallel Two-Column Layout) */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 mb-1.5">التفصيل اليومي لشهر العمل</h3>
              {monthlyDates.length > 0 ? (
                <div className="flex gap-3">
                  {/* Left Column Table */}
                  <div className={`overflow-x-auto border border-gray-100 rounded-xl print:border-gray-200 ${monthlyRight.length > 0 ? 'flex-1' : 'w-full'}`}>
                    <table className="w-full text-right text-[9px] leading-tight">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 font-bold print:bg-gray-100">
                          <th className="py-1 px-1.5">التاريخ</th>
                          <th className="py-1 px-1.5">الحالات</th>
                          <th className="py-1 px-1.5 text-left">الدخل</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyLeft.map(date => {
                          const item = monthlyBreakdown[date];
                          return (
                            <tr key={date} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 print:border-gray-100">
                              <td className="py-1 px-1.5 font-semibold text-clinic-text">{new Date(date).toLocaleDateString('ar-EG', {month: 'numeric', day: 'numeric'})}</td>
                              <td className="py-1 px-1.5 text-gray-500">{item.patients} ح ({item.checkups || 0}ك·{item.followups || 0}س)</td>
                              <td className="py-1 px-1.5 text-left font-bold text-clinic-teal">{item.revenue} ج.م</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Right Column Table */}
                  {monthlyRight.length > 0 && (
                    <div className="flex-1 overflow-x-auto border border-gray-100 rounded-xl print:border-gray-200">
                      <table className="w-full text-right text-[9px] leading-tight">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 font-bold print:bg-gray-100">
                            <th className="py-1 px-1.5">التاريخ</th>
                            <th className="py-1 px-1.5">الحالات</th>
                            <th className="py-1 px-1.5 text-left">الدخل</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyRight.map(date => {
                            const item = monthlyBreakdown[date];
                            return (
                              <tr key={date} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 print:border-gray-100">
                                <td className="py-1 px-1.5 font-semibold text-clinic-text">{new Date(date).toLocaleDateString('ar-EG', {month: 'numeric', day: 'numeric'})}</td>
                                <td className="py-1 px-1.5 text-gray-500">{item.patients} ح ({item.checkups || 0}ك·{item.followups || 0}س)</td>
                                <td className="py-1 px-1.5 text-left font-bold text-clinic-teal">{item.revenue} ج.م</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center py-4 text-xs text-gray-400 bg-gray-50 rounded-xl">
                  لا توجد أي زيارات مسجلة لهذا الشهر حتى الآن.
                </p>
              )}
            </div>
            
            <div className="text-[9px] text-gray-400 text-center border-t border-gray-50 pt-2.5 mt-1 print:border-gray-200">
              تم تصدير هذا التقرير شهرياً للأرشفة والمحاسبة.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
