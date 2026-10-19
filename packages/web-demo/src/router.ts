import { ref } from 'vue';

export type Route =
  | { name: 'list' }
  | { name: 'detail'; id: string }
  | { name: 'matrix' };

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '');

  if (raw === '/states' || raw === '/states/') {
    return { name: 'matrix' };
  }

  const detail = raw.match(/^\/events\/([^/?#]+)\/?$/);
  if (detail?.[1]) {
    try {
      return { name: 'detail', id: decodeURIComponent(detail[1]) };
    } catch {
      return { name: 'list' };
    }
  }

  return { name: 'list' };
}

/**
 * 用 hash 路由：构建产物放在任意子路径下都能直接打开深链接，
 * 不依赖服务器补 try_files 规则。
 */
export const route = ref<Route>(parse());

window.addEventListener('hashchange', () => {
  route.value = parse();
  window.scrollTo(0, 0);
});

export function navigate(path: string): void {
  if (window.location.hash === `#${path}`) {
    route.value = parse();
    return;
  }
  window.location.hash = path;
}

export const goList = (): void => navigate('/');
export const goStates = (): void => navigate('/states');
export const goDetail = (id: string): void =>
  navigate(`/events/${encodeURIComponent(id)}`);
