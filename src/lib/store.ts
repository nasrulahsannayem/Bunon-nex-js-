import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware'; // 🚀 Added createJSONStorage
import { Product, trackPixel } from '@/src/lib/woocommerce';

interface CartItem extends Product {
  quantity: number;
  selectedVariation?: any;
}

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  total: number; // 🚀 total is now a standard state property
  setIsOpen: (open: boolean) => void;
  addItem: (product: Product, variation?: any) => void;
  buyNow: (product: Product, variation?: any) => void;
  updateQuantity: (cartItemId: string | number, delta: number) => void;
  removeItem: (cartItemId: string | number) => void;
  clearCart: () => void;
}

// 🚀 Helper function to calculate total instantly
const calculateTotal = (items: CartItem[]) => {
  return items.reduce((sum, item) => {
    const numericPrice = Number(String(item.price).replace(/[^0-9.-]+/g, '')) || 0;
    return sum + (numericPrice * item.quantity);
  }, 0);
};

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      total: 0,
      setIsOpen: (isOpen) => set({ isOpen }),
      
      addItem: (product, variation) => {
        const items = get().items;
        const rawPrice = variation ? variation.price : product.price;
        const price = String(rawPrice).replace(/[^\d.]/g, '') || '0'; 

        const existing = items.find(item => 
          variation 
            ? item.id === product.id && item.selectedVariation?.databaseId === variation.databaseId
            : item.id === product.id && !item.selectedVariation
        );
        
        trackPixel('AddToCart', {
          content_ids: [product.id],
          content_name: product.name,
          content_type: 'product',
          value: parseFloat(price),
          currency: 'BDT'
        });

        if (existing) {
          const newItems = items.map(item => {
            const isSame = variation 
              ? item.id === product.id && item.selectedVariation?.databaseId === variation.databaseId
              : item.id === product.id && !item.selectedVariation;
            return isSame ? { ...item, quantity: item.quantity + 1 } : item;
          });
          // 🚀 Update total alongside items
          set({ items: newItems, isOpen: true, total: calculateTotal(newItems) });
        } else {
          const newItems = [...items, { ...product, price, selectedVariation: variation, quantity: 1 }];
          // 🚀 Update total alongside items
          set({ items: newItems, isOpen: true, total: calculateTotal(newItems) });
        }
      },

      buyNow: (product, variation) => {
        const rawPrice = variation ? variation.price : product.price;
        const price = String(rawPrice).replace(/[^\d.]/g, '') || '0';
        const newItems = [{ ...product, price, selectedVariation: variation, quantity: 1 }];

        set({ 
          items: newItems, 
          isOpen: false,
          total: calculateTotal(newItems) // 🚀 Update total
        });
        
        trackPixel('AddToCart', {
          content_ids: [product.id],
          content_name: product.name,
          content_type: 'product',
          value: parseFloat(price),
          currency: 'BDT',
          is_direct: true
        });
      },

      updateQuantity: (cartItemId, delta) => {
        const newItems = get().items.map(item => {
          const itemId = item.selectedVariation ? `${item.id}-${item.selectedVariation.databaseId}` : item.id;
          if (itemId === cartItemId) {
            const newQty = Math.max(1, item.quantity + delta);
            return { ...item, quantity: newQty };
          }
          return item;
        });
        set({ items: newItems, total: calculateTotal(newItems) }); // 🚀 Update total
      },

      removeItem: (cartItemId) => {
        const newItems = get().items.filter(item => {
          const itemId = item.selectedVariation ? `${item.id}-${item.selectedVariation.databaseId}` : item.id;
          return itemId !== cartItemId;
        });
        set({ items: newItems, total: calculateTotal(newItems) }); // 🚀 Update total
      },

      clearCart: () => set({ items: [], total: 0 }),
    }),
    {
      name: 'bunon-cart-storage',
      storage: createJSONStorage(() => localStorage), // 🚀 Force explicit localStorage
      version: 2, // 🚀 Bumped version to 2 to automatically clear the old corrupted cache
      migrate: (persistedState: any, version) => {
        if (version < 2) {
          // Clear cart on version mismatch to avoid errors from old data structure
          return { ...persistedState, items: [], total: 0 };
        }
        return persistedState;
      },
    }
  )
);

interface WishlistStore {
  items: Product[];
  addItem: (product: Product) => void;
  removeItem: (productId: string | number) => void;
  toggleItem: (product: Product) => void;
  isInWishlist: (productId: string | number) => boolean;
}

export const useWishlist = create<WishlistStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product) => {
        if (!get().isInWishlist(product.id)) {
          set({ items: [...get().items, product] });
        }
      },
      removeItem: (productId) => {
        set({ items: get().items.filter(item => item.id !== productId) });
      },
      toggleItem: (product) => {
        if (get().isInWishlist(product.id)) {
          get().removeItem(product.id);
        } else {
          get().addItem(product);
        }
      },
      isInWishlist: (productId) => {
        return get().items.some(item => item.id === productId);
      }
    }),
    {
      name: 'bunon-wishlist-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);