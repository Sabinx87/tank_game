/** Tiny DOM helpers for the HTML pages (lobby, room, shop, leaderboard). */
import { sounds } from './audio/sounds';

type Props = Record<string, unknown> & { class?: string; style?: string; on?: Record<string, (e: Event) => void> };
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'on') {
      for (const [ev, fn] of Object.entries(value as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key === 'style') {
      el.setAttribute('style', String(value));
    } else if (value === true) {
      el.setAttribute(key, '');
    } else if (value !== false && value !== undefined && value !== null) {
      (el as unknown as Record<string, unknown>)[key] = value;
    }
  }
  append(el, ...children);
  return el;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) if (c) parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
}

export function replaceChildren(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  append(parent, ...children);
}

export function toast(message: string, kind: 'info' | 'error' | 'success' = 'info', ms = 3500): void {
  const box = document.getElementById('toasts')!;
  const el = h('div', { class: `toast toast-${kind}` }, message);
  box.appendChild(el);
  if (kind === 'error') sounds.play('error');
  setTimeout(() => el.classList.add('fade'), ms - 400);
  setTimeout(() => el.remove(), ms);
}

/** Copy text, falling back to execCommand where the Clipboard API is unavailable (plain http on a LAN IP). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export interface Page {
  readonly el: HTMLElement;
  update(): void;
  destroy?(): void;
}
