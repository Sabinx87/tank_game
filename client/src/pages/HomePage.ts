import { ROOM_CODE_LENGTH } from '@shared/constants';
import { sounds } from '../audio/sounds';
import { h, type Page } from '../dom';
import { api } from '../net';
import { store } from '../store';

/** Page 1: create a room or join one with a 4-digit code. */
export class HomePage implements Page {
  readonly el: HTMLElement;
  private error = h('p', { class: 'error' });
  private codeInput = h('input', {
    class: 'code-input',
    inputMode: 'numeric',
    maxLength: ROOM_CODE_LENGTH,
    placeholder: '0000',
    autocomplete: 'off',
  });
  private busy = false;

  constructor(initialError?: string) {
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.replace(/\D/g, '').slice(0, ROOM_CODE_LENGTH);
      this.error.textContent = '';
    });
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.join();
    });

    this.el = h(
      'div',
      { class: 'page home' },
      h('h1', { class: 'title' }, 'Pocket Artillery'),
      h('p', { class: 'subtitle' }, 'Turn-based tank battles with your friends'),
      h(
        'div',
        { class: 'card home-card' },
        h('button', { class: 'btn btn-primary btn-big', on: { click: () => void this.create() } }, 'Create Room'),
        h('div', { class: 'divider' }, 'or'),
        h(
          'div',
          { class: 'join-row' },
          this.codeInput,
          h('button', { class: 'btn btn-big', on: { click: () => void this.join() } }, 'Join Room'),
        ),
        this.error,
      ),
    );
    if (initialError) this.error.textContent = initialError;
  }

  update(): void {}

  private async create(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    sounds.play('click');
    const res = await api.createRoom();
    this.busy = false;
    if (!res.ok) {
      this.error.textContent = res.error;
      return;
    }
    store.setSession(res.data);
    store.emit('room', store.room);
  }

  private async join(): Promise<void> {
    if (this.busy) return;
    const code = this.codeInput.value.trim();
    if (!new RegExp(`^\\d{${ROOM_CODE_LENGTH}}$`).test(code)) {
      this.error.textContent = `Enter the ${ROOM_CODE_LENGTH}-digit room code`;
      sounds.play('error');
      return;
    }
    this.busy = true;
    sounds.play('click');
    const res = await api.joinRoom(code);
    this.busy = false;
    if (!res.ok) {
      this.error.textContent = res.error;
      sounds.play('error');
      return;
    }
    store.setSession(res.data);
    store.emit('room', store.room);
  }
}
