"use client";
import { useId, type SelectHTMLAttributes } from "react";
type Props = SelectHTMLAttributes<HTMLSelectElement> & { label: string };
export function Select({ label, id, children, ...props }: Props) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <select {...props} id={fieldId}>
        {children}
      </select>
    </div>
  );
}
