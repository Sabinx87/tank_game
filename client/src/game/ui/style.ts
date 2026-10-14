import type Phaser from 'phaser';

/** Shared text styles for the in-canvas HUD. */
export const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

export const textStyle = (size = 16, color = '#ffffff', bold = false): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT,
  fontSize: `${size}px`,
  color,
  fontStyle: bold ? 'bold' : 'normal',
  stroke: '#000000',
  strokeThickness: 3,
});

export const HUD_DEPTH = 100;
export const PANEL_COLOR = 0x0b1020;
export const PANEL_ALPHA = 0.55;
