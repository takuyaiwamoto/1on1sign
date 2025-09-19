import { useCallback, useState } from 'react';
import { nanoid } from 'nanoid';
import { Toast } from '../lib/types';

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((message: string, tone: Toast['tone'] = 'info', ttl = 4000) => {
    const toast: Toast = { id: nanoid(6), message, tone, ttl };
    setToasts((prev) => [...prev, toast]);
    if (ttl > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== toast.id));
      }, ttl);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, pushToast, removeToast };
}
