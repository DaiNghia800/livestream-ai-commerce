export interface LivestreamProductSku {
  id: string;
  skuCode: string;
  variantName?: string | null;
  price: number;
  availableStock?: number;
  imageUrl?: string | null;
}

export interface LivestreamProduct {
  id: string;
  livestreamId: string;
  productId: string;
  variantId: string | null;
  displayOrder: number;
  isFeatured: boolean;
  createdAt: string;
  productName?: string | null;
  productCode?: string | null;
  productDescription?: string | null;
  skuCode?: string | null;
  variantName?: string | null;
  price?: number | null;
  imageUrl?: string | null;
  variants?: LivestreamProductSku[];
}
