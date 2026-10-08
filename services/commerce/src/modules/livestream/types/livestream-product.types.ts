export interface LivestreamProduct {
  id: string;
  livestreamId: string;
  productId: string;
  variantId: string | null;
  displayOrder: number;
  isFeatured: boolean;
  createdAt: string;
}
