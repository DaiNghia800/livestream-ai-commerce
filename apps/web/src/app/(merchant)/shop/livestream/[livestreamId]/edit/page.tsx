import type { Metadata } from "next";
import { LivestreamEditForm } from "@/features/livestream/components/edit/livestream-edit-form";

export const metadata: Metadata = {
  title: "Chỉnh sửa phiên Livestream",
  description: "Cập nhật thông tin, lịch phát và sản phẩm cho phiên livestream LiveOrder AI",
};

interface EditPageProps {
  params: Promise<{
    livestreamId: string;
  }>;
}

export default async function EditLivestreamPage({ params }: EditPageProps) {
  const { livestreamId } = await params;
  return <LivestreamEditForm livestreamId={livestreamId} />;
}
