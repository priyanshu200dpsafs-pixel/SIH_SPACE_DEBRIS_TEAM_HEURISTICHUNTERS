import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function CopilotPanel({ sessionId }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Flight Director Copilot initialized. I can assess conjunction risks, explain safety interlock divergence, and answer SSA questions. How can I assist you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/copilot/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          messages: updatedMessages,
        })
      });
      
      const data = await response.json();
      setMessages(prev => [...prev, data.message]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Connection to Flight Director Copilot lost.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-96 flex flex-col h-full bg-black/60 backdrop-blur-xl border-l border-white/10 text-white z-10 pointer-events-auto">
      <div className="p-6 border-b border-white/10 bg-black/40">
        <h2 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
          <Sparkles className="text-cyan-400" size={20} />
          Copilot
        </h2>
        <p className="text-xs text-white/50 mt-1 uppercase tracking-wider font-mono">
          Claude 3.5 Sonnet Integration
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-3", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
            <div className={cn(
              "w-8 h-8 shrink-0 rounded-full flex items-center justify-center shadow-lg",
              m.role === 'user' ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "bg-white/10 text-white border border-white/20"
            )}>
              {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={cn(
              "px-4 py-3 rounded-2xl max-w-[80%] text-sm leading-relaxed",
              m.role === 'user' 
                ? "bg-cyan-600/20 text-cyan-50 rounded-tr-none border border-cyan-500/20" 
                : "bg-white/5 text-white/90 rounded-tl-none border border-white/10"
            )}>
              {m.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center shadow-lg bg-white/10 text-white border border-white/20">
              <Bot size={16} />
            </div>
            <div className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 rounded-tl-none flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-cyan-400" />
              <span className="text-white/50 text-xs uppercase tracking-wider">Analyzing...</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-white/10 bg-black/40">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Query telemetry, assess risk, plan CAM..."
            className="w-full bg-white/5 border border-white/10 rounded-full pl-4 pr-12 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 rounded-full transition-all disabled:opacity-50 disabled:hover:bg-cyan-500/20"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
