"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Delete } from "lucide-react";

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
 * Styled for a light card surface specifically (the shipped design puts
 * PIN entry on a white sheet against the app's dark chrome, not on a dark
 * card) — every caller (`LockScreen`, `OnboardingScreen`) renders this
 * inside a light `Card`.
 *
 * To force-clear entered digits from outside (e.g. after a rejected PIN),
 * remount via a changing `key` prop rather than passing a "clear" prop —
 * syncing external state into local state via an effect is an anti-pattern
 * React's own lint rule (`react-hooks/set-state-in-effect`) flags.
 */
export function PinPad({ length = 4, onComplete }: PinPadProps) {
  const t = useTranslations("pinPad");
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
    <div className="flex flex-col items-center gap-6">
      <div
        aria-label={t("digitsEntered", { entered: digits.length, length })}
        className="flex gap-3"
      >
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${
              i < digits.length ? "border-green-600 bg-green-600" : "border-zinc-300 bg-transparent"
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
            className="h-16 w-16 rounded-full bg-zinc-100 text-xl font-medium text-zinc-900 transition-colors active:bg-zinc-200"
          >
            {digit}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => pressDigit("0")}
          className="h-16 w-16 rounded-full bg-zinc-100 text-xl font-medium text-zinc-900 transition-colors active:bg-zinc-200"
        >
          0
        </button>
        <button
          type="button"
          onClick={pressBackspace}
          aria-label={t("backspace")}
          className="flex h-16 w-16 items-center justify-center rounded-full text-zinc-500 transition-colors active:bg-zinc-100"
        >
          <Delete size={22} />
        </button>
      </div>
    </div>
  );
}
