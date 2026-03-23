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
      content: '👋 Hello! I can answer questions about your Order-to-Cash data. Try asking something like:\n• "How many sales orders exist?"\n• "Which customer has the most orders?"\n• "Show me the top 5 products by billing amount."',
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
      <div className="chat-header">
        <span className="chat-title">🔍 Query Assistant</span>
        <span className="chat-subtitle">Powered by Groq · LLaMA 3.3 70B</span>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <div className="message-bubble">
              <p className="message-text">{msg.content}</p>
              {msg.sql && (
                <details className="sql-details">
                  <summary>SQL ({msg.rowCount} row{msg.rowCount !== 1 ? 's' : ''})</summary>
                  <pre className="sql-code">{msg.sql}</pre>
                </details>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message message-assistant">
            <div className="message-bubble">
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          id="chat-input"
          className="chat-input"
          type="text"
          placeholder="Ask about your O2C data…"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
          autoComplete="off"
        />
        <button id="chat-submit" className="chat-submit" type="submit" disabled={loading || !input.trim()}>
          {loading ? '…' : '↗'}
        </button>
      </form>
    </div>
  );
}
