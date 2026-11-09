"use client";

import { useEffect, useRef, useState } from "react";

export interface AnimatedCounterProps {
  /** Giá trị số (hoặc chuỗi như "—") */
  value: number | string;
  /** Thời gian chuyển số (mili-giây), mặc định 1000ms */
  duration?: number;
  /** ClassName bổ sung */
  className?: string;
  /** Định dạng số tiếng Việt (vd: 1.234) */
  locale?: string;
}

/**
 * Hiệu ứng chuyển động đếm số mượt mà phong cách TikTok/Shopee Live (Number Tweening).
 * - Sử dụng requestAnimationFrame và hàm easeOutCubic để số nhảy tự nhiên: nhanh lúc đầu và hãm phanh êm ái khi về đích.
 * - Tự động dọn dẹp frame khi unmount để chống rò rỉ bộ nhớ.
 */
export function AnimatedCounter({
  value,
  duration = 1000,
  className = "",
  locale = "vi-VN",
}: AnimatedCounterProps) {
  const numericValue = typeof value === "number" ? value : Number(value);
  const isNaNValue = isNaN(numericValue);

  const [displayValue, setDisplayValue] = useState<number>(() =>
    isNaNValue ? 0 : numericValue
  );
  const [isBumping, setIsBumping] = useState<boolean>(false);

  const prevValueRef = useRef<number>(isNaNValue ? 0 : numericValue);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (isNaNValue) return;

    const startVal = prevValueRef.current;
    const endVal = numericValue;
    prevValueRef.current = endVal;

    if (startVal === endVal) return;

    // Kích hoạt hiệu ứng nảy nhẹ khi số mắt xem tăng vọt (>= 5 mắt)
    if (endVal > startVal + 5) {
      setIsBumping(true);
      const timer = setTimeout(() => setIsBumping(false), 500);
      return () => clearTimeout(timer);
    }
  }, [numericValue, isNaNValue]);

  useEffect(() => {
    if (isNaNValue) return;

    const startVal = displayValue;
    const endVal = numericValue;

    if (startVal === endVal) return;

    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutCubic: 1 - (1 - t)^3
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * ease);

      setDisplayValue(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(endVal);
      }
    };

    animFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [numericValue, duration, isNaNValue]);

  if (isNaNValue) {
    return <span className={className}>{String(value)}</span>;
  }

  return (
    <span
      className={`inline-block transition-transform duration-300 ${
        isBumping ? "scale-110 text-emerald-300 font-extrabold" : ""
      } ${className}`}
    >
      {displayValue.toLocaleString(locale)}
    </span>
  );
}

