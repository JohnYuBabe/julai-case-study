import { computed, ref } from 'vue';

export interface IdentityOption {
  id: string | null;
  label: string;
  hint: string;
}

export const IDENTITY_OPTIONS: IdentityOption[] = [
  { id: null, label: '访客', hint: '未登录' },
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `u-${index + 1}`,
    label: `队员 ${index + 1}`,
    hint: `u-${index + 1}`,
  })),
  { id: 'u-organizer', label: '队长', hint: 'u-organizer' },
];

const STORAGE_KEY = 'julai-demo-identity';
const VALID = new Set(
  IDENTITY_OPTIONS.map((option) => option.id).filter(
    (id): id is string => id !== null,
  ),
);

function readStored(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // 认不出来的值一律按访客处理，避免把脏数据发给服务端。
    return raw && VALID.has(raw) ? raw : null;
  } catch {
    // 隐私模式下 localStorage 可能直接抛错。
    return null;
  }
}

/** 当前演示身份；`null` 表示未登录的访客。 */
export const identity = ref<string | null>(readStored());

export const identityOption = computed<IdentityOption>(
  () =>
    IDENTITY_OPTIONS.find((option) => option.id === identity.value) ??
    IDENTITY_OPTIONS[0]!,
);

export function setIdentity(id: string | null): void {
  identity.value = id;
  try {
    localStorage.setItem(STORAGE_KEY, id ?? 'guest');
  } catch {
    // 存不下也不影响本次演示。
  }
}
