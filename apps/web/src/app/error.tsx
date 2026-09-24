"use client";
import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content">
      <ErrorState action={<Button onClick={reset}>Thử lại</Button>} />
    </main>
  );
}
