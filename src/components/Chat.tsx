import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/supabaseClient';

type ChatMessage = {
  id: number;
  created_at: string;
  username: string;
  content: string;
};

function getDefaultUsername() {
  const existing = localStorage.getItem('cto-slot-username');
  if (existing) return existing;

  const suffix = Math.random().toString(16).slice(2, 6);
  const next = `anon-${suffix}`;
  localStorage.setItem('cto-slot-username', next);
  return next;
}

export default function Chat() {
  const [username, setUsername] = useState(() => getDefaultUsername());
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading');

  const listRef = useRef<HTMLDivElement | null>(null);

  const canUseSupabase = Boolean(supabase);

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      setStatus('offline');
      return;
    }

    let cancelled = false;

    const load = async () => {
      setStatus('loading');
      const { data, error } = await sb
        .from('chat_messages')
        .select('id, created_at, username, content')
        .order('id', { ascending: false })
        .limit(50);

      if (cancelled) return;
      if (error) {
        setStatus('offline');
        return;
      }

      const next = (data ?? []).slice().reverse() as ChatMessage[];
      setMessages(next);
      setStatus('ready');
      queueMicrotask(() => {
        const el = listRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
      });
    };

    load();

    const channel = sb
      .channel('chat-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload: { new: unknown }) => {
        const row = payload.new as ChatMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          const next = [...prev, row];
          return next.length > 100 ? next.slice(next.length - 100) : next;
        });

        queueMicrotask(() => {
          const el = listRef.current;
          if (!el) return;
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          if (nearBottom) el.scrollTop = el.scrollHeight;
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('cto-slot-username', username);
  }, [username]);

  const safeUsername = useMemo(() => {
    return username.trim().slice(0, 24);
  }, [username]);

  const safeInput = useMemo(() => {
    return input.replace(/\s+/g, ' ').trim().slice(0, 280);
  }, [input]);

  const send = useCallback(async () => {
    const sb = supabase;
    if (!sb) return;
    if (!safeUsername) return;
    if (!safeInput) return;

    setInput('');

    const { error } = await sb.from('chat_messages').insert({ username: safeUsername, content: safeInput });
    if (error) {
      setInput(safeInput);
    }
  }, [safeInput, safeUsername]);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      await send();
    },
    [send]
  );

  return (
    <div className="rounded-2xl border border-slate-700 bg-black/40 p-4 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)] sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[10px] tracking-[0.22em] text-slate-300">LIVE CHAT</div>
        <div className="text-[9px] tracking-[0.18em] text-slate-500">
          {status === 'offline' ? 'OFFLINE' : status === 'loading' ? 'LOADING…' : 'CONNECTED'}
        </div>
      </div>

      <div
        ref={listRef}
        className="h-44 overflow-y-auto rounded-xl border border-slate-700 bg-black/60 px-3 py-2 text-[11px] leading-relaxed text-slate-200 shadow-inner"
      >
        {messages.length === 0 ? (
          <div className="py-6 text-center text-[10px] tracking-[0.12em] text-slate-500">NO MESSAGES YET</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="py-1">
              <span className="text-slate-400">{m.username.slice(0, 24)}:</span>{' '}
              <span className="text-slate-100">{m.content}</span>
            </div>
          ))
        )}
      </div>

      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!canUseSupabase}
            className="w-32 rounded-md border border-slate-700 bg-black/60 px-2 py-2 text-[11px] text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:opacity-50"
            placeholder="name"
            maxLength={24}
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!canUseSupabase}
            className="flex-1 rounded-md border border-slate-700 bg-black/60 px-2 py-2 text-[11px] text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:opacity-50"
            placeholder={canUseSupabase ? 'say something…' : 'configure Supabase to enable chat'}
            maxLength={280}
          />
        </div>

        <button
          type="submit"
          disabled={!canUseSupabase || !safeUsername || !safeInput}
          className="rounded-md border border-slate-700 bg-slate-900/30 px-3 py-2 text-[10px] tracking-[0.18em] text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          SEND
        </button>
      </form>
    </div>
  );
}
