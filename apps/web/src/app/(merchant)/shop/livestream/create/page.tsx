import type { Metadata } from "next";
import { LivestreamCreateForm } from "@/features/livestream/components/create/livestream-create-form";

export const metadata: Metadata = {
  title: "Tạo phiên Livestream",
  description: "Thiết lập thông tin, lịch phát và sản phẩm cho phiên livestream LiveOrder AI",
};

export default function CreateLivestreamPage() {
  return <LivestreamCreateForm />;
}