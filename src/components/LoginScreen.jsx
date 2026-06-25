import React, { useState } from 'react';
import { Lock, User, KeyRound } from 'lucide-react';

export default function LoginScreen({ onLogin, savedPin }) {
  const [pin, setPin] = useState('');
  const [selectedUser, setSelectedUser] = useState('Dr. Bassma'); // default
  const [error, setError] = useState('');

  const users = [
    { id: 'Dr. Bassma', name: 'د. بسمة (طبيبة)' },
    { id: 'Assistant 1', name: 'المساعد ١' },
    { id: 'Assistant 2', name: 'المساعد ٢' }
  ];

  const handleKeyPress = (num) => {
    setError('');
    if (pin.length < 6) {
      setPin(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    setError('');
    setPin(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setError('');
    setPin('');
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();

    const expectedPin = savedPin || '1234';
    if (pin === expectedPin) {
      const displayName = users.find(u => u.id === selectedUser)?.name || selectedUser;
      onLogin({ username: selectedUser, displayName });
    } else {
      setError('الرمز السري غير صحيح. حاول مرة أخرى.');
      setPin('');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-clinic-bg px-4 py-8 select-none">
      <div className="w-full max-w-md bg-clinic-card rounded-2xl shadow-lg border border-clinic-border p-6 text-center">
        {/* Header Logo & Title */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-clinic-teal text-white rounded-full flex items-center justify-center mb-3 shadow">
            <KeyRound size={32} />
          </div>
          <h1 className="text-2xl font-bold text-clinic-teal mb-1">عيادة د. بسمة</h1>
          <p className="text-gray-500 text-sm">نظام إدارة المرضى الداخلي</p>
        </div>

        {/* User Role Selection */}
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-semibold mb-2 text-right">
            اختر المستخدم:
          </label>
          <div className="grid grid-cols-3 gap-2">
            {users.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => setSelectedUser(u.id)}
                className={`py-3 px-1 rounded-xl border text-xs font-semibold transition-all ${
                  selectedUser === u.id
                    ? 'bg-clinic-teal text-white border-clinic-teal shadow-md'
                    : 'bg-white text-clinic-text border-clinic-border hover:bg-gray-50'
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <User size={16} />
                  <span>{u.name.split(' ')[0]}</span>
                  <span className="text-[10px] opacity-75">{u.name.split(' ')[1] || ''}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* PIN Input Display */}
        <div className="mb-6">
          <div className="flex justify-center gap-3 mb-2">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border transition-all duration-150 ${
                  i < pin.length
                    ? 'bg-clinic-teal border-clinic-teal scale-110'
                    : 'bg-gray-100 border-gray-300'
                }`}
              />
            ))}
          </div>
          {error && <p className="text-clinic-coral text-sm mt-2 font-medium">{error}</p>}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleKeyPress(num.toString())}
              className="h-14 text-xl font-bold bg-gray-50 border border-clinic-border hover:bg-gray-100 rounded-xl active:bg-gray-200 transition-colors flex items-center justify-center text-clinic-text"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-14 text-sm font-bold text-clinic-coral bg-gray-50 border border-clinic-border hover:bg-gray-100 rounded-xl active:bg-gray-200 transition-colors flex items-center justify-center"
          >
            مسح الكل
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="h-14 text-xl font-bold bg-gray-50 border border-clinic-border hover:bg-gray-100 rounded-xl active:bg-gray-200 transition-colors flex items-center justify-center text-clinic-text"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-14 text-sm font-bold text-gray-500 bg-gray-50 border border-clinic-border hover:bg-gray-100 rounded-xl active:bg-gray-200 transition-colors flex items-center justify-center"
          >
            تراجع
          </button>
        </div>

        {/* Enter Button */}
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={pin.length < 4}
          className={`w-full py-4 rounded-xl text-lg font-bold text-white shadow-md transition-all ${
            pin.length >= 4
              ? 'bg-clinic-teal active:scale-95 cursor-pointer'
              : 'bg-gray-300 cursor-not-allowed shadow-none'
          }`}
        >
          دخول
        </button>

        {/* Forgotten password helper */}
        <div className="mt-6 text-center">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert("إذا نسيت الرقم السري، يرجى التواصل مع المسؤول لإعادة ضبطه من ملف الإعدادات في التليجرام.");
            }}
            className="text-clinic-teal hover:underline text-xs"
          >
            نسيت الرقم السري؟
          </a>
        </div>
      </div>
    </div>
  );
}
