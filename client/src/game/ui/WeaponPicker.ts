import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '@shared/constants';
import type { Inventory } from '@shared/types';
import { WEAPONS, ownedCount, type WeaponDef } from '@shared/weapons';
import { HUD_DEPTH, PANEL_ALPHA, PANEL_COLOR, textStyle } from './style';

const SLOT_W = 118;
const SLOT_H = 54;
const GAP = 6;

/** Bottom-centre: the weapons you own. Click a slot or press its number key. */
export class WeaponPicker {
  private readonly container: Phaser.GameObjects.Container;
  private slots: Phaser.GameObjects.Container[] = [];
  private key = '';
  /** Weapons currently shown, in slot order (slot 1 = index 0). */
  owned: WeaponDef[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onSelect: (weaponId: string) => void,
  ) {
    this.container = scene.add.container(WORLD_WIDTH / 2, WORLD_HEIGHT - SLOT_H - 12).setDepth(HUD_DEPTH);
  }

  update(inventory: Inventory, selectedId: string, enabled: boolean): void {
    this.owned = WEAPONS.filter((w) => ownedCount(inventory, w.id) > 0);
    const key = JSON.stringify([inventory, selectedId, enabled]);
    if (key === this.key) return;
    this.key = key;

    this.slots.forEach((s) => s.destroy());
    const total = this.owned.length * SLOT_W + (this.owned.length - 1) * GAP;
    // Keep clear of the power meter (left) and the action bar (right).
    const centre = WORLD_WIDTH / 2 - 100;
    this.slots = this.owned.map((w, i) => {
      const selected = w.id === selectedId;
      const count = ownedCount(inventory, w.id);
      const g = this.scene.add.graphics();
      g.fillStyle(PANEL_COLOR, selected ? 0.85 : PANEL_ALPHA).fillRoundedRect(0, 0, SLOT_W, SLOT_H, 8);
      if (selected) g.lineStyle(3, 0xffd166, 1).strokeRoundedRect(0, 0, SLOT_W, SLOT_H, 8);
      g.fillStyle(w.color, 1).fillCircle(16, 18, 7);
      const num = this.scene.add.text(SLOT_W - 8, SLOT_H - 5, `[${i + 1}]`, textStyle(12, '#bcd')).setOrigin(1, 1);
      const name = this.scene.add.text(28, 9, w.name, textStyle(12, selected ? '#ffd166' : '#ffffff', selected));
      const cnt = this.scene.add.text(10, 32, count === Infinity ? '∞' : `× ${count}`, textStyle(13, '#ddd'));
      const slot = this.scene.add.container(centre - WORLD_WIDTH / 2 - total / 2 + i * (SLOT_W + GAP), 0, [g, num, name, cnt]);
      slot.setSize(SLOT_W, SLOT_H).setAlpha(enabled ? 1 : 0.6);
      slot.setInteractive(new Phaser.Geom.Rectangle(0, 0, SLOT_W, SLOT_H), Phaser.Geom.Rectangle.Contains);
      slot.on('pointerdown', () => this.onSelect(w.id));
      this.container.add(slot);
      return slot;
    });
  }
}
