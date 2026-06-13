// In-race HUD: position, lap, timer, item slot, minimap, center messages.

import { drawText, textWidth } from '../engine/font.js';
import { formatTime } from '../engine/math.js';

const ORDINALS = ['1ST', '2ND', '3RD', '4TH'];
const ORD_COLORS = ['#ffd83d', '#cfcfd8', '#d89a5a', '#9ab0c8'];

export function drawHUD(ctx, race, W, H) {
  const player = race.player;

  // top-left: position (GP) or lap times (Time Trial), FPS under it
  if (race.mode === 'tt') {
    const last = player.lapTimes.length ? player.lapTimes[player.lapTimes.length - 1] : null;
    const best = player.lapTimes.length ? Math.min(...player.lapTimes) : null;
    drawText(ctx, `LAST ${formatTime(last)}`, 8, 8, { color: '#e8e8f0', shadow: '#181828' });
    drawText(ctx, `BEST ${formatTime(best)}`, 8, 17, { color: '#4fe3c0', shadow: '#181828' });
    drawText(ctx, `${race.game.fps | 0} FPS`, 8, 27, { color: '#7a8a90', shadow: '#181828' });
  } else {
    const pos = race.positionOf(player);
    drawText(ctx, ORDINALS[pos], 8, 8, { scale: 3, color: ORD_COLORS[pos], outline: '#181828' });
    drawText(ctx, `${race.game.fps | 0} FPS`, 8, 26, { color: '#7a8a90', shadow: '#181828' });
  }

  // lap (top-right) + checkpoint validity lamp under it
  const lap = Math.min(Math.max(player.lap, 1), race.totalLaps);
  drawText(ctx, `LAP ${lap}/${race.totalLaps}`, W - 8, 9, { align: 'right', scale: 2, color: '#fff', outline: '#181828' });
  drawText(ctx, player.passedHalf ? 'CP OK' : 'CP --', W - 8, 26, {
    align: 'right',
    color: player.passedHalf ? '#7df07d' : '#7a8a90',
    shadow: '#181828',
  });

  // race timer (top-center) — locks to the player's final time after the line
  drawText(ctx, formatTime(player.finished ? player.finishTime : race.raceTime), W / 2, 8, { align: 'center', color: '#e8e8f0', shadow: '#181828' });
  if (race.lapPopupT > 0 && player.lapTimes.length) {
    drawText(ctx, formatTime(player.lapTimes[player.lapTimes.length - 1]), W / 2, 18, {
      align: 'center', color: '#ffd83d', shadow: '#181828',
    });
  }

  // item slot (bottom-left) — hidden in Time Trial
  let speedX = 34;
  if (race.itemsEnabled) {
    ctx.fillStyle = 'rgba(16,16,32,0.7)';
    ctx.fillRect(7, H - 27, 22, 22);
    ctx.strokeStyle = '#cfcfd8';
    ctx.strokeRect(7.5, H - 26.5, 21, 21);
    const icons = race.sprites.icons;
    if (player.itemRoll > 0) {
      // honest roulette: cycle through everything that could come up
      const cycle = ['turbo', 'puck', 'oil', 'shield'];
      ctx.drawImage(icons[cycle[Math.floor(race.time * 12) % cycle.length]], 12, H - 22);
    } else if (player.item && icons[player.item]) {
      ctx.drawImage(icons[player.item], 12, H - 22);
    }
  } else {
    speedX = 8;
  }

  // speedometer (world units scaled to a kmh-ish number)
  const kmh = Math.round(Math.hypot(player.vx, player.vy) * 0.62);
  drawText(ctx, String(kmh), speedX, H - 24, { scale: 2, color: player.boostT > 0 ? '#ffd83d' : '#fff', outline: '#181828' });
  drawText(ctx, 'KMH', speedX, H - 12, { color: '#9090a8', shadow: '#181828' });

  // minimap (bottom-right)
  const mm = race.track.minimap;
  const mx = W - mm.width - 5, my = H - mm.height - 3;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(mm, mx, my);
  ctx.globalAlpha = 1;
  for (const k of race.karts) {
    const x = mx + mm.mapX(k.x), y = my + mm.mapY(k.y);
    if (k.isPlayer) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    }
    ctx.fillStyle = k.racer.uiColor;
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }

  // center message
  if (race.message && race.messageT > 0) {
    const a = Math.min(1, race.messageT * 3);
    ctx.globalAlpha = a;
    drawText(ctx, race.message, W / 2, H * 0.3, {
      align: 'center', scale: 3, color: race.messageColor, outline: '#181828',
    });
    ctx.globalAlpha = 1;
  }

  // wrong way warning (steady, not blinking, when reduced motion is on)
  if (player.wrongWayT > 1.2 && (race.calm || Math.floor(race.time * 3) % 2 === 0)) {
    drawText(ctx, 'WRONG WAY!', W / 2, H * 0.45, { align: 'center', scale: 2, color: '#ff5050', outline: '#181828' });
  }
}

export function drawCountdown(ctx, count, W, H) {
  // count: 3,2,1 then 0 = GO
  const cx = W / 2, cy = H * 0.22;
  ctx.fillStyle = 'rgba(16,16,32,0.8)';
  ctx.fillRect(cx - 34, cy - 8, 68, 26);
  for (let i = 0; i < 3; i++) {
    const lit = count <= 3 - i && count > 0;
    const go = count === 0;
    ctx.fillStyle = go ? '#3de05a' : lit ? '#ff4040' : '#402030';
    ctx.beginPath();
    ctx.arc(cx - 20 + i * 20, cy + 5, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPauseMenu(ctx, items, selected, W, H) {
  ctx.fillStyle = 'rgba(8,8,20,0.72)';
  ctx.fillRect(0, 0, W, H);
  drawText(ctx, 'PAUSED', W / 2, H * 0.22, { align: 'center', scale: 3, color: '#ffd83d', outline: '#181828' });
  items.forEach((label, i) => {
    const y = H * 0.45 + i * 16;
    const sel = i === selected;
    if (sel) drawText(ctx, '>', W / 2 - textWidth(label, 2) / 2 - 12, y, { scale: 2, color: '#ffd83d' });
    drawText(ctx, label, W / 2, y, {
      align: 'center', scale: 2,
      color: sel ? '#ffffff' : '#9090a8',
      shadow: '#181828',
    });
  });
}
