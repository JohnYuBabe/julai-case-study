import { ref } from 'vue';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

export const toasts = ref<ToastItem[]>([]);

let sequence = 0;

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

export function showToast(text: string, kind: ToastKind = 'success'): void {
  const id = ++sequence;
  toasts.value = [...toasts.value, { id, kind, text }];
  window.setTimeout(
    () => dismissToast(id),
    kind === 'error' ? 6000 : 4200,
  );
}
