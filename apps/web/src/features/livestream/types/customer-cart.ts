export interface CustomerCartItem {
  id: string; // Unique ID (e.g. `${product.id}-${color}-${size}`)
  productId: string;
  code: string;
  displayCode?: string;
  name: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  selectedColor?: string | null;
  selectedSize?: string | null;
  quantity: number;
  maxStock: number;
  heldUntil: string; // ISO date string or timestamp for 2-minute hold
}
