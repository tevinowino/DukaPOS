"use client";

import { useState } from "react";

interface PinPadProps {
  length?: number;
  onComplete: (pin: string) => void;
}

const DIGIT_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

/**
 * Purely presentational numeric keypad — no PIN verification or storage
 * logic. Fires `onComplete(pin)` once `length` digits are entered, then
 * clears itself for the caller to decide what happens next.
 *
 * To force-clear entered digits from outside (e.g. after a rejected PIN),
 * remount via a changing `key` prop rather than passing a "clear" prop —
 * syncing external state into local state via an effect is an anti-pattern
 * React's own lint rule (`react-hooks/set-state-in-effect`) flags.
 */
export function PinPad({ length = 4, onComplete }: PinPadProps) {
  const [digits, setDigits] = useState("");

  function pressDigit(digit: string) {
    if (digits.length >= length) {
      return;
    }
    const next = digits + digit;
    setDigits(next);
    if (next.length === length) {
      onComplete(next);
      setDigits("");
    }
  }

  function pressBackspace() {
    setDigits((current) => current.slice(0, -1));
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        aria-label={`${digits.length} of ${length} digits entered`}
        className="flex gap-3"
      >
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full border border-zinc-400 ${
              i < digits.length ? "bg-zinc-900 dark:bg-zinc-100" : "bg-transparent"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {DIGIT_ROWS.flat().map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => pressDigit(digit)}
            className="h-16 w-16 rounded-full border text-xl font-medium active:bg-zinc-100 dark:active:bg-zinc-800"
          >
            {digit}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => pressDigit("0")}
          className="h-16 w-16 rounded-full border text-xl font-medium active:bg-zinc-100 dark:active:bg-zinc-800"
        >
          0
        </button>
        <button
          type="button"
          onClick={pressBackspace}
          aria-label="Backspace"
          className="h-16 w-16 rounded-full border text-xl font-medium active:bg-zinc-100 dark:active:bg-zinc-800"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
