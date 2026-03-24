'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  rowCount?: number;
  error?: string;
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi! I can help you analyze the Order-to-Cash process.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer ?? data.error ?? 'No response.',
          sql: data.sql,
          rowCount: data.rowCount,
          error: data.error,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Network error. Please try again.', error: 'Network error' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <p className="chat-title">Chat with Graph</p>
        <p className="chat-subtitle">Order to Cash</p>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg, i) =>
          msg.role === 'assistant' ? (
            /* ── AI message ── */
            <div key={i} className="msg-row msg-row--ai">
              <div className="ai-avatar">D</div>
              <div className="msg-body">
                <p className="msg-name">Dodge AI</p>
                <p className="msg-role">Graph Agent</p>
                <p className="ai-text">{msg.content}</p>
              </div>
            </div>
          ) : (
            /* ── User message ── */
            <div key={i} className="msg-row msg-row--user">
              <div className="user-bubble-wrap">
                <div className="user-label-row">
                  <p className="user-label">You</p>
                  <div className="user-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="8" r="4" fill="#94a3b8" />
                      <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
                <div className="user-bubble">{msg.content}</div>
              </div>
            </div>
          )
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="msg-row msg-row--ai">
            <div className="ai-avatar">D</div>
            <div className="msg-body">
              <p className="msg-name">Dodge AI</p>
              <p className="msg-role">Graph Agent</p>
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Status bar */}
      <div className="chat-status-bar">
        <span className="status-dot" />
        <p className="status-text">Dodge AI is awaiting instructions</p>
      </div>

      {/* Input */}
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          id="chat-input"
          className="chat-input"
          type="text"
          placeholder="Analyze anything"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
          autoComplete="off"
        />
        <button
          id="chat-submit"
          className="chat-submit"
          type="submit"
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
