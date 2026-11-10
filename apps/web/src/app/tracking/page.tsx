"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Package, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TrackingLookupPage() {
  const [token, setToken] = useState("");
  const router = useRouter();

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;
    router.push(`/tracking/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-6 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
          <Package className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-on-surface">Tra cứu đơn hàng</h1>
        <p className="text-xs text-outline mt-1 mb-6">
          Nhập mã tra cứu đơn hàng hoặc token được gửi qua tin nhắn chốt đơn để xem lộ trình giao hàng trực tiếp.
        </p>

        <form onSubmit={handleLookup} className="space-y-4">
          <Input
            label="Mã tra cứu / Mã đơn hàng"
            id="tracking-token-input"
            type="text"
            placeholder="VD: trk_9a8b7c6d hoặc ORD-8821"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />

          <Button
            type="submit"
            disabled={!token.trim()}
            className="w-full flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            <span>Tra cứu lộ trình</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
