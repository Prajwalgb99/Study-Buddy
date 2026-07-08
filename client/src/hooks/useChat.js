// src/hooks/useChat.js
// ─── Custom hook managing the full streaming chat lifecycle + history ────────
import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../utils/api.jsx';

export function useChat({ documentId } = {}) {
  const [messages,   setMessages]   = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error,      setError]      = useState(null);
  const [sessionId,  setSessionId]  = useState(() => uuidv4());
  const [sessions,   setSessions]   = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const abortRef   = useRef(null);   // AbortController for cancelling streams
  const bottomRef  = useRef(null);   // For auto-scrolling

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Load all chat sessions ─────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const { data } = await api.get('/chat/sessions');
      if (data.success) {
        // If documentId is specified, we can optionally filter or sort
        // For simplicity and full visibility, we list all sessions
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ── Load history for a specific session ────────────────────────────────────
  const loadSessionHistory = useCallback(async (selectedSessionId) => {
    setError(null);
    setIsStreaming(false);
    abortRef.current?.abort();

    try {
      const { data } = await api.get(`/chat/history/${selectedSessionId}`);
      if (data.success && data.history) {
        setSessionId(selectedSessionId);
        // Map database message format to frontend format
        const formattedMessages = data.history.messages.map((m) => ({
          id: m._id || uuidv4(),
          role: m.role,
          content: m.content,
          sources: m.sources || [],
          toolUsed: m.toolsUsed?.[0] || '',
          timestamp: m.timestamp || new Date(),
        }));
        setMessages(formattedMessages);
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
      setError(err.response?.data?.error || 'Failed to load chat history.');
    }
  }, []);

  // ── Delete a specific session ──────────────────────────────────────────────
  const deleteSession = useCallback(async (targetSessionId) => {
    try {
      const { data } = await api.delete(`/chat/history/${targetSessionId}`);
      if (data.success) {
        setSessions((prev) => prev.filter((s) => s.sessionId !== targetSessionId));
        // If we deleted the active session, reset chat
        if (sessionId === targetSessionId) {
          setMessages([]);
          setSessionId(uuidv4());
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
      alert(err.response?.data?.error || 'Failed to delete session.');
    }
  }, [sessionId]);

  // ── Send a message and stream the response ─────────────────────────────────
  const sendMessage = useCallback(async (question) => {
    if (!question.trim() || isStreaming) return;

    setError(null);

    // Add user message immediately
    const userMsg = {
      id:        uuidv4(),
      role:      'user',
      content:   question.trim(),
      timestamp: new Date(),
    };

    // Add placeholder for streaming assistant message
    const assistantMsgId = uuidv4();
    const assistantMsg = {
      id:          assistantMsgId,
      role:        'assistant',
      content:     '',          // Will be filled token by token
      sources:     [],
      toolUsed:    '',
      isStreaming: true,
      timestamp:   new Date(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    // ── Abort previous stream if any ────────────────────────────────────────
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const token = localStorage.getItem('sb_token');

      // ── Open the SSE stream ───────────────────────────────────────────────
      const response = await fetch('/api/chat/stream', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ question, sessionId, documentId }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to start chat stream.');
      }

      // ── Read the SSE stream ───────────────────────────────────────────────
      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE messages are separated by double newlines
        const parts = buffer.split('\n\n');
        buffer = parts.pop();  // Keep incomplete last part in buffer

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;

          const jsonStr = line.replace(/^data:\s*/, '');
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const event = JSON.parse(jsonStr);
            switch (event.type) {
              case 'chunk':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + event.text }
                      : m
                  )
                );
                break;

              case 'metadata':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, sources: event.sources, toolUsed: event.toolUsed, hasResults: event.hasResults }
                      : m
                  )
                );
                break;

              case 'done':
                if (event.sessionId) setSessionId(event.sessionId);
                break;

              case 'error':
                setError(event.message);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: `Sorry, something went wrong: ${event.message}`, isStreaming: false, isError: true }
                      : m
                  )
                );
                break;

              default:
                break;
            }
          } catch {
            // Skip malformed JSON (keep-alive pings)
          }
        }
      }

    } catch (err) {
      if (err.name === 'AbortError') return;  // User cancelled — not an error

      console.error('Stream error:', err);
      setError(err.message);

      // Mark the assistant message as errored
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `Error: ${err.message}`, isStreaming: false, isError: true }
            : m
        )
      );
    } finally {
      // Ensure streaming state is always cleaned up
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, isStreaming: false } : m
        )
      );
      setIsStreaming(false);
      loadSessions(); // Reload sessions to list new conversation
    }
  }, [isStreaming, sessionId, documentId, loadSessions]);

  // ── Cancel an in-progress stream ───────────────────────────────────────────
  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m, i) =>
        i === prev.length - 1 && m.role === 'assistant'
          ? { ...m, isStreaming: false, content: m.content + '\n\n*[Response cancelled]*' }
          : m
      )
    );
    loadSessions();
  }, [loadSessions]);

  // ── Clear conversation ─────────────────────────────────────────────────────
  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsStreaming(false);
    setSessionId(uuidv4());  // New session
  }, []);

  return {
    messages,
    isStreaming,
    error,
    sessionId,
    sessions,
    sessionsLoading,
    bottomRef,
    sendMessage,
    cancelStream,
    clearChat,
    loadSessions,
    loadSessionHistory,
    deleteSession,
  };
}
