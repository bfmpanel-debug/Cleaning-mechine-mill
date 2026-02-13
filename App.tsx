
import React, { useState, useMemo, useEffect } from 'react';
import { LogEntry, ViewState } from './types';

// Pastikan URL ini adalah URL "Web App" yang sudah di-deploy sebagai "Anyone"
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwL5QQtvqlMhOzUcXNVPhTmXY0qB2GKH02STUNlKG3z376wXorF8ApfKBR-ZF_4GV3Q/exec'; 

// URL Logo menggunakan format thumbnail Google Drive yang lebih stabil untuk browser
const COMPANY_LOGO_URL = 'https://drive.google.com/thumbnail?id=1eBDBs2aDRdb73jnUR2tSMxuSof5vpeVR&sz=w500'; 

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('HOME');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // State untuk pencarian di halaman utama
  const [homeMachineInput, setHomeMachineInput] = useState('');
  const [machineFilter, setMachineFilter] = useState('');

  const [formData, setFormData] = useState({
    nomorMesin: '',
    namaOperator: '',
    tanggalCleaning: new Date().toISOString().split('T')[0]
  });

  // LOGIC AUTO-FILL DARI QR CODE (URL PARAMETER)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const machineFromUrl = params.get('machine') || params.get('m'); 
    
    if (machineFromUrl) {
      const formattedMachine = machineFromUrl.toUpperCase();
      setHomeMachineInput(formattedMachine);
      showMessage('success', `Mesin ${formattedMachine} Terdeteksi!`);
    }
  }, []);

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
      const response = await fetch(`${SCRIPT_URL}?t=${Date.now()}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      setLogs(data);
    } catch (error) {
      console.error('Error fetching data:', error);
      const saved = localStorage.getItem('maintenance_logs');
      if (saved) setLogs(JSON.parse(saved));
      showMessage('error', 'Gagal memuat data dari server.');
    } finally {
      setLoading(false);
    }
  };

  // Fungsi navigasi pintar dengan VALIDASI
  const handleGoToUpdate = () => {
    if (!homeMachineInput.trim()) {
      showMessage('error', 'Silakan isi Nomor Mesin terlebih dahulu!');
      return;
    }
    setFormData(prev => ({ ...prev, nomorMesin: homeMachineInput.toUpperCase() }));
    setView('UPDATE');
  };

  const handleGoToCheck = () => {
    if (!homeMachineInput.trim()) {
      showMessage('error', 'Silakan isi Nomor Mesin untuk mengecek!');
      return;
    }
    setMachineFilter(homeMachineInput);
    setView('CHECK');
    fetchData();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const waktuSistem = new Date().toLocaleString('id-ID', { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    });

    const currentMachine = formData.nomorMesin.toUpperCase();
    const params = new URLSearchParams();
    params.append('waktuSistem', waktuSistem);
    params.append('nomorMesin', currentMachine);
    params.append('namaOperator', formData.namaOperator);
    params.append('tanggalCleaning', formData.tanggalCleaning);

    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      
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
      setHomeMachineInput('');
      
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
      const machineKey = log.nomorMesin.toUpperCase();
      if (!machineGroups[machineKey]) machineGroups[machineKey] = [];
      machineGroups[machineKey].push(log);
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

        if (index > 0) {
          const prevLog = sortedGroup[index - 1];
          const prevCleaningDate = parseDate(prevLog.tanggalCleaning);
          if (prevCleaningDate) {
            const prevTarget = new Date(prevCleaningDate);
            prevTarget.setDate(prevTarget.getDate() + 30);
            if (currentCleaningDate > prevTarget) isOperatorLate = true;
          }
        }

        if (index < sortedGroup.length - 1) {
          const nextLog = sortedGroup[index + 1];
          const nextActualDate = parseDate(nextLog.tanggalCleaning);
          if (nextActualDate && nextActualDate > nextTargetDate) isTargetMissed = true;
        } else {
          if (today > nextTargetDate) isTargetMissed = true; 
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
    const filter = machineFilter.trim().toLowerCase();
    if (!filter) return logsWithStatus;
    return logsWithStatus.filter(log => 
      log.nomorMesin.toLowerCase().includes(filter)
    );
  }, [logsWithStatus, machineFilter]);

  const isInputEmpty = homeMachineInput.trim() === "";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-12 overflow-x-hidden font-sans flex flex-col">
      <header className="bg-slate-900 border-b-4 border-red-600 text-white py-5 shadow-2xl mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="container mx-auto px-6 relative flex flex-row items-center gap-4">
          <div className="bg-white p-1.5 rounded-xl shadow-lg transform transition-transform hover:rotate-3 duration-300">
            <img 
              src={COMPANY_LOGO_URL} 
              alt="Logo" 
              className="w-10 h-10 md:w-14 md:h-14 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://cdn-icons-png.flaticon.com/512/1000/1000966.png';
              }}
            />
          </div>
          
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl font-black tracking-tighter leading-none uppercase italic">
              Maintenance <span className="text-red-500">Logger</span>
            </h1>
            <p className="text-slate-400 text-[9px] font-bold uppercase tracking-[0.2em] mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
              Operational Support System
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-2xl flex-grow">
        {message && (
          <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border-b-4 transition-all duration-500 animate-in slide-in-from-top-4 ${
            message.type === 'success' ? 'bg-emerald-600 text-white border-emerald-800' : 'bg-red-600 text-white border-red-800'
          }`}>
            <span className="text-xl">{message.type === 'success' ? '🛡️' : '⚠️'}</span>
            <p className="font-black text-sm tracking-tight uppercase">{message.text}</p>
          </div>
        )}

        {view === 'HOME' && (
          <>
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
              {/* SEARCH BOX UTAMA */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-200 relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-2 bg-red-600"></div>
                 <div className="relative z-10">
                   <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 text-center">Masukan Nomor Mesin</label>
                   <div className="relative group">
                     <input 
                      type="text" 
                      placeholder="Contoh: M3001" 
                      className="w-full bg-slate-50 border-2 border-slate-200 px-6 py-5 rounded-2xl text-center text-2xl font-black text-slate-900 uppercase placeholder:text-slate-300 focus:border-red-500 focus:bg-white transition-all outline-none shadow-inner"
                      value={homeMachineInput}
                      onChange={(e) => setHomeMachineInput(e.target.value)}
                     />
                     <div className="absolute inset-0 rounded-2xl pointer-events-none group-focus-within:ring-4 ring-red-500/10 transition-all"></div>
                   </div>
                   <p className="text-center text-[10px] text-slate-400 font-bold mt-4 italic uppercase">* Scan QR atau ketik nomor mesin</p>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={handleGoToUpdate} 
                  className={`group p-6 rounded-[2rem] shadow-xl transition-all duration-300 transform active:scale-95 flex flex-col items-center justify-center gap-2 ${
                    isInputEmpty 
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60' 
                    : 'bg-red-600 text-white hover:shadow-red-200 hover:-translate-y-1'
                  }`}
                >
                  <div className={`p-3 rounded-xl transition-colors ${
                    isInputEmpty ? 'bg-slate-400' : 'bg-white/20 group-hover:bg-white group-hover:text-red-600'
                  }`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
                  </div>
                  <span className="font-black uppercase tracking-tight text-sm">Update Data</span>
                </button>

                <button 
                  onClick={handleGoToCheck} 
                  className={`group p-6 rounded-[2rem] shadow-xl border-2 transition-all duration-300 transform active:scale-95 flex flex-col items-center justify-center gap-2 ${
                    isInputEmpty 
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60' 
                    : 'bg-white text-slate-800 border-slate-200 hover:border-red-500 hover:text-red-600 hover:-translate-y-1'
                  }`}
                >
                  <div className={`p-3 rounded-xl transition-colors ${
                    isInputEmpty ? 'bg-slate-200 text-slate-300' : 'bg-slate-100 group-hover:bg-red-600 group-hover:text-white'
                  }`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  </div>
                  <span className="font-black uppercase tracking-tight text-sm">Check Data</span>
                </button>
              </div>
            </div>
            
            {/* FOOTER KHUSUS HOME */}
            <footer className="mt-16 text-center pb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1.5 flex-wrap">
                Maintenance Logger &copy; 2026 Made With <span className="text-red-600 animate-pulse text-sm">❤️</span> By BFMI19048 All rights reserved
              </p>
            </footer>
          </>
        )}

        {view === 'UPDATE' && (
          <div className="animate-in slide-in-from-bottom-8">
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-lg font-black text-slate-800 uppercase italic">Input <span className="text-red-600">Maintenance</span></h2>
                <button onClick={() => setView('HOME')} className="p-2 hover:bg-red-100 hover:text-red-600 rounded-xl transition-all">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Nomor Mesin</label>
                    <input required type="text" placeholder="M3001" className="w-full px-5 py-4 rounded-2xl border-2 border-slate-200 bg-slate-50 focus:border-red-500 outline-none transition-all font-black uppercase" value={formData.nomorMesin} onChange={e => setFormData({...formData, nomorMesin: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Nama Operator</label>
                    <input required type="text" placeholder="Ketik Nama Anda" className="w-full px-5 py-4 rounded-2xl border-2 border-slate-200 bg-slate-50 focus:border-red-500 outline-none transition-all font-bold" value={formData.namaOperator} onChange={e => setFormData({...formData, namaOperator: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Tanggal Cleaning</label>
                    <input required type="date" className="w-full px-5 py-4 rounded-2xl border-2 border-slate-200 bg-slate-50 focus:border-red-500 outline-none transition-all font-bold" value={formData.tanggalCleaning} onChange={e => setFormData({...formData, tanggalCleaning: e.target.value})} />
                  </div>
                </div>
                <button disabled={loading} type="submit" className="w-full bg-red-600 text-white font-black text-lg py-5 rounded-2xl hover:shadow-2xl hover:shadow-red-200 transition-all active:scale-95 disabled:opacity-50">
                  {loading ? 'MENYIMPAN...' : 'SIMPAN LOG SEKARANG'}
                </button>
              </form>
            </div>
            
            {/* FOOTER KHUSUS UPDATE */}
            <footer className="mt-8 text-center pb-8">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em]">
                Copyright &copy; 2026 <a href="https://bungasari.com/" target="_blank" rel="noopener noreferrer" className="text-red-600 font-black hover:underline decoration-red-600 underline-offset-4">PT Bungasari Flour Mills Indonesia</a>.
              </p>
            </footer>
          </div>
        )}

        {view === 'CHECK' && (
          <div className="animate-in fade-in">
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-black text-slate-800 uppercase italic">Audit <span className="text-red-600">History</span></h2>
                  <div className="flex gap-2">
                    <button onClick={fetchData} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all">
                       <svg className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    </button>
                    <button onClick={() => setView('HOME')} className="p-2 text-slate-300 hover:bg-slate-100 rounded-xl">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  </span>
                  <input type="text" placeholder="Cari No. Mesin..." className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-red-500 focus:bg-white outline-none transition-all font-black text-sm uppercase" value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)} />
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Detail Mesin</th>
                      <th className="px-5 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Tgl Cleaning</th>
                      <th className="px-5 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Status Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {filteredLogs.length > 0 ? filteredLogs.map((log: any, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex flex-col">
                            <span className="font-black text-red-700 bg-red-50 px-2 py-0.5 rounded-lg w-fit mb-1 border border-red-100 uppercase italic">{log.nomorMesin}</span>
                            <span className={`font-bold uppercase tracking-tighter ${log.isOperatorLate ? 'text-red-600' : 'text-slate-500'}`}>
                              {log.namaOperator}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center">
                           <span className={`px-2 py-1 rounded-md font-black border ${
                             log.isOperatorLate ? 'bg-red-50 text-red-700 border-red-100' : 'bg-white text-slate-600 border-slate-200'
                           }`}>
                              {formatDateDisplay(parseDate(log.tanggalCleaning))}
                           </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                           <div className={`inline-flex flex-col items-end px-3 py-1 rounded-xl border-2 transition-all ${
                             log.isTargetMissed ? 'bg-red-600 text-white border-red-800' : 'bg-emerald-600 text-white border-emerald-800 shadow-md shadow-emerald-50'
                           }`}>
                              <span className="font-black uppercase tracking-tight">
                                {formatDateDisplay(log.nextCleaningDate)}
                              </span>
                              <span className="text-[7px] font-black opacity-80 uppercase leading-none mt-0.5">
                                {log.isTargetMissed ? 'LEWAT TARGET' : 'AMAN'}
                              </span>
                           </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3} className="px-5 py-12 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">
                          {loading ? 'Sinkronisasi Data...' : 'Belum Ada Catatan'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* FOOTER KHUSUS CHECK */}
            <footer className="mt-8 text-center pb-8">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em]">
                Copyright &copy; 2026 <a href="https://bungasari.com/" target="_blank" rel="noopener noreferrer" className="text-red-600 font-black hover:underline decoration-red-600 underline-offset-4">PT Bungasari Flour Mills Indonesia</a>.
              </p>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
