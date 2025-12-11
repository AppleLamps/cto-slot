import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useMemo, useRef, useState } from 'react';

import Reel from '@/components/Reel';
import { SLOT_SYMBOLS, type SlotSymbol } from '@/slotSymbols';

const BASE_SPIN_COST = 500;
const JACKPOT_DEBT = 10_000;

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

function randomSymbol(): SlotSymbol {
  return SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]!;
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

  const initialFinals = useMemo(() => {
    return [randomSymbol(), randomSymbol(), randomSymbol()] as const;
  }, []);

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

  const startGame = useCallback(() => {
    setStarted(true);
    setBanner({ id: ++bannerIdRef.current, text: 'READY. SPIN TO ADD DEBT.', tone: 'info' });
  }, []);

  const finishSpin = useCallback(() => {
    setSpinning(false);

    const [a, b, c] = currentFinalsRef.current;
    if (a && b && c && a.id === b.id && b.id === c.id) {
      setDebtOwed((d) => d + JACKPOT_DEBT);
      setBanner({
        id: ++bannerIdRef.current,
        text: `MATCH! +${money.format(JACKPOT_DEBT)} DEBT`,
        tone: 'win'
      });
      return;
    }

    setBanner({
      id: ++bannerIdRef.current,
      text: `+${money.format(BASE_SPIN_COST)} DEBT`,
      tone: 'info'
    });
  }, []);

  const onReelComplete = useCallback(() => {
    if (!spinning) return;

    pendingReelsRef.current -= 1;
    if (pendingReelsRef.current <= 0) finishSpin();
  }, [finishSpin, spinning]);

  const spin = useCallback(() => {
    if (!started || spinning) return;

    setBanner(null);
    setSpinning(true);
    setDebtOwed((d) => d + BASE_SPIN_COST);

    const finals = [randomSymbol(), randomSymbol(), randomSymbol()] as const;
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
    <div className="min-h-screen bg-black px-4 py-8 text-amber-400">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-[28px] border border-slate-700 bg-gradient-to-b from-slate-900/30 via-black to-black p-4 shadow-[0_30px_80px_rgba(0,0,0,0.75)] sm:p-6">
          <div className="mb-4 rounded-2xl border border-amber-400/25 bg-gradient-to-b from-slate-800/40 to-slate-950/60 px-4 py-3 shadow-[0_0_40px_rgba(251,191,36,0.10)]">
            <div className="text-center text-lg tracking-[0.3em] text-amber-400 amber-text sm:text-xl">
              cto.new
            </div>
          </div>

          <div className="crt rounded-2xl border border-slate-700 bg-black p-4 shadow-inner sm:p-6">
            <div className="relative z-10 flex flex-col gap-6">
              <div className="flex flex-col items-center gap-2">
                <div className="text-center text-[10px] tracking-[0.22em] text-slate-300 sm:text-xs">
                  TECHNICAL DEBT OWED
                </div>
                <div className="phosphor-text tabular-nums text-3xl text-green-400 sm:text-5xl">
                  {money.format(debtOwed)}
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
                      className="blink rounded-lg border border-amber-400/40 bg-black/70 px-5 py-4 text-center text-xs tracking-[0.25em] text-amber-400 amber-text shadow-[0_0_24px_rgba(251,191,36,0.15)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                    >
                      INSERT $0
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
                  Every spin adds <span className="text-slate-200">{money.format(BASE_SPIN_COST)}</span>.
                  <br />
                  Matching reels adds <span className="text-amber-300">{money.format(JACKPOT_DEBT)}</span> more.
                </div>

                <div className="text-center text-[9px] tracking-[0.18em] text-slate-600">
                  INVERTED SLOT MACHINE • SUCCESS = MAINTENANCE
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
