import { ref } from 'vue';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
}

export interface ConfirmState extends ConfirmOptions {
  id: number;
}

export const confirmState = ref<ConfirmState | null>(null);

let resolver: ((value: boolean) => void) | null = null;
let sequence = 0;

/** 打开确认框，返回用户的选择；重复调用会把上一个未决的确认按「取消」结束。 */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  if (resolver) {
    const previous = resolver;
    resolver = null;
    previous(false);
  }

  return new Promise<boolean>((resolve) => {
    resolver = resolve;
    confirmState.value = { ...options, id: ++sequence };
  });
}

export function settleConfirm(value: boolean): void {
  const resolve = resolver;
  resolver = null;
  confirmState.value = null;
  resolve?.(value);
}
