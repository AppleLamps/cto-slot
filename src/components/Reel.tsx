import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { SlotSymbol } from '@/slotSymbols';

type ReelProps = {
  strip: SlotSymbol[];
  spinKey: number;
  durationMs: number;
  onComplete?: () => void;
};

export default function Reel({ strip, spinKey, durationMs, onComplete }: ReelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [itemHeight, setItemHeight] = useState(96);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const h = el.getBoundingClientRect().height;
      if (Number.isFinite(h) && h > 0) setItemHeight(h);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const distance = useMemo(() => {
    return -itemHeight * Math.max(0, strip.length - 1);
  }, [itemHeight, strip.length]);

  return (
    <div
      ref={containerRef}
      className="h-[clamp(76px,18vw,116px)] w-[clamp(76px,18vw,116px)] overflow-hidden rounded-xl border border-slate-700 bg-black/70 shadow-inner"
    >
      <motion.div
        key={spinKey}
        initial={{ y: 0, filter: 'blur(1px)' }}
        animate={{ y: distance, filter: 'blur(0px)' }}
        transition={{
          duration: durationMs / 1000,
          ease: [0.22, 1, 0.36, 1]
        }}
        onAnimationComplete={onComplete}
      >
        {strip.map((symbol, idx) => (
          <div
            key={`${symbol.id}-${idx}`}
            className="flex h-[clamp(76px,18vw,116px)] w-full items-center justify-center"
          >
            <span
              role="img"
              aria-label={symbol.label}
              className="select-none text-5xl drop-shadow-[0_0_14px_rgba(16,185,129,0.25)]"
            >
              {symbol.emoji}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
