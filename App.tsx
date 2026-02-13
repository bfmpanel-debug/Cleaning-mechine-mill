
import React, { useState, useMemo } from 'react';
import { LogEntry, ViewState } from './types';

// Pastikan URL ini adalah URL "Web App" yang sudah di-deploy sebagai "Anyone"
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwL5QQtvqlMhOzUcXNVPhTmXY0qB2GKH02STUNlKG3z376wXorF8ApfKBR-ZF_4GV3Q/exec'; 

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('HOME');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [machineFilter, setMachineFilter] = useState('');

  const [formData, setFormData] = useState({
    nomorMesin: '',
    namaOperator: '',
    tanggalCleaning: new Date().toISOString().split('T')[0]
  });

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const parseDate = (dateVal: any): Date | null => {
    if (!dateVal) return null;
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatDateDisplay = (date: Date | null) => {
    if (!date) return "-";
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Menambahkan cache buster untuk memastikan data terbaru di localhost
      const response = await fetch(`${SCRIPT_URL}?t=${Date.now()}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      setLogs(data);
    } catch (error) {
      console.error('Error fetching data:', error);
      const saved = localStorage.getItem('maintenance_logs');
      if (saved) setLogs(JSON.parse(saved));
      showMessage('error', 'Gagal memuat data. Periksa koneksi atau Deployment Script.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const waktuSistem = new Date().toLocaleString('id-ID', { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    });

    const currentMachine = formData.nomorMesin;
    const params = new URLSearchParams();
    params.append('waktuSistem', waktuSistem);
    params.append('nomorMesin', currentMachine);
    params.append('namaOperator', formData.namaOperator);
    params.append('tanggalCleaning', formData.tanggalCleaning);

    try {
      // Menggunakan mode: 'no-cors' karena GAS tidak mendukung preflight OPTIONS
      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      
      // Karena no-cors tidak bisa membaca status, kita asumsikan sukses jika tidak ada network error
      showMessage('success', `Data mesin ${currentMachine} berhasil dikirim!`);
      
      const newEntry: LogEntry = {
        waktuSistem,
        nomorMesin: currentMachine,
        namaOperator: formData.namaOperator,
        tanggalCleaning: formData.tanggalCleaning
      };
      
      const updatedLogs = [newEntry, ...logs];
      localStorage.setItem('maintenance_logs', JSON.stringify(updatedLogs));
      setLogs(updatedLogs);

      setFormData({ 
        nomorMesin: '', 
        namaOperator: '', 
        tanggalCleaning: new Date().toISOString().split('T')[0] 
      });
      
      setTimeout(() => setView('HOME'), 2000);
    } catch (error) {
      showMessage('error', 'Terjadi kesalahan pengiriman.');
    } finally {
      setLoading(false);
    }
  };

  const logsWithStatus = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const machineGroups: Record<string, any[]> = {};
    logs.forEach(log => {
      if (!machineGroups[log.nomorMesin]) machineGroups[log.nomorMesin] = [];
      machineGroups[log.nomorMesin].push(log);
    });

    const processedLogs: any[] = [];

    Object.keys(machineGroups).forEach(machineNo => {
      const sortedGroup = [...machineGroups[machineNo]].sort((a, b) => {
        const da = parseDate(a.tanggalCleaning)?.getTime() || 0;
        const db = parseDate(b.tanggalCleaning)?.getTime() || 0;
        return da - db;
      });

      sortedGroup.forEach((log, index) => {
        const currentCleaningDate = parseDate(log.tanggalCleaning);
        if (!currentCleaningDate) return;

        const nextTargetDate = new Date(currentCleaningDate);
        nextTargetDate.setDate(nextTargetDate.getDate() + 30);

        let isOperatorLate = false;
        let isTargetMissed = false;

        // CEK 1: Apakah operator ini terlambat datang? (Bandingkan dengan target record sebelumnya)
        if (index > 0) {
          const prevLog = sortedGroup[index - 1];
          const prevCleaningDate = parseDate(prevLog.tanggalCleaning);
          if (prevCleaningDate) {
            const prevTarget = new Date(prevCleaningDate);
            prevTarget.setDate(prevTarget.getDate() + 30);
            
            if (currentCleaningDate > prevTarget) {
              isOperatorLate = true; // Merah untuk Operator & Tgl Cleaning
            }
          }
        }

        // CEK 2: Apakah target record ini terlewatkan? (Bandingkan dengan record setelahnya atau hari ini)
        if (index < sortedGroup.length - 1) {
          const nextLog = sortedGroup[index + 1];
          const nextActualDate = parseDate(nextLog.tanggalCleaning);
          if (nextActualDate && nextActualDate > nextTargetDate) {
            isTargetMissed = true; // Merah untuk Next Target
          }
        } else {
          if (today > nextTargetDate) {
            isTargetMissed = true; 
          }
        }

        processedLogs.push({
          ...log,
          nextCleaningDate: nextTargetDate,
          isOperatorLate,
          isTargetMissed
        });
      });
    });

    return processedLogs.sort((a, b) => {
      const da = parseDate(a.tanggalCleaning)?.getTime() || 0;
      const db = parseDate(b.tanggalCleaning)?.getTime() || 0;
      return db - da;
    });
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!machineFilter.trim()) return logsWithStatus;
    return logsWithStatus.filter(log => 
      log.nomorMesin.toLowerCase().includes(machineFilter.toLowerCase())
    );
  }, [logsWithStatus, machineFilter]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 overflow-x-hidden font-sans">
      <header className="bg-gradient-to-r from-indigo-900 to-blue-800 text-white py-6 shadow-2xl mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
        <div className="container mx-auto px-6 relative flex justify-between items-center">
          <div className="mx-auto sm:mx-0">
            <h1 className="text-xl md:text-2xl font-black tracking-tight leading-none uppercase">Machine Logger</h1>
            <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest mt-1">LOG_UPDATE System</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-2xl">
        {message && (
          <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border-b-4 transition-all duration-500 animate-bounce ${
            message.type === 'success' ? 'bg-emerald-500 text-white border-emerald-700' : 'bg-rose-500 text-white border-rose-700'
          }`}>
            <span className="text-xl">{message.type === 'success' ? '🛡️' : '⚠️'}</span>
            <p className="font-black text-sm tracking-tight">{message.text}</p>
          </div>
        )}

        {view === 'HOME' && (
          <div className="flex flex-col items-center justify-center gap-6 mt-10 animate-in fade-in zoom-in-95 duration-700">
            <button onClick={() => setView('UPDATE')} className="group w-full max-w-xs bg-white p-8 rounded-[2rem] shadow-xl border-2 border-slate-100 hover:border-indigo-500 hover:shadow-indigo-100 transition-all duration-300 transform hover:-translate-y-2 flex flex-col items-center">
              <div className="bg-indigo-50 text-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
              </div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Update Data</h2>
              <p className="text-slate-400 text-xs font-bold mt-2">Input Aktivitas Baru</p>
            </button>

            <button onClick={() => { setView('CHECK'); fetchData(); }} className="group w-full max-w-xs bg-white p-8 rounded-[2rem] shadow-xl border-2 border-slate-100 hover:border-emerald-500 hover:shadow-emerald-100 transition-all duration-300 transform hover:-translate-y-2 flex flex-col items-center">
              <div className="bg-emerald-50 text-emerald-600 w-16 h-16 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-500">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
              </div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Check Data</h2>
              <p className="text-slate-400 text-xs font-bold mt-2">Audit Riwayat Log</p>
            </button>
          </div>
        )}

        {view === 'UPDATE' && (
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-8">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
              <h2 className="text-lg font-black text-slate-800 uppercase">Form Update</h2>
              <button onClick={() => setView('HOME')} className="p-2 hover:bg-slate-200 rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 ml-1">Nomor Mesin</label>
                  <input required type="text" placeholder="M-3001" className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-500 outline-none transition-all font-bold" value={formData.nomorMesin} onChange={e => setFormData({...formData, nomorMesin: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 ml-1">Nama Operator</label>
                  <input required type="text" placeholder="Nama" className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-500 outline-none transition-all font-bold" value={formData.namaOperator} onChange={e => setFormData({...formData, namaOperator: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 ml-1">Tanggal Cleaning</label>
                  <input required type="date" className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-500 outline-none transition-all font-bold" value={formData.tanggalCleaning} onChange={e => setFormData({...formData, tanggalCleaning: e.target.value})} />
                </div>
              </div>
              <button disabled={loading} type="submit" className="w-full bg-indigo-600 text-white font-black text-lg py-5 rounded-2xl hover:bg-indigo-700 shadow-xl transition-all active:scale-95 disabled:opacity-50">
                {loading ? 'MENGIRIM...' : 'SIMPAN KE DATABASE'}
              </button>
            </form>
          </div>
        )}

        {view === 'CHECK' && (
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in">
            <div className="p-6 border-b border-slate-50">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-black text-slate-800 uppercase">Riwayat</h2>
                <div className="flex gap-2">
                  <button onClick={fetchData} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl">
                     <svg className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  </button>
                  <button onClick={() => setView('HOME')} className="p-2 text-slate-300 hover:bg-slate-100 rounded-xl">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              </div>
              <input type="text" placeholder="Cari No. Mesin..." className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-emerald-400 outline-none transition-all font-bold text-sm" value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)} />
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Mesin/Operator</th>
                    <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tgl Cleaning</th>
                    <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Target Berikutnya</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[11px]">
                  {filteredLogs.map((log: any, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded w-fit mb-1">{log.nomorMesin}</span>
                          <span className={`font-black uppercase ${log.isOperatorLate ? 'text-rose-600' : 'text-slate-400'}`}>
                            {log.namaOperator}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                         <span className={`px-2 py-1 rounded-md font-black border ${
                           log.isOperatorLate ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-white text-slate-600 border-slate-200'
                         }`}>
                            {formatDateDisplay(parseDate(log.tanggalCleaning))}
                         </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                         <div className={`inline-flex flex-col items-end px-3 py-1 rounded-xl border-2 transition-all ${
                           log.isTargetMissed ? 'bg-rose-600 text-white border-rose-700 shadow-lg shadow-rose-100' : 'bg-emerald-600 text-white border-emerald-700 shadow-lg shadow-emerald-100'
                         }`}>
                            <span className="font-black uppercase tracking-tight">
                              {formatDateDisplay(log.nextCleaningDate)}
                            </span>
                            <span className="text-[8px] font-black opacity-80 uppercase leading-none mt-0.5">
                              {log.isTargetMissed ? 'OVERDUE' : 'ON TRACK'}
                            </span>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
