import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ShoppingBag, X } from 'lucide-react';
import { useGlobalCart } from '../contexts/GlobalCartContext';

/**
 * Small floating notice shown while the customer is looking at store B but the cart still holds
 * items from store A. Adding from store B still asks to empty the cart first (existing behaviour).
 */
export const CartOtherStoreNotice: React.FC = () => {
  const { pathname } = useLocation();
  const { cart, clearCart } = useGlobalCart();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const match = pathname.match(/^\/order-(?:foodies|clothes|hardware|soweto|small-shops)\/([^/]+)/);
  const viewingStoreId = match ? decodeURIComponent(match[1]) : null;
  const cartStore = cart.length > 0 ? cart[0] : null;
  const otherStore = !!viewingStoreId && !!cartStore && cartStore.storeId !== viewingStoreId;

  // show it again each time a different store page is opened
  useEffect(() => { setDismissedFor(null); }, [viewingStoreId]);

  if (!otherStore || dismissedFor === viewingStoreId) return null;

  return (
    <div
      className="fixed left-1/2 top-3 z-40 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-white px-3 py-2.5 shadow-lg ring-1 ring-black/10 dark:bg-gray-900 dark:ring-white/10"
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-[#5B2EFF] dark:bg-purple-900/40">
          <ShoppingBag size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            You have {cart.length} item{cart.length === 1 ? '' : 's'} from {cartStore!.storeName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Orders can only come from one store. Clear your cart to order from this one.
          </p>
          <button
            type="button"
            onClick={() => clearCart()}
            className="mt-1 text-xs font-semibold text-[#5B2EFF]"
          >
            Clear cart
          </button>
        </div>
        <button type="button" aria-label="Dismiss" onClick={() => setDismissedFor(viewingStoreId)} className="p-1 text-gray-400">
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default CartOtherStoreNotice;
