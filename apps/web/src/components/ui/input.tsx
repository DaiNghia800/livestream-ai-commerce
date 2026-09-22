"use client";
import { useId, type InputHTMLAttributes } from "react";
type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};
export function Input({ label, error, id, ...props }: Props) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input
        {...props}
        id={fieldId}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={
          [props["aria-describedby"], error ? `${fieldId}-error` : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {error && (
        <span id={`${fieldId}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
