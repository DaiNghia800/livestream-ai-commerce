"use client";

import { useState, useId, type InputHTMLAttributes } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  error?: string;
  labelRight?: React.ReactNode;
};

export function PasswordInput({ label, error, labelRight, id, ...props }: Props) {
  const [show, setShow] = useState(false);
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <div className="field">
      <div className="field-label-row">
        <label htmlFor={fieldId}>{label}</label>
        {labelRight}
      </div>
      <div className="input-icon-wrap">
        <Lock size={18} className="input-icon-left" aria-hidden="true" />
        <input
          {...props}
          id={fieldId}
          type={show ? "text" : "password"}
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={
            [props["aria-describedby"], error ? `${fieldId}-error` : undefined]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        <button
          type="button"
          className="input-icon-btn"
          onClick={() => setShow((value) => !value)}
          aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          tabIndex={-1}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && (
        <span id={`${fieldId}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
