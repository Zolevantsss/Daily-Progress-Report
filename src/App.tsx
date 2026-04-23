import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { BookOpen, Calendar, Edit3, Save, User, Clock, CheckCircle2, ChevronRight, Hash, Image as ImageIcon, XCircle, Trash2, Maximize2, X, Plus, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { Report, StudentProfile } from './types';
import Gun from 'gun';

// Unique vault ID based on conversation ID to ensure privacy but allow collaboration
const VAULT_ID = 'vault_f1914d52_v4_stable';

// Using more reliable and common Gun.js peers
const gun = Gun({
  peers: [
    'https://gun-manhattan.herokuapp.com/gun',
    'https://gun-ams1.herokuapp.com/gun',
    'https://gun-us-west.herokuapp.com/gun',
    'https://gunjs.herokuapp.com/gun'
  ]
});

function App() {
  const [profile, setProfile] = useState<StudentProfile>(() => {
    const saved = localStorage.getItem('studentProfile');
    return saved ? JSON.parse(saved) : { name: 'Student Name' };
  });
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [reports, setReports] = useState<Record<string, Report & { studentName: string }>>({});
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [currentContent, setCurrentContent] = useState('');
  const [currentImages, setCurrentImages] = useState<string[]>([]);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [showToast, setShowToast] = useState<{show: boolean, message: string, type: 'success' | 'error'}>({show: false, message: '', type: 'success'});
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Connection monitoring
  useEffect(() => {
    const handle = setInterval(() => {
      // Basic check for Gun.js peer connectivity
      const peers = (gun as any)._?.opt?.peers;
      const activePeers = Object.values(peers || {}).filter((p: any) => p.wire && p.wire.readyState === 1);
      setIsConnected(activePeers.length > 0);
    }, 3000);
    return () => clearInterval(handle);
  }, []);

  // Sync Logic
  useEffect(() => {
    const reportsRef = gun.get(VAULT_ID);

    // Initial fetch
    reportsRef.once((data) => {
      console.log("Initial data loaded", data);
    });

    // Real-time listener
    reportsRef.map().on((data, key) => {
      if (!data || typeof key !== 'string' || key === '_') return;
      
      try {
        const report = {
          id: key,
          date: data.date || key.split('_')[0],
          content: data.content || '',
          studentName: data.studentName || 'Anonymous',
          lastUpdated: data.lastUpdated || 0,
          images: data.images ? JSON.parse(data.images) : []
        };

        setReports(prev => {
          // If this is a new report or a newer version of an existing one
          if (!prev[key] || report.lastUpdated > prev[key].lastUpdated) {
            return { ...prev, [key]: report };
          }
          return prev;
        });
      } catch (e) {
        console.error("Sync error", e);
      }
    });

    return () => reportsRef.off();
  }, []);

  // Update editor based on selected date and name
  useEffect(() => {
    const myReportKey = `${selectedDate}_${profile.name}`;
    const report = reports[myReportKey];
    
    if (report) {
      setCurrentContent(report.content);
      setCurrentImages(report.images || []);
      setLastSaved(report.lastUpdated);
    } else {
      setCurrentContent('');
      setCurrentImages([]);
      setLastSaved(null);
    }
  }, [selectedDate, profile.name, reports]);

  useEffect(() => {
    localStorage.setItem('studentProfile', JSON.stringify(profile));
  }, [profile]);

  const saveReport = () => {
    if (!profile.name || profile.name === 'Student Name') {
      setShowToast({show: true, message: 'Please set your name first!', type: 'error'});
      setIsEditingName(true);
      return;
    }

    setIsSyncing(true);
    const now = Date.now();
    const myReportKey = `${selectedDate}_${profile.name}`;
    const reportsRef = gun.get(VAULT_ID);
    
    const reportData = {
      date: selectedDate,
      content: currentContent,
      studentName: profile.name,
      lastUpdated: now,
      images: JSON.stringify(currentImages)
    };

    // Save with ACK check
    reportsRef.get(myReportKey).put(reportData, (ack: any) => {
      setIsSyncing(false);
      if (ack.err) {
        setShowToast({show: true, message: 'Sync error. Still saved locally.', type: 'error'});
      } else {
        setShowToast({show: true, message: 'Cloud Sync Successful!', type: 'success'});
      }
      setTimeout(() => setShowToast({show: false, message: '', type: 'success'}), 3000);
    });
  };

  const createNewReport = () => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfile({ ...profile, name: e.target.value });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newImages: string[] = [];
    let processedCount = 0;

    Array.from(files).forEach(file => {
      if (file.size > 500 * 1024) { // Tighten limit for Gun.js reliability
        setShowToast({show: true, message: 'Image too big for cloud sync', type: 'error'});
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        newImages.push(reader.result as string);
        processedCount++;
        if (processedCount === files.length) {
          setCurrentImages(prev => [...prev, ...newImages]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setCurrentImages(prev => prev.filter((_, i) => i !== index));
  };

  const deleteReport = (key: string) => {
    if (confirm("Permanently delete this shared report?")) {
      gun.get(VAULT_ID).get(key).put(null as any);
      setReports(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    }
  };

  const sortedReports = Object.values(reports).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="min-h-screen bg-base-200 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {selectedImage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
            <img src={selectedImage} alt="Full" className="max-w-full max-h-full object-contain rounded-lg" />
            <button className="absolute top-4 right-4 btn btn-circle btn-ghost text-white"><X size={24} /></button>
          </div>
        )}

        {showToast.show && (
          <div className="toast toast-top toast-end z-50">
            <div className={`alert ${showToast.type === 'success' ? 'alert-success' : 'alert-error'} shadow-2xl`}>
              <span className="font-bold">{showToast.message}</span>
            </div>
          </div>
        )}

        <header className="card bg-base-100 shadow-xl border border-base-300">
          <div className="card-body flex-row items-center justify-between py-6">
            <div className="flex items-center gap-4">
              <div className="avatar placeholder online">
                <div className="bg-primary text-primary-content rounded-xl w-16">
                  <User size={32} />
                </div>
              </div>
              <div>
                {isEditingName ? (
                  <input
                    type="text"
                    className="input input-bordered input-primary w-full max-w-xs font-bold text-xl"
                    value={profile.name}
                    onChange={handleNameChange}
                    onBlur={() => setIsEditingName(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                    autoFocus
                  />
                ) : (
                  <h1 className="text-2xl font-bold flex items-center gap-2 cursor-pointer" onClick={() => setIsEditingName(true)}>
                    {profile.name}
                    <Edit3 size={18} className="opacity-50" />
                  </h1>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {isConnected ? <Wifi size={12} className="text-success" /> : <WifiOff size={12} className="text-error" />}
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isConnected ? 'text-success' : 'text-error'}`}>
                    {isConnected ? 'Network Connected' : 'Connecting to Cloud...'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
               <button className="btn btn-ghost btn-circle" onClick={() => window.location.reload()} title="Sync Now">
                  <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
               </button>
               <button className="btn btn-primary gap-2 font-bold" onClick={createNewReport}>
                <Plus size={20} />
                NEW ENTRY
              </button>
            </div>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-4">
            <div className="card bg-base-100 shadow-xl border border-base-300 h-full">
              <div className="card-body p-6 space-y-6">
                <div className="form-control">
                  <label className="label text-xs uppercase font-bold opacity-50">Calendar</label>
                  <input type="date" className="input input-bordered w-full font-bold" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                </div>
                
                <div className="divider text-[10px] uppercase font-black opacity-30">Global Logs</div>

                <div className="space-y-3 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                  {sortedReports.map((report) => (
                    <div key={report.id} className="flex gap-2 group">
                      <button 
                        className={`flex-grow flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                          selectedDate === report.date && profile.name === report.studentName 
                          ? 'bg-primary text-primary-content border-primary shadow-lg' 
                          : 'bg-base-100 border-base-200 hover:border-primary/20 hover:bg-base-200'
                        }`} 
                        onClick={() => {
                          setSelectedDate(report.date);
                          // For viewing others, we update the local content but don't change the name
                          if (report.studentName !== profile.name) {
                            setCurrentContent(report.content);
                            setCurrentImages(report.images || []);
                            setLastSaved(report.lastUpdated);
                          }
                        }}
                      >
                        <div className="text-left">
                          <p className="font-bold text-sm">{format(new Date(report.date), 'MMM dd, yyyy')}</p>
                          <p className={`text-[10px] font-medium opacity-70 ${selectedDate === report.date && profile.name === report.studentName ? 'text-white' : ''}`}>
                            Student: <span className="font-bold">{report.studentName}</span>
                          </p>
                        </div>
                        <ChevronRight size={14} />
                      </button>
                      {profile.name === report.studentName && (
                        <button className="btn btn-square btn-ghost btn-sm text-error opacity-0 group-hover:opacity-100 self-center" onClick={() => deleteReport(report.id)}><Trash2 size={16} /></button>
                      )}
                    </div>
                  ))}
                  {sortedReports.length === 0 && (
                    <div className="text-center py-20 opacity-30">
                      <Clock size={48} className="mx-auto mb-2" />
                      <p className="text-[10px] font-bold uppercase">Syncing with network...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="lg:col-span-8">
            <div className="card bg-base-100 shadow-xl border border-base-300 flex flex-col min-h-[800px]">
              <div className="p-6 bg-gradient-to-r from-primary to-secondary text-primary-content flex items-center justify-between rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <BookOpen size={28} />
                  <div>
                    <h2 className="text-xl font-bold">{format(new Date(selectedDate), 'EEEE, MMMM dd')}</h2>
                    <p className="text-[10px] font-bold uppercase opacity-70">Journaling as {profile.name}</p>
                  </div>
                </div>
                <button className="btn btn-circle btn-ghost text-white" onClick={() => fileInputRef.current?.click()}><ImageIcon size={28} /></button>
              </div>
              
              <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />

              <div className="card-body p-0 flex-grow flex flex-col">
                {currentImages.length > 0 && (
                  <div className="p-6 bg-base-200/50 flex gap-6 overflow-x-auto custom-scrollbar border-b border-base-300">
                    {currentImages.map((img, idx) => (
                      <div key={idx} className="relative flex-shrink-0 group">
                        <div className="relative w-80 h-56 cursor-pointer overflow-hidden rounded-2xl shadow-xl border-4 border-white" onClick={() => setSelectedImage(img)}>
                          <img src={img} alt="Upload" className="w-full h-full object-cover" />
                        </div>
                        <button className="absolute -top-2 -right-2 btn btn-circle btn-error btn-xs shadow-lg opacity-0 group-hover:opacity-100" onClick={() => removeImage(idx)}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea className="textarea w-full h-full flex-grow text-2xl p-10 bg-base-100 focus:outline-none resize-none leading-relaxed" placeholder={`Write your progress, ${profile.name}...`} value={currentContent} onChange={(e) => setCurrentContent(e.target.value)}></textarea>
              </div>

              <div className="p-8 border-t border-base-200 bg-base-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`badge badge-sm ${isConnected ? 'badge-success' : 'badge-ghost animate-pulse'}`}>
                    {isConnected ? 'Synced' : 'Offline'}
                  </div>
                  <span className="text-xs font-bold text-base-content/40">
                    {lastSaved ? `Updated at ${format(lastSaved, 'hh:mm a')}` : 'Not saved'}
                  </span>
                </div>
                <button className="btn btn-primary btn-lg px-12 rounded-2xl font-black shadow-xl" onClick={saveReport} disabled={isSyncing}>
                  {isSyncing ? <span className="loading loading-spinner"></span> : <Save size={24} className="mr-2" />}
                  {isSyncing ? 'SAVING...' : 'SYNC TO CLOUD'}
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
