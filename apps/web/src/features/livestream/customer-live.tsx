"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CustomerLiveView } from "./components/customer/customer-live-view";
import { isValidUuid } from "./api/get-livestreams";

function CustomerLiveContent() {
  const searchParams = useSearchParams();
  let id =
    searchParams.get("id") ||
    searchParams.get("live") ||
    searchParams.get("id-") ||
    undefined;

  // Resilient fallback: detect if any query key or value matches a UUID
  if (!id) {
    for (const [key, value] of searchParams.entries()) {
      const cleanVal = (value || "").trim().replace(/^-+/, "");
      if (isValidUuid(cleanVal)) {
        id = cleanVal;
        break;
      }
      const cleanKey = key.trim().replace(/^id-?/, "").replace(/^-+/, "");
      if (isValidUuid(cleanKey)) {
        id = cleanKey;
        break;
      }
    }
  }

  const playbackUrl = searchParams.get("playbackUrl") || undefined;

  return (
    <CustomerLiveView
      livestreamId={id}
      playbackUrl={playbackUrl}
    />
  );
}

export function CustomerLive() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      }
    >
      <CustomerLiveContent />
    </Suspense>
  );
}
