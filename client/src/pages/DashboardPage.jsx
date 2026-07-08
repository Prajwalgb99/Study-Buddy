// src/pages/DashboardPage.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Upload, FileText, MessageSquare, Trash2,
  CheckCircle2, Clock, AlertCircle, LogOut, Plus,
  ChevronRight, Loader2, RefreshCw, Brain
} from 'lucide-react';
import { api, useAuth } from '../utils/api.jsx';

// ─── Status badge for documents ───────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    ready:      { icon: CheckCircle2, label: 'Ready',      cls: 'bg-green-500/10  text-green-400  border-green-500/20'  },
    processing: { icon: Clock,        label: 'Processing', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    error:      { icon: AlertCircle,  label: 'Error',      cls: 'bg-red-500/10    text-red-400    border-red-500/20'    },
  }[status] || { icon: Clock, label: status, cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };

  const Icon = cfg.icon;
  return (
    <span className={`badge border ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Upload zone component ────────────────────────────────────────────────────
function UploadZone({ onUploadComplete }) {
  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [subject,   setSubject]   = useState('');
  const [progress,  setProgress]  = useState('');
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      alert('Please select a PDF file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('File is too large. Max size is 20MB.');
      return;
    }

    setUploading(true);
    setProgress('Uploading PDF...');

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('subject', subject || 'General');

    try {
      const { data } = await api.post('/notes/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setProgress('Processing — embedding chunks...');

      // Poll for completion
      const docId = data.document._id;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const { data: doc } = await api.get(`/notes/${docId}`);
          if (doc.document.status === 'ready') {
            clearInterval(poll);
            setProgress('');
            setUploading(false);
            setSubject('');
            onUploadComplete(doc.document);
          } else if (doc.document.status === 'error') {
            clearInterval(poll);
            setProgress('');
            setUploading(false);
            alert(`Processing failed: ${doc.document.errorMessage}`);
          } else if (attempts > 60) {
            clearInterval(poll);
            setUploading(false);
            setProgress('');
          }
        } catch { clearInterval(poll); setUploading(false); }
      }, 3000);

    } catch (err) {
      setUploading(false);
      setProgress('');
      alert(err.response?.data?.error || 'Upload failed.');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
        <Upload className="w-4 h-4 text-blue-400" /> Upload Study Notes
      </h2>

      {/* Subject input */}
      <input
        type="text"
        className="input-field mb-3 text-sm"
        placeholder="Subject (e.g. Cloud Computing, DBMS...)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        disabled={uploading}
      />

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
          ${dragging  ? 'border-blue-400 bg-blue-500/10' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'}
          ${uploading ? 'opacity-60 cursor-not-allowed' : ''}
        `}
      >
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
          onChange={(e) => handleFile(e.target.files[0])} disabled={uploading} />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-sm text-blue-300 font-medium">{progress}</p>
            <p className="text-xs text-slate-500">This may take 30–90 seconds for large PDFs</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-1">
              <FileText className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-300">
              {dragging ? 'Drop it here!' : 'Drag & drop your PDF here'}
            </p>
            <p className="text-xs text-slate-500">or click to browse • Max 20MB</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Document card ─────────────────────────────────────────────────────────────
function DocCard({ doc, onDelete, onChat }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${doc.originalName}" and all its data?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/notes/${doc._id}`);
      onDelete(doc._id);
    } catch { setDeleting(false); }
  };

  const fmtSize = (bytes) => bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="card hover:border-slate-600 transition-all duration-200 group">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-blue-600/10 border border-blue-600/20 rounded-lg flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-blue-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{doc.originalName}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge status={doc.status} />
            {doc.subject && (
              <span className="badge bg-slate-800 text-slate-400 border border-slate-700">{doc.subject}</span>
            )}
          </div>

          {doc.status === 'ready' && (
            <p className="text-xs text-slate-500 mt-1.5">
              {doc.pageCount} pages · {doc.chunkCount} chunks · {fmtSize(doc.fileSize)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {doc.status === 'ready' && (
            <button onClick={() => onChat(doc._id)}
              className="p-1.5 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 transition-colors"
              title="Chat with this document">
              <MessageSquare className="w-4 h-4" />
            </button>
          )}
          <button onClick={handleDelete} disabled={deleting}
            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
            title="Delete document">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {doc.status === 'ready' && (
        <button onClick={() => onChat(doc._id)}
          className="mt-3 w-full flex items-center justify-between px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 hover:text-white transition-all duration-200">
          <span className="flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5 text-blue-400" /> Chat with this document</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── Dashboard page ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [docs,    setDocs]    = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDocs = useCallback(async () => {
    try {
      const { data } = await api.get('/notes');
      setDocs(data.documents);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const stats = {
    total:   docs.length,
    ready:   docs.filter((d) => d.status === 'ready').length,
    chunks:  docs.reduce((s, d) => s + (d.chunkCount || 0), 0),
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">Study Buddy</span>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/chat')}
              className="btn-primary text-sm py-1.5">
              <MessageSquare className="w-4 h-4" /> New Chat
            </button>
            
            {/* User Profile Badge */}
            <div className="flex items-center gap-2 border border-slate-800 bg-slate-900/50 px-3 py-1.5 rounded-xl">
              <div className="w-6 h-6 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center font-bold text-xs shrink-0">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className="text-sm font-medium text-slate-200">
                {user?.name || 'User'}
              </span>
            </div>

            {/* Logout Button */}
            <button 
              onClick={logout} 
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-800 bg-slate-900/50 hover:bg-slate-800/80 rounded-xl hover:border-slate-700 text-slate-300 hover:text-white transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-200">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">
            Welcome back, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Upload your study notes and start chatting with your AI study assistant.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Documents',  value: stats.total,  icon: FileText,      color: 'text-blue-400'  },
            { label: 'Ready',      value: stats.ready,  icon: CheckCircle2,  color: 'text-green-400' },
            { label: 'Chunks',     value: stats.chunks, icon: BookOpen,      color: 'text-purple-400'},
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card text-center py-5">
              <Icon className={`w-5 h-5 ${color} mx-auto mb-2`} />
              <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Upload */}
          <div className="lg:col-span-1">
            <UploadZone onUploadComplete={(doc) => setDocs((prev) => [doc, ...prev])} />
          </div>

          {/* Right: Documents list */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Your Documents
                {docs.length > 0 && (
                  <span className="badge bg-slate-800 text-slate-400 border border-slate-700">{docs.length}</span>
                )}
              </h2>
              <button onClick={loadDocs} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors" title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
              </div>
            ) : docs.length === 0 ? (
              <div className="card text-center py-12 border-dashed">
                <FileText className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">No documents yet</p>
                <p className="text-slate-600 text-sm mt-1">Upload your first PDF to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {docs.map((doc) => (
                  <DocCard
                    key={doc._id}
                    doc={doc}
                    onDelete={(id) => setDocs((prev) => prev.filter((d) => d._id !== id))}
                    onChat={(id) => navigate(`/chat/${id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
