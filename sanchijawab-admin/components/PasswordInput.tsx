"use client";

import { useId, useState } from "react";
import { generateStrongPassword } from "@/lib/password-gen";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  autoComplete?: string;
  allowGenerate?: boolean;
};

export function PasswordInput({
  id: idProp,
  value,
  onChange,
  required,
  minLength,
  placeholder,
  autoComplete,
  allowGenerate,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const generatedId = useId();
  const id = idProp ?? generatedId;

  function generate() {
    const next = generateStrongPassword(Math.max(minLength ?? 0, 14));
    onChange(next);
    setVisible(true); // otherwise there'd be no way to see or copy what was just generated
    navigator.clipboard?.writeText(next).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {}, // clipboard permission denied — password is still shown on screen
    );
  }

  return (
    <div className="relative mt-1">
      <input
        id={id}
        className={`w-full border border-border bg-surface text-fg rounded-lg px-3 py-2 ${allowGenerate ? "pr-20" : "pr-10"}`}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <div className="absolute right-0 top-0 h-full flex items-center">
        {allowGenerate && (
          <button
            type="button"
            onClick={generate}
            title="Generate a strong password (copies it too)"
            className="px-2 text-[11.5px] font-semibold text-accent-ink hover:underline whitespace-nowrap"
          >
            {copied ? "Copied!" : "Generate"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-controls={id}
          className="px-3 h-full flex items-center text-fg-faint hover:text-fg"
        >
          {visible ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <path d="M1 1l22 22" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
