// src/pages/ChatPage.jsx
// ─── Full streaming chat interface with history sidebar ────────────────────────
import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate }  from 'react-router-dom';
import {
  Brain, ArrowLeft, Send, StopCircle, Trash2,
  FileText, ChevronDown, ChevronUp, Sparkles,
  BookOpen, Globe, HelpCircle, BarChart2, Copy, Check,
  Menu, Plus, MessageSquare, LogOut
} from 'lucide-react';
import { useChat }  from '../hooks/useChat.js';
import { useAuth }  from '../utils/api.jsx';

// ─── Markdown renderer (lightweight, no extra lib needed) ─────────────────────
function renderMarkdown(text) {
  if (!text) return '';
  return text
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>')
    // Code blocks
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // Unordered lists
    .replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    // Ordered lists
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Line breaks to paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hpuolbcr])(.+)$/gm, '<p>$1</p>')
    // Cleanup nested
    .replace(/<p><\/p>/g, '');
}

// ─── Tool icon + label ─────────────────────────────────────────────────────────
function ToolBadge({ toolUsed }) {
  const cfg = {
    search_notes:    { icon: BookOpen, label: 'Searched notes',   cls: 'text-blue-400   bg-blue-500/10  border-blue-500/20'   },
    search_web:      { icon: Globe,    label: 'Searched web',     cls: 'text-green-400  bg-green-500/10 border-green-500/20'  },
    generate_quiz:   { icon: HelpCircle, label: 'Generated quiz', cls: 'text-purple-400 bg-purple-500/10 border-purple-500/20'},
    summarize_document: { icon: BarChart2, label: 'Summarized',   cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20'},
    explain_concept: { icon: Sparkles, label: 'Explained',        cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'},
  }[toolUsed] || { icon: Brain, label: toolUsed, cls: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };

  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.cls}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

// ─── Source citation panel ─────────────────────────────────────────────────────
function SourcePanel({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 border border-slate-700/60 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/60 hover:bg-slate-700/60 transition-colors text-xs text-slate-400 hover:text-slate-300"
      >
        <span className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          {sources.length} source{sources.length > 1 ? 's' : ''} used
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="divide-y divide-slate-700/40">
          {sources.map((src, i) => (
            <div key={i} className="px-3 py-2.5 bg-slate-900/60 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3 h-3 text-blue-400 shrink-0" />
                  <span className="text-slate-300 font-medium truncate">{src.documentName}</span>
                  {src.subject && (
                    <span className="badge bg-slate-800 text-slate-500 border border-slate-700 text-[10px] shrink-0">{src.subject}</span>
                  )}
                </div>
                <span className={`ml-2 font-semibold shrink-0 ${
                  src.score >= 0.85 ? 'text-green-400' : src.score >= 0.70 ? 'text-yellow-400' : 'text-orange-400'
                }`}>
                  {(src.score * 100).toFixed(0)}% match
                </span>
              </div>
              <p className="text-slate-500 leading-relaxed line-clamp-3">{src.excerpt}</p>
              <p className="text-slate-600 mt-1">
                Chunk {src.chunkIndex + 1} of {src.totalChunks}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 animate-fade-in">
      <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
        <Brain className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    </div>
  );
}

// ─── Single message bubble ─────────────────────────────────────────────────────
function MessageBubble({ message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[80%]">
          <div className="bg-blue-600 rounded-2xl rounded-br-sm px-4 py-3">
            <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
          <p className="text-[10px] text-slate-600 text-right mt-1 px-1">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-end gap-2 animate-slide-up">
      {/* Avatar */}
      <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
        <Brain className="w-3.5 h-3.5 text-white" />
      </div>

      <div className="max-w-[85%] flex-1">
        <div className={`bg-slate-800 border border-slate-700/80 rounded-2xl rounded-bl-sm px-4 py-3
          ${message.isError ? 'border-red-500/30 bg-red-500/5' : ''}
        `}>
          {/* Tool used badge */}
          {message.toolUsed && (
            <div className="mb-2">
              <ToolBadge toolUsed={message.toolUsed} />
            </div>
          )}

          {/* Message content — rendered as markdown */}
          {message.content ? (
            <div
              className={`prose-chat text-sm text-slate-200 ${message.isStreaming ? 'stream-cursor' : ''}`}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
          ) : (
            message.isStreaming && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
                Thinking...
              </div>
            )
          )}

          {/* Error state */}
          {message.isError && (
            <p className="text-xs text-red-400 mt-2">An error occurred. Please try again.</p>
          )}
        </div>

        {/* Footer: sources + copy + time */}
        {!message.isStreaming && message.content && (
          <>
            <SourcePanel sources={message.sources} />

            <div className="flex items-center justify-between mt-1 px-1">
              <p className="text-[10px] text-slate-600">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <button onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Suggested prompts for empty state ────────────────────────────────────────
const SUGGESTIONS = [
  { icon: '📝', text: 'Summarize the key points from my notes' },
  { icon: '🧪', text: 'Test me on Chapter 1 with 5 quiz questions' },
  { icon: '💡', text: 'Explain the most important concept in simple terms' },
  { icon: '🔍', text: 'What topics am I likely to be tested on?' },
];

// ─── Main Chat Page ────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { docId }    = useParams();
  const { user, logout } = useAuth();
  const navigate     = useNavigate();
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const inputRef     = useRef(null);

  const {
    messages, isStreaming, error, sessionId,
    sessions, sessionsLoading, bottomRef,
    sendMessage, cancelStream, clearChat,
    loadSessionHistory, deleteSession
  } = useChat({ documentId: docId });

  // Auto-focus input
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Collapse sidebar on small screens initially
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  const handleSend = () => {
    const q = input.trim();
    if (!q || isStreaming) return;
    setInput('');
    sendMessage(q);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* ── Sidebar Overlay (Mobile only) ── */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Chat History Sidebar ── */}
      <aside className={`
        fixed md:relative top-0 bottom-0 left-0 z-30
        flex flex-col h-full bg-slate-900 border-r border-slate-800/80
        transition-all duration-300 ease-in-out overflow-hidden shrink-0
        ${sidebarOpen ? 'w-64' : 'w-0'}
      `}>
        {/* Sidebar Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-xs text-slate-200">Chat History</span>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors md:hidden"
            title="Close sidebar"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3 shrink-0">
          <button
            onClick={() => {
              clearChat();
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-lg shadow-blue-600/10"
          >
            <Plus className="w-4 h-4" /> New Chat
          </button>
        </div>

        {/* Chat Sessions list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          {sessionsLoading && sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] text-slate-500 font-medium">Loading history...</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageSquare className="w-6 h-6 text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-medium">No previous chats</p>
              <p className="text-[10px] text-slate-600 mt-1 leading-normal">Start a new conversation below.</p>
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = s.sessionId === sessionId;
              return (
                <div
                  key={s.sessionId}
                  onClick={() => {
                    loadSessionHistory(s.sessionId);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={`
                    group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-all border
                    ${isActive 
                      ? 'bg-blue-600/10 text-blue-400 border-blue-500/20 font-medium' 
                      : 'text-slate-400 border-transparent hover:bg-slate-800/60 hover:text-slate-200'}
                  `}
                >
                  <span className="truncate flex-1 pr-2 leading-none">{s.title || 'New Chat'}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete chat "${s.title || 'New Chat'}"?`)) {
                        deleteSession(s.sessionId);
                      }
                    }}
                    className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm shrink-0">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Toggle history sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>

          <button onClick={() => navigate('/')}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Back to Dashboard">
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="w-7 h-7 bg-blue-600/10 border border-blue-600/20 rounded-lg flex items-center justify-center">
            <Brain className="w-4 h-4 text-blue-400" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">Study Buddy</p>
            {docId && (
              <p className="text-[11px] text-slate-500 truncate">
                Focused on 1 document
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {messages.length > 0 && (
              <button onClick={clearChat}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 transition-colors px-2 py-1.5 hover:bg-red-500/10 rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Start New
              </button>
            )}

            {/* User Profile Badge */}
            <div className="hidden sm:flex items-center gap-2 border border-slate-800 bg-slate-900/50 px-3 py-1.5 rounded-xl">
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
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">

            {/* Empty state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
                <div className="w-14 h-14 bg-blue-600/10 border border-blue-600/20 rounded-2xl flex items-center justify-center mb-4">
                  <Brain className="w-7 h-7 text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  What do you want to study?
                </h2>
                <p className="text-slate-400 text-sm max-w-sm mb-8">
                  {docId
                    ? 'Ask anything about your uploaded document. I\'ll answer using only your notes.'
                    : 'Ask a question and I\'ll search across all your uploaded notes.'}
                </p>

                {/* Suggestion chips */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.text}
                      onClick={() => { setInput(s.text); inputRef.current?.focus(); }}
                      className="flex items-center gap-2.5 p-3 text-left bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-600 rounded-xl text-sm text-slate-300 hover:text-white transition-all duration-200">
                      <span className="text-base">{s.icon}</span>
                      <span className="text-xs leading-tight">{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Streaming indicator when agent is thinking but no tokens yet */}
            {isStreaming && messages[messages.length - 1]?.role === 'user' && (
              <TypingIndicator />
            )}

            {/* Global error banner */}
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
                <span className="shrink-0">⚠️</span> {error}
              </div>
            )}

            {/* Auto-scroll anchor */}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-slate-800 bg-slate-900/80 backdrop-blur-sm px-4 py-4 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? 'Study Buddy is answering...' : 'Ask anything about your notes...'}
                disabled={isStreaming}
                rows={1}
                className="flex-1 bg-transparent px-4 py-3 text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none min-h-[44px] max-h-[160px]"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                }}
              />

              <div className="px-2 py-2 shrink-0">
                {isStreaming ? (
                  <button onClick={cancelStream}
                    className="w-9 h-9 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                    title="Stop generating">
                    <StopCircle className="w-5 h-5" />
                  </button>
                ) : (
                  <button onClick={handleSend} disabled={!input.trim()}
                    className="w-9 h-9 flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-lg shadow-blue-600/20"
                    title="Send message">
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-600 text-center mt-2">
              Answers are grounded in your uploaded notes. Press <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px] border border-slate-700">Enter</kbd> to send,{' '}
              <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px] border border-slate-700">Shift+Enter</kbd> for new line.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
