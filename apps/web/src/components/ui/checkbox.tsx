"use client";

import { useId, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  children: React.ReactNode;
};

export function Checkbox({ label, children, id, className = "", ...props }: Props) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <label htmlFor={fieldId} className={`checkbox ${className}`}>
      <input {...props} id={fieldId} type="checkbox" />
      <span>{children}</span>
    </label>
  );
}
