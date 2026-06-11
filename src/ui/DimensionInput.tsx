// The signature dimension input (UI standard §6): unit-aware parsing, fractional-inch
// display, arrow stepping (Shift = ×10, Alt = fine), drag-to-scrub label, and
// reject-don't-clamp on invalid input.

import { useEffect, useRef, useState } from 'react';
import type { Units } from '../core/types';
import { formatLength, parseLength, stepMM } from '../core/units';

export interface DimensionInputProps {
  label?: string;
  mm: number;
  units: Units;
  min: number;
  max: number;
  onCommit(mm: number): void;
  onPreview?(mm: number): void;
  onGestureStart?(): void;
  onGestureEnd?(): void;
}

export function DimensionInput({
  label,
  mm,
  units,
  min,
  max,
  onCommit,
  onPreview,
  onGestureStart,
  onGestureEnd,
}: DimensionInputProps) {
  const [text, setText] = useState<string | null>(null); // null = display formatted value
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrub = useRef<{ startX: number; base: number } | null>(null);

  useEffect(() => setError(null), [mm, units]);

  const display = text !== null ? text : formatLength(mm, units);

  const reject = (message: string) => {
    setError(message);
    setShake(true);
    setTimeout(() => setShake(false), 300);
  };

  const commitText = (raw: string) => {
    const parsed = parseLength(raw, units);
    if (parsed === null) {
      reject(`Can't read "${raw.trim()}" as a length`);
      setText(null);
      return;
    }
    if (parsed < min || parsed > max) {
      reject(`Must be ${formatLength(min, units)} – ${formatLength(max, units)}`);
      setText(null);
      return;
    }
    setText(null);
    setError(null);
    if (Math.abs(parsed - mm) > 1e-6) onCommit(parsed);
  };

  const stepBy = (dir: 1 | -1, e: { shiftKey: boolean; altKey: boolean }) => {
    const step = stepMM(units, e.altKey) * (e.shiftKey ? 10 : 1);
    const next = Math.min(max, Math.max(min, mm + dir * step));
    setText(null);
    if (Math.abs(next - mm) > 1e-6) onCommit(next);
  };

  const onLabelPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    scrub.current = { startX: e.clientX, base: mm };
    onGestureStart?.();
  };
  const onLabelPointerMove = (e: React.PointerEvent) => {
    const s = scrub.current;
    if (!s) return;
    const step = stepMM(units, e.altKey);
    const raw = s.base + ((e.clientX - s.startX) / 3) * step;
    const next = Math.min(max, Math.max(min, Math.round(raw / step) * step));
    (onPreview ?? onCommit)(next);
  };
  const onLabelPointerUp = (e: React.PointerEvent) => {
    if (!scrub.current) return;
    scrub.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    onGestureEnd?.();
  };

  return (
    <div className="dim-field">
      {label !== undefined && (
        <span
          className="dim-label"
          title="Drag to adjust"
          onPointerDown={onLabelPointerDown}
          onPointerMove={onLabelPointerMove}
          onPointerUp={onLabelPointerUp}
        >
          {label}
        </span>
      )}
      <div className="dim-control">
        <input
          ref={inputRef}
          className={`input dim-input${shake ? ' shake' : ''}${error ? ' input--error' : ''}`}
          value={display}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            if (text !== null) commitText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitText((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              setText(null);
              setError(null);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              stepBy(1, e);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              stepBy(-1, e);
            }
          }}
          spellCheck={false}
          inputMode="text"
        />
        {error && <div className="dim-error">{error}</div>}
      </div>
    </div>
  );
}
