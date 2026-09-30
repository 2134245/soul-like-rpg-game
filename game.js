const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const bossNameEl = document.getElementById('bossName');
const bossHpBar = document.getElementById('bossHpBar');
const battleText = document.getElementById('battleText');
const hpBar = document.getElementById('hpBar');
const staminaBar = document.getElementById('staminaBar');
const upgradePanel = document.getElementById('upgradePanel');
const upgradeList = document.getElementById('upgradeList');

const keys = {};
let lastTime = 0;

const GAME = {
  state: 'playing',
  bossIndex: 0,
  slowMoTimer: 0,
  level: 1,
  textTimer: 0,
  textValue: '',
  finalVictory: false,
};

const bossCatalog = [
  { name: '灰燼守門者', hp: 160, speed: 105, damage: 14, radius: 36, color: '#fca55d' },
  { name: '裂地獵犬', hp: 240, speed: 128, damage: 18, radius: 42, color: '#ff7f7f' },
  { name: '深淵王者', hp: 340, speed: 135, damage: 22, radius: 48, color: '#9d8dff' },
  { name: '終焉之王', hp: 470, speed: 150, damage: 28, radius: 52, color: '#69f0ff' },
];

function createPlayer() {
  return {
    x: 220,
    y: 350,
    radius: 24,
    speed: 270,
    maxHp: 120,
    hp: 120,
    maxStamina: 100,
    stamina: 100,
    facing: 1,
    attackCooldown: 0,
    heavyCooldown: 0,
    dodgeCooldown: 0,
    blockCooldown: 0,
    attackState: null,
    invuln: 0,
    baseDamage: 24,
    guard: 0.55,
    critChance: 0.12,
    hitFlash: 0,
    blocking: false,
    dodgeTimer: 0,
    combo: 0,
    aims: { x: 0, y: 0 },
  };
}

let player = createPlayer();
let boss = null;
let particles = [];
let attacks = [];

function resetGameplay() {
  player = createPlayer();
  GAME.bossIndex = 0;
  GAME.state = 'playing';
  GAME.slowMoTimer = 0;
  GAME.level = 1;
  upgradePanel.classList.add('hidden');
  spawnBoss();
  setBattleText('擊敗 Boss，獲得靈魂力量');
}

function spawnBoss() {
  const data = bossCatalog[Math.min(GAME.bossIndex, bossCatalog.length - 1)];
  const bossLevelBoost = GAME.bossIndex * 0.2;

  boss = {
    name: data.name,
    x: 960,
    y: 350,
    radius: data.radius,
    speed: data.speed * (1 + bossLevelBoost),
    maxHp: Math.round(data.hp * (1 + GAME.bossIndex * 0.5)),
    hp: Math.round(data.hp * (1 + GAME.bossIndex * 0.5)),
    color: data.color,
    damage: Math.round(data.damage * (1 + GAME.bossIndex * 0.25)),
    cooldown: 0.7,
    attackState: null,
    flash: 0,
    facing: -1,
    introTimer: 0.75,
    deathTimer: 0,
  };

  bossNameEl.textContent = boss.name;
  updateBossBar();
}

function setBattleText(text) {
  battleText.textContent = text;
  GAME.textTimer = 1.8;
  GAME.textValue = text;
}

function updateBossBar() {
  if (!boss) return;
  const percent = Math.max(0, (boss.hp / boss.maxHp) * 100);
  bossHpBar.style.width = `${percent}%`;
}

function updatePlayerHud() {
  hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
  staminaBar.style.width = `${(player.stamina / player.maxStamina) * 100}%`;
}

function resetAttackState() {
  player.attackState = null;
}

function attemptAttack(type) {
  if (GAME.state !== 'playing' || player.attackCooldown > 0 || player.dodgeTimer > 0) return;
  if (player.stamina < (type === 'heavy' ? 20 : 13)) return;

  const isHeavy = type === 'heavy';
  player.attackCooldown = isHeavy ? 0.72 : 0.38;
  player.stamina = Math.max(0, player.stamina - (isHeavy ? 22 : 14));
  player.attackState = {
    type,
    duration: isHeavy ? 0.5 : 0.26,
    elapsed: 0,
    hitDone: false,
    range: isHeavy ? 150 : 104,
    damage: player.baseDamage * (isHeavy ? 1.7 : 1),
  };

  createBurst(player.x + player.facing * 60, player.y - 8, 10, '#f9d58f', isHeavy ? 1.7 : 1.0);
  if (Math.random() < player.critChance) {
    player.attackState.damage *= 1.7;
    createBurst(player.x + player.facing * 80, player.y - 8, 18, '#fff0a1', 1.5);
  }
}

function attemptDodge() {
  if (GAME.state !== 'playing' || player.dodgeCooldown > 0 || player.stamina < 20) return;
  const dirX = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
  const dirY = (keys['s'] ? 1 : 0) - (keys['w'] ? 1 : 0);
  const moveX = dirX || player.facing;

  player.dodgeTimer = 0.16;
  player.invuln = 0.22;
  player.dodgeCooldown = 0.55;
  player.stamina = Math.max(0, player.stamina - 22);
  player.x += moveX * 110;
  player.y += (dirY || 0) * 90;
  player.x = clamp(player.x, 60, 1120);
  player.y = clamp(player.y, 60, 640);
  createBurst(player.x, player.y, 14, '#7ec8ff', 1.1);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function handlePlayerInput(dt) {
  const moveX = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
  const moveY = (keys['s'] ? 1 : 0) - (keys['w'] ? 1 : 0);
  const moving = moveX !== 0 || moveY !== 0;

  if (moving) {
    const len = Math.hypot(moveX, moveY) || 1;
    const vx = (moveX / len) * player.speed;
    const vy = (moveY / len) * player.speed;
    player.x += vx * dt;
    player.y += vy * dt;
    player.x = clamp(player.x, 60, 1120);
    player.y = clamp(player.y, 60, 640);

    if (moveX !== 0) player.facing = moveX > 0 ? 1 : -1;
  }

  if (keys['l']) {
    player.blocking = true;
    if (player.stamina > 0) {
      player.stamina = Math.max(0, player.stamina - 18 * dt);
    }
  } else {
    player.blocking = false;
  }

  player.attackCooldown = Math.max(0, player.attackCooldown - dt);
  player.dodgeCooldown = Math.max(0, player.dodgeCooldown - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.hitFlash = Math.max(0, player.hitFlash - dt);
  player.dodgeTimer = Math.max(0, player.dodgeTimer - dt);

  if (player.stamina < player.maxStamina) {
    player.stamina = Math.min(player.maxStamina, player.stamina + 18 * dt);
  }
}

function handleAttackHitbox(dt) {
  if (!player.attackState || !boss) return;
  const atk = player.attackState;
  atk.elapsed += dt;

  const dx = boss.x - player.x;
  const dy = boss.y - player.y;
  const distance = Math.hypot(dx, dy);
  const inFront = (player.facing === 1 && dx > 0) || (player.facing === -1 && dx < 0);

  if (!atk.hitDone && atk.elapsed >= atk.duration * 0.45 && distance < atk.range && inFront) {
    atk.hitDone = true;
    boss.hp -= atk.damage;
    boss.flash = 0.2;
    createBurst(boss.x - player.facing * 18, boss.y - 12, 18, '#ffd662', 1.2);

    if (boss.hp <= 0) {
      boss.hp = 0;
      endBossFight();
    }
  }

  if (atk.elapsed >= atk.duration) {
    player.attackState = null;
  }
}

function takeDamage(amount) {
  if (GAME.state !== 'playing') return;
  let finalDamage = amount;

  if (player.blocking) {
    finalDamage *= 1 - player.guard;
    GAME.slowMoTimer = 0.8;
    createBurst(player.x, player.y, 22, '#7ec8ff', 1.4);
    setBattleText('格擋成功！時空被扭曲');
  }

  if (finalDamage > 0) {
    player.hp -= finalDamage;
    player.hitFlash = 0.25;
    player.invuln = 0.25;
    createBurst(player.x, player.y, 12, '#ff7070', 1.0);
  }

  if (player.hp <= 0) {
    player.hp = 0;
    endGameLoss();
  }
}

function beginBossAttack(type) {
  if (!boss || GAME.state !== 'playing') return;

  boss.attackState = {
    type,
    elapsed: 0,
    duration: type === 'slash' ? 0.8 : type === 'dash' ? 0.9 : 1.4,
    hitDone: false,
    damage: boss.damage,
  };
}

function bossLogic(dt) {
  if (!boss || GAME.state !== 'playing') return;

  boss.flash = Math.max(0, boss.flash - dt);
  if (boss.introTimer > 0) {
    boss.introTimer -= dt;
    return;
  }

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const distance = Math.hypot(dx, dy) || 1;
  const dirX = dx === 0 ? 0 : dx / Math.abs(dx);
  boss.facing = dx >= 0 ? 1 : -1;

  if (boss.attackState) {
    const atk = boss.attackState;
    atk.elapsed += dt;

    if (atk.type === 'slash') {
      if (!atk.hitDone && atk.elapsed > 0.42 && distance < 150) {
        atk.hitDone = true;
        takeDamage(atk.damage);
      }
      if (atk.elapsed > atk.duration) {
        boss.attackState = null;
      }
    } else if (atk.type === 'dash') {
      const push = Math.sign(dx || 1);
      boss.x += push * boss.speed * 1.4 * dt;
      boss.x = clamp(boss.x, 750, 1100);
      if (!atk.hitDone && distance < 85) {
        atk.hitDone = true;
        takeDamage(atk.damage + 8);
      }
      if (atk.elapsed > atk.duration) {
        boss.attackState = null;
      }
    } else if (atk.type === 'wave') {
      if (!atk.hitDone && atk.elapsed > 0.78) {
        atk.hitDone = true;
        if (Math.abs(player.y - boss.y) < 180 && Math.abs(player.x - boss.x) < 340) {
          takeDamage(atk.damage);
        }
      }
      if (atk.elapsed > atk.duration) {
        boss.attackState = null;
      }
    }

    return;
  }

  if (distance > 110) {
    boss.x += (dx / distance) * boss.speed * dt;
    boss.y += (dy / distance) * boss.speed * 0.75 * dt;
  }

  boss.cooldown -= dt;
  if (boss.cooldown <= 0) {
    const roll = Math.random();
    if (roll < 0.45) beginBossAttack('slash');
    else if (roll < 0.7) beginBossAttack('dash');
    else beginBossAttack('wave');
    boss.cooldown = 1.2 + Math.random() * 0.9;
  }
}

function createBurst(x, y, count, color, scale = 1) {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.7;
    particles.push({
      x,
      y,
      dx: Math.cos(angle) * (35 + Math.random() * 60) * scale,
      dy: Math.sin(angle) * (35 + Math.random() * 60) * scale,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 0.5 + Math.random() * 0.5,
      color,
      radius: 2 + Math.random() * 4,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.x += p.dx * dt;
    p.y += p.dy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function endBossFight() {
  if (GAME.state !== 'playing') return;
  GAME.state = 'upgrade';
  showUpgradeOptions();
}

function showUpgradeOptions() {
  const options = buildUpgradeChoices();
  upgradeList.innerHTML = '';

  options.forEach((opt) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'upgrade-card';
    card.innerHTML = `<h3>${opt.title}</h3><p>${opt.description}</p>`;
    card.addEventListener('click', () => {
      opt.apply();
      upgradePanel.classList.add('hidden');
      GAME.bossIndex += 1;
      if (GAME.bossIndex >= bossCatalog.length) {
        GAME.finalVictory = true;
        setBattleText('你已擊敗所有 Boss，靈魂王座已屬於你');
        GAME.state = 'victory';
        showVictoryState();
        return;
      }
      GAME.state = 'playing';
      spawnBoss();
      setBattleText(`${boss.name} 進場！`);
    });
    upgradeList.appendChild(card);
  });

  upgradePanel.classList.remove('hidden');
}

function buildUpgradeChoices() {
  return [
    {
      title: '鋼鐵裂劍',
      description: '+18% 攻擊力，劍擊更重',
      apply: () => {
        player.baseDamage *= 1.18;
        setBattleText('鋼鐵裂劍：劍意增幅');
      },
    },
    {
      title: '守護心輪',
      description: '+15% 格擋效率，傷害減免提升',
      apply: () => {
        player.guard = Math.min(0.8, player.guard + 0.12);
        player.maxHp += 20;
        player.hp = player.maxHp;
        setBattleText('守護心輪：防禦鍛鍊');
      },
    },
    {
      title: '靈魄奔流',
      description: '+12% 移速與體力上限，閃避更靈敏',
      apply: () => {
        player.speed *= 1.12;
        player.maxStamina += 18;
        player.stamina = player.maxStamina;
        setBattleText('靈魄奔流：快步與體力增強');
      },
    },
  ];
}

function showVictoryState() {
  upgradePanel.classList.remove('hidden');
  upgradeList.innerHTML = `
    <div class="upgrade-card" style="grid-column: 1 / -1; cursor: default;">
      <h3>勝利</h3>
      <p>你已擊敗全部 Boss，靈魂已成王。按 F5 重新開始新的裁決之路。</p>
    </div>
  `;
}

function endGameLoss() {
  if (GAME.state !== 'playing') return;
  GAME.state = 'loss';
  setBattleText('你倒下了，按 F5 再試一次');
  upgradePanel.classList.remove('hidden');
  upgradeList.innerHTML = `
    <div class="upgrade-card" style="grid-column: 1 / -1; cursor: default;">
      <h3>敗北</h3>
      <p>靈魂未破，重整後再戰。按 F5 重新開始。</p>
    </div>
  `;
}

function drawArena() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#101824');
  gradient.addColorStop(1, '#090d18');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(127, 200, 255, 0.12)';
  ctx.fillRect(34, 34, canvas.width - 68, canvas.height - 68);

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);
}

function drawPlayer() {
  const p = player;
  ctx.save();
  ctx.translate(p.x, p.y);

  if (p.hitFlash > 0) {
    ctx.shadowColor = '#ff6060';
    ctx.shadowBlur = 18;
  }

  if (p.blocking) {
    ctx.fillStyle = 'rgba(126,200,255,0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, p.radius + 18, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#d7ebff';
  ctx.beginPath();
  ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#101827';
  const swordLen = 36;
  ctx.translate(p.facing * 16, 0);
  ctx.rotate(p.facing === 1 ? 0.7 : -0.7);
  ctx.fillRect(14, -5, swordLen, 10);
  ctx.restore();
}

function drawBoss() {
  if (!boss) return;

  ctx.save();
  ctx.translate(boss.x, boss.y);

  if (boss.flash > 0) {
    ctx.shadowColor = '#ffb26b';
    ctx.shadowBlur = 24;
  }

  ctx.fillStyle = boss.color;
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fillRect(-boss.radius - 12, -boss.radius - 28, boss.radius * 2 + 24, 10);

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
    if (p.color.startsWith('#')) {
      ctx.fillStyle = hexToRgba(p.color, alpha);
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawAttackIndicators() {
  if (!player.attackState || !boss) return;
  const atk = player.attackState;
  const direction = player.facing;
  ctx.strokeStyle = atk.type === 'heavy' ? 'rgba(255, 204, 102, 0.7)' : 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(player.x + direction * 18, player.y);
  ctx.arc(player.x + direction * 30, player.y, atk.range * 0.52, direction === 1 ? -0.7 : Math.PI + 0.7, direction === 1 ? 0.7 : Math.PI - 0.7);
  ctx.stroke();
}

function drawBossAttackIndicators() {
  if (!boss || !boss.attackState) return;
  const atk = boss.attackState;
  if (atk.type === 'slash') {
    ctx.strokeStyle = 'rgba(255, 113, 127, 0.75)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, 118, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }

  if (atk.type === 'wave') {
    ctx.strokeStyle = 'rgba(157, 141, 255, 0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(boss.x - 200, boss.y);
    ctx.lineTo(boss.x + 200, boss.y);
    ctx.stroke();
  }
}

function update(dt) {
  if (GAME.state === 'playing') {
    const timeScale = GAME.slowMoTimer > 0 ? 0.18 : 1;
    const step = dt * timeScale;
    GAME.slowMoTimer = Math.max(0, GAME.slowMoTimer - dt);

    handlePlayerInput(step);
    handleAttackHitbox(step);
    bossLogic(step);
    updateParticles(step);

    updatePlayerHud();
    updateBossBar();

    if (GAME.textTimer > 0) {
      GAME.textTimer -= dt;
      if (GAME.textTimer <= 0) {
        battleText.textContent = '擊倒所有 Boss，突破靈魂之門';
      }
    }
  }
}

function render() {
  drawArena();
  drawBossAttackIndicators();
  drawPlayer();
  drawBoss();
  drawAttackIndicators();
  drawParticles();
}

function gameLoop(timestamp) {
  const delta = Math.min((timestamp - lastTime) / 1000 || 0.016, 0.032);
  lastTime = timestamp;
  update(delta);
  render();
  requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'j', 'k', 'l', 'shift', ' '].includes(key)) {
    event.preventDefault();
  }
  keys[key] = true;

  if (key === 'j') attemptAttack('light');
  if (key === 'k') attemptAttack('heavy');
  if (key === 'shift') attemptDodge();
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  keys[key] = false;
  if (key === 'l') player.blocking = false;
});

resetGameplay();
requestAnimationFrame(gameLoop);
