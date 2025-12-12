import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

import Chat from '@/components/Chat';
import Reel from '@/components/Reel';
import { SLOT_SYMBOLS, type SlotSymbol } from '@/slotSymbols';
import { supabase } from '@/supabaseClient';

const PAIR_DEBT = 2_500;
const JACKPOT_DEBT = 10_000;

const MISS_COST_MIN = 250;
const MISS_COST_MAX = 5_000;

const ODDS = {
  jackpot: 0.01,
  pair: 0.12
} as const;

type Finals = readonly [SlotSymbol, SlotSymbol, SlotSymbol];

const PAIR_MULTIPLIER_BY_SYMBOL: Record<string, number> = {
  bug: 1.1,
  coffee: 1,
  laptop: 1.25,
  error: 1.75,
  fire: 2.25
};

const JACKPOT_MULTIPLIER_BY_SYMBOL: Record<string, number> = {
  bug: 1.2,
  coffee: 1,
  laptop: 1.35,
  error: 2.25,
  fire: 3
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

function randomSymbol(): SlotSymbol {
  return SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]!;
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedRandomSymbol(): SlotSymbol {
  const weights: Record<string, number> = {
    coffee: 32,
    bug: 26,
    laptop: 20,
    error: 14,
    fire: 8
  };

  let total = 0;
  for (const s of SLOT_SYMBOLS) total += weights[s.id] ?? 1;

  let r = Math.random() * total;
  for (const s of SLOT_SYMBOLS) {
    r -= weights[s.id] ?? 1;
    if (r <= 0) return s;
  }

  return SLOT_SYMBOLS[0]!;
}

function distinctTriple(): Finals {
  const a = weightedRandomSymbol();
  let b = weightedRandomSymbol();
  while (b.id === a.id) b = weightedRandomSymbol();
  let c = weightedRandomSymbol();
  while (c.id === a.id || c.id === b.id) c = weightedRandomSymbol();
  return [a, b, c] as const;
}

function generateFinals(): Finals {
  const roll = Math.random();
  if (roll < ODDS.jackpot) {
    const s = weightedRandomSymbol();
    return [s, s, s] as const;
  }

  if (roll < ODDS.jackpot + ODDS.pair) {
    const s = weightedRandomSymbol();
    const other = distinctTriple().find((x) => x.id !== s.id) ?? randomSymbol();
    const pair: SlotSymbol[] = [s, s, other];
    for (let i = pair.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pair[i]!;
      pair[i] = pair[j]!;
      pair[j] = tmp;
    }
    return [pair[0]!, pair[1]!, pair[2]!] as const;
  }

  return distinctTriple();
}

function buildStrip(finalSymbol: SlotSymbol, steps: number): SlotSymbol[] {
  const strip: SlotSymbol[] = [];
  for (let i = 0; i < steps; i += 1) strip.push(randomSymbol());
  strip.push(finalSymbol);
  return strip;
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [debtOwed, setDebtOwed] = useState(0);
  const [moneyOwedToCto, setMoneyOwedToCto] = useState(0);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  const initialFinalsRef = useRef<readonly SlotSymbol[] | null>(null);
  if (initialFinalsRef.current === null) {
    initialFinalsRef.current = [randomSymbol(), randomSymbol(), randomSymbol()] as const;
  }
  const initialFinals = initialFinalsRef.current;

  const [reelStrips, setReelStrips] = useState<SlotSymbol[][]>(() => {
    return initialFinals.map((s) => [s]);
  });

  const [spinning, setSpinning] = useState(false);
  const [spinKey, setSpinKey] = useState(0);

  const [banner, setBanner] = useState<{ id: number; text: string; tone: 'win' | 'info' } | null>(
    null
  );

  const pendingReelsRef = useRef(0);
  const currentFinalsRef = useRef<readonly SlotSymbol[]>(initialFinals);
  const bannerIdRef = useRef(0);

  useEffect(() => {
    const sb = supabase;
    if (!sb) return;

    let cancelled = false;

    const fetchTotals = async () => {
      const { data, error } = await sb
        .from('global_totals')
        .select('id, debt_won, money_owed')
        .eq('id', 1)
        .maybeSingle();

      if (cancelled) return;
      if (error) return;
      if (!data) return;

      setDebtOwed(Number(data.debt_won ?? 0));
      setMoneyOwedToCto(Number(data.money_owed ?? 0));
    };

    fetchTotals();

    const totalsChannel = sb
      .channel('global-totals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'global_totals' },
        (payload: { new: unknown; old: unknown }) => {
          const row = (payload.new ?? payload.old) as { id?: number; debt_won?: number; money_owed?: number };
          if (row?.id !== 1) return;
          setDebtOwed(Number(row.debt_won ?? 0));
          setMoneyOwedToCto(Number(row.money_owed ?? 0));
        }
      )
      .subscribe();

    const clientId = (() => {
      const existing = sessionStorage.getItem('cto-slot-client-id');
      if (existing) return existing;
      const next = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      sessionStorage.setItem('cto-slot-client-id', next);
      return next;
    })();
    const presenceChannel = sb.channel('online-presence', {
      config: {
        presence: {
          key: clientId
        }
      }
    });

    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState();
      setOnlineCount(Object.keys(state).length);
    });

    presenceChannel.subscribe(async (status: string) => {
      if (status !== 'SUBSCRIBED') return;
      await presenceChannel.track({ online_at: new Date().toISOString() });
    });

    return () => {
      cancelled = true;
      void sb.removeChannel(totalsChannel);
      void sb.removeChannel(presenceChannel);
    };
  }, []);

  const incrementGlobalTotals = useCallback(async (deltaDebtWon: number, deltaMoneyOwed: number) => {
    const sb = supabase;
    if (!sb) return;

    const { error } = await sb.rpc('increment_global_totals', {
      delta_debt_won: deltaDebtWon,
      delta_money_owed: deltaMoneyOwed
    });

    if (!error) return;
  }, []);

  const startGame = useCallback(() => {
    setStarted(true);
    setBanner({ id: ++bannerIdRef.current, text: 'READY. SPIN TO TEST YOUR LUCK.', tone: 'info' });
  }, []);

  const finishSpin = useCallback(() => {
    setSpinning(false);

    const [a, b, c] = currentFinalsRef.current;
    if (!a || !b || !c) return;

    const counts = new Map<string, number>();
    counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
    counts.set(b.id, (counts.get(b.id) ?? 0) + 1);
    counts.set(c.id, (counts.get(c.id) ?? 0) + 1);

    const maxCount = Math.max(...counts.values());
    let matchId: string | null = null;
    for (const [id, count] of counts.entries()) {
      if (count === maxCount) {
        matchId = id;
        break;
      }
    }

    const matchSymbol = matchId ? SLOT_SYMBOLS.find((s) => s.id === matchId) : null;
    const matchLabel = matchSymbol?.label.toUpperCase();

    if (maxCount === 3) {
      const multiplier = matchId ? (JACKPOT_MULTIPLIER_BY_SYMBOL[matchId] ?? 1) : 1;
      const prize = Math.round(JACKPOT_DEBT * multiplier);
      setDebtOwed((d) => d + prize);
      void incrementGlobalTotals(prize, 0);
      setBanner({
        id: ++bannerIdRef.current,
        text: `${matchLabel ? `${matchLabel} ` : ''}JACKPOT! +${money.format(prize)} DEBT`,
        tone: 'win'
      });
      return;
    }

    if (maxCount === 2) {
      const multiplier = matchId ? (PAIR_MULTIPLIER_BY_SYMBOL[matchId] ?? 1) : 1;
      const prize = Math.round(PAIR_DEBT * multiplier);
      setDebtOwed((d) => d + prize);
      void incrementGlobalTotals(prize, 0);
      setBanner({
        id: ++bannerIdRef.current,
        text: `${matchLabel ? `${matchLabel} ` : ''}PAIR! +${money.format(prize)} DEBT`,
        tone: 'win'
      });
      return;
    }

    const missCharge = randomInt(MISS_COST_MIN, MISS_COST_MAX);
    setMoneyOwedToCto((m) => m + missCharge);
    void incrementGlobalTotals(0, missCharge);
    setBanner({
      id: ++bannerIdRef.current,
      text: `MISS. +${money.format(missCharge)} OWED TO CTO`,
      tone: 'info'
    });
  }, [incrementGlobalTotals]);

  const onReelComplete = useCallback(() => {
    if (!spinning) return;

    pendingReelsRef.current -= 1;
    if (pendingReelsRef.current <= 0) finishSpin();
  }, [finishSpin, spinning]);

  const spin = useCallback(() => {
    if (!started || spinning) return;

    setBanner(null);
    setSpinning(true);

    const finals = generateFinals();
    currentFinalsRef.current = finals;

    setReelStrips([
      buildStrip(finals[0], 12),
      buildStrip(finals[1], 16),
      buildStrip(finals[2], 20)
    ]);

    pendingReelsRef.current = 3;
    setSpinKey((k) => k + 1);
  }, [spinning, started]);

  const canSpin = started && !spinning;

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-amber-400 [background-image:radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),rgba(0,0,0,0.92)_55%),radial-gradient(ellipse_at_center,rgba(251,191,36,0.06),rgba(0,0,0,0.95)_70%)]">
      <div className="mx-auto w-full max-w-4xl">
        <div className="rounded-[28px] border border-slate-700 bg-gradient-to-b from-zinc-950 via-black to-black p-4 shadow-[0_30px_80px_rgba(0,0,0,0.78)] sm:p-6">
          <div className="mb-5 rounded-2xl border border-slate-700 bg-black px-4 py-3 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.10),0_20px_60px_rgba(0,0,0,0.55)]">
            <div className="text-center text-lg tracking-[0.22em] text-slate-100 amber-text sm:text-xl">
              cto<span className="text-slate-300">.new</span>
            </div>
            <div className="mt-1 text-center text-[9px] tracking-[0.18em] text-slate-500">
              {!supabase ? 'LOCAL MODE' : onlineCount === null ? 'CONNECTING…' : `${onlineCount} ONLINE`}
            </div>
          </div>

          <div className="crt rounded-2xl border border-slate-700 bg-black p-4 shadow-inner sm:p-6">
            <div className="relative z-10 flex flex-col gap-7 sm:gap-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-12">
                <div className="flex flex-col items-center gap-2">
                  <div className="text-center text-[10px] tracking-[0.22em] text-slate-300 sm:text-xs">
                    TECHNICAL DEBT WON
                  </div>
                  <div className="phosphor-text tabular-nums text-3xl text-green-400 sm:text-5xl">
                    {money.format(debtOwed)}
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="text-center text-[10px] tracking-[0.22em] text-slate-300 sm:text-xs">
                    MONEY OWED TO CTO
                  </div>
                  <div className="tabular-nums text-3xl text-amber-300 amber-text sm:text-5xl">
                    {money.format(moneyOwedToCto)}
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="flex justify-center gap-3 sm:gap-4">
                  <Reel strip={reelStrips[0] ?? []} spinKey={spinKey} durationMs={1000} onComplete={onReelComplete} />
                  <Reel strip={reelStrips[1] ?? []} spinKey={spinKey} durationMs={1250} onComplete={onReelComplete} />
                  <Reel strip={reelStrips[2] ?? []} spinKey={spinKey} durationMs={1500} onComplete={onReelComplete} />
                </div>

                {!started && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60">
                    <button
                      type="button"
                      onClick={startGame}
                      className="blink rounded-md border border-slate-700 bg-black/60 px-8 py-5 text-center text-base tracking-[0.12em] text-slate-200 shadow-[0_0_40px_rgba(255,255,255,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                    >
                      Insert $0
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-3">
                <AnimatePresence mode="popLayout">
                  {banner && (
                    <motion.div
                      key={banner.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      className={
                        banner.tone === 'win'
                          ? 'rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-center text-[10px] tracking-[0.18em] text-amber-300 amber-text'
                          : 'rounded-md border border-slate-700 bg-slate-900/20 px-3 py-2 text-center text-[10px] tracking-[0.18em] text-slate-200'
                      }
                    >
                      {banner.text}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="button"
                  onClick={spin}
                  disabled={!canSpin}
                  className="select-none rounded-lg border border-[#c9c2ad] bg-[#e6dfc8] px-6 py-4 text-xs tracking-[0.25em] text-slate-900 shadow-[0_7px_0_#b8b19d,0_18px_40px_rgba(0,0,0,0.55)] transition-transform active:translate-y-[5px] active:shadow-[0_2px_0_#b8b19d,0_12px_30px_rgba(0,0,0,0.55)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {spinning ? 'SPINNING…' : 'SPIN'}
                </button>

                <div className="text-center text-[10px] leading-relaxed text-slate-400">
                  Miss costs <span className="text-slate-200">{money.format(MISS_COST_MIN)}</span>–<span className="text-slate-200">{money.format(MISS_COST_MAX)}</span> owed to CTO.
                  <br />
                  Pair pays <span className="text-amber-300">{money.format(PAIR_DEBT)}</span> debt. Jackpot pays{' '}
                  <span className="text-amber-300">{money.format(JACKPOT_DEBT)}</span> debt.
                  <br />
                  Some symbols pay higher multipliers.
                </div>

                <div className="text-center text-[9px] tracking-[0.18em] text-slate-600">
                  INVERTED SLOT MACHINE • SUCCESS = MAINTENANCE
                </div>
              </div>

              <Chat />

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
