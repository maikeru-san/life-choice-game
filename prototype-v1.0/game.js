// ==========================================
// 人生の選択と運命の波 (Life Choices Game)
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 定数・ゲーム設定 ---
const GAME_DURATION = 30.0; // 制限時間 30秒
const AUTO_MOVE_INTERVAL = 3.0; // 自動移動の間隔 3秒
const MAX_MANUAL_CHOICES = 5; // 任意移動の最大回数
const NUM_BARS = 9; // 長方形の本数
const BAR_WIDTH = 64; // バーの横幅(px)
const BAR_GAP = 28; // バー同士の隙間(px)
const PLAYER_RADIUS = 10; // プレイヤードットの半径

// --- UI要素 ---
const timerDisplay = document.getElementById('timer-display');
const autoMoveBar = document.getElementById('auto-move-bar');
const scoreDisplay = document.getElementById('score-display');
const choicesLeftDisplay = document.getElementById('choices-left');
const choiceDotsContainer = document.getElementById('choice-dots');

const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const resultOverlay = document.getElementById('result-overlay');
const replayBtn = document.getElementById('replay-btn');

const finalScoreDisplay = document.getElementById('final-score');
const resultRankDisplay = document.getElementById('result-rank');
const resultCommentDisplay = document.getElementById('result-comment');
const statManualCount = document.getElementById('stat-manual-count');
const statMaxScore = document.getElementById('stat-max-score');
const statMinScore = document.getElementById('stat-min-score');

// --- ゲーム状態管理 ---
let gameState = 'ready'; // 'ready' | 'playing' | 'ended'
let gameTime = 0; // 経過時間(秒)
let lastTimestamp = 0;
let nextAutoMoveTime = AUTO_MOVE_INTERVAL;
let manualChoicesLeft = MAX_MANUAL_CHOICES;
let manualMovesUsed = 0;

let baseCenterY = canvas.height / 2; // スタート時の基準高度 (280)
let maxHappinessRecorded = 0;
let minHappinessRecorded = 0;

// 移動エフェクト用
let moveEffects = [];

// 軌跡ログ [{x, y, time}]
let trajectory = [];

// --- バー（長方形）オブジェクト配列 ---
let bars = [];

// プレイヤーステータス
let player = {
  barIndex: 4, // 0〜8 (中央は4)
  y: baseCenterY,
  displayX: 0
};

const SCORE_SCALE = 1.4; // 振幅調整に合わせてスコアの見栄えを補正

// --- バーの初期化 ---
function initBars() {
  bars = [];
  const totalWidth = NUM_BARS * BAR_WIDTH + (NUM_BARS - 1) * BAR_GAP;
  const startX = (canvas.width - totalWidth) / 2 + BAR_WIDTH / 2;

  for (let i = 0; i < NUM_BARS; i++) {
    const x = startX + i * (BAR_WIDTH + BAR_GAP);
    // 周期運動パラメータ: 画面外に出にくくするため振幅を35px〜80pxに適正化
    const amplitude = 35 + Math.random() * 45; // 振幅: 35px 〜 80px
    const period = 2.4 + Math.random() * 3.8; // 周期: 2.4s 〜 6.2s
    const phase = Math.random() * Math.PI * 2; // 初期位相

    bars.push({
      index: i,
      x: x,
      amplitude: amplitude,
      period: period,
      phase: phase,
      currentOffset: 0,
      prevOffset: 0
    });
  }

  // 初期オフセットの算出
  bars.forEach(bar => {
    const offset = bar.amplitude * Math.sin(bar.phase);
    bar.currentOffset = offset;
    bar.prevOffset = offset;
  });
}

// 任意移動アイコンUIの更新
function updateChoiceDotsUI() {
  choiceDotsContainer.innerHTML = '';
  for (let i = 0; i < MAX_MANUAL_CHOICES; i++) {
    const dot = document.createElement('div');
    dot.className = 'choice-dot' + (i >= manualChoicesLeft ? ' used' : '');
    choiceDotsContainer.appendChild(dot);
  }
  choicesLeftDisplay.textContent = manualChoicesLeft;
}

// ゲームのリセット・初期化
function resetGame() {
  gameTime = 0;
  nextAutoMoveTime = AUTO_MOVE_INTERVAL;
  manualChoicesLeft = MAX_MANUAL_CHOICES;
  manualMovesUsed = 0;
  maxHappinessRecorded = 0;
  minHappinessRecorded = 0;
  trajectory = [];
  moveEffects = [];

  initBars();

  player.barIndex = 4; // 真ん中のバー
  player.y = baseCenterY;
  player.displayX = bars[player.barIndex].x;

  updateChoiceDotsUI();
  updateHUD(0);
}

// --- 横移動処理（乗り移り） ---
function movePlayer(direction, isManual = false) {
  if (gameState !== 'playing') return;

  const currentIdx = player.barIndex;
  let targetIdx = currentIdx + direction;

  // 壁の境界チェック
  if (targetIdx < 0 || targetIdx >= NUM_BARS) {
    if (!isManual) {
      // 自動移動の場合は反対側へ強制移動
      targetIdx = currentIdx - direction;
    } else {
      // 任意移動で端を押した場合は移動不可（回数も消費しない）
      return;
    }
  }

  if (isManual) {
    if (manualChoicesLeft <= 0) return;
    manualChoicesLeft--;
    manualMovesUsed++;
    updateChoiceDotsUI();
  }

  const prevX = bars[player.barIndex].x;
  player.barIndex = targetIdx;
  const newX = bars[player.barIndex].x;

  // 乗り移りエフェクト（軌跡フラッシュ）
  moveEffects.push({
    fromX: prevX,
    toX: newX,
    y: player.y,
    life: 1.0,
    isManual: isManual
  });
}

// --- HUD (スコア・タイマー) の更新 ---
function updateHUD(currentHappiness) {
  const timeLeft = Math.max(0, GAME_DURATION - gameTime);
  timerDisplay.textContent = timeLeft.toFixed(1);

  // 次の自動移動ゲージ (3秒サイクル)
  const cycleTime = gameTime % AUTO_MOVE_INTERVAL;
  const cyclePercent = ((AUTO_MOVE_INTERVAL - cycleTime) / AUTO_MOVE_INTERVAL) * 100;
  autoMoveBar.style.width = `${cyclePercent}%`;

  // スコア表示 (+ / -)
  const sign = currentHappiness > 0 ? '+' : (currentHappiness < 0 ? '-' : '±');
  const absScore = Math.abs(Math.round(currentHappiness));
  scoreDisplay.textContent = `${sign}${absScore}`;

  scoreDisplay.className = 'value' + 
    (currentHappiness > 10 ? ' positive' : (currentHappiness < -10 ? ' negative' : ''));
}

// --- 終了処理 & リザルト表示 ---
function endGame() {
  gameState = 'ended';

  const finalScore = Math.round((baseCenterY - player.y) * SCORE_SCALE);
  const sign = finalScore > 0 ? '+' : (finalScore < 0 ? '-' : '±');
  finalScoreDisplay.textContent = `${sign}${Math.abs(finalScore)} pt`;

  // 評価とメッセージの判定
  let rank = '穏やかな平穏';
  let comment = '';

  if (finalScore >= 160) {
    rank = '🌟 無上の幸福';
    comment = '幾重にも重なる波のうねりを捉え、頂点へと駆け上がりました。運と選択が奇跡的に調和した最高の人生です。';
  } else if (finalScore >= 60) {
    rank = '✨ 充実した人生';
    comment = '時に抗い、時に流れに乗りながら、着実に豊かな高みへと辿り着きました。納得のいく素晴らしい選択の連続でした。';
  } else if (finalScore >= -50) {
    rank = '🌿 平穏な人生';
    comment = '大きな上昇も下降も味わいながら、最終的には平穏な境地に着地しました。酸いも甘いも噛み分けた味わい深い人生です。';
  } else if (finalScore >= -150) {
    rank = '🌧️ 試練多き人生';
    comment = '抗いきれない運命の荒波に呑まれる瞬間が多かったようです。しかし、その中でも下した決断には確かに意志が宿っていました。';
  } else {
    rank = '⚡ 激動の荒波';
    comment = '幾度となく深い底へと導かれる過酷な波乱の連続でした。どれほど最善を尽くしても運命に阻まれる、人生の不条理を体現しました。';
  }

  resultRankDisplay.textContent = rank;
  resultCommentDisplay.textContent = comment;

  statManualCount.textContent = `${manualMovesUsed} / ${MAX_MANUAL_CHOICES} 回`;
  statMaxScore.textContent = `+${Math.round(maxHappinessRecorded)} pt`;
  statMinScore.textContent = `${Math.round(minHappinessRecorded)} pt`;

  resultOverlay.classList.remove('hidden');
}

// --- ゲーム更新ロジック (Tick) ---
function update(dt) {
  if (gameState !== 'playing') return;

  gameTime += dt;

  // 30秒終了判定
  if (gameTime >= GAME_DURATION) {
    gameTime = GAME_DURATION;
    endGame();
    return;
  }

  // 自動移動（3秒ごと）
  if (gameTime >= nextAutoMoveTime) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    movePlayer(dir, false);
    nextAutoMoveTime += AUTO_MOVE_INTERVAL;
  }

  // バーの周期運動更新
  bars.forEach(bar => {
    bar.prevOffset = bar.currentOffset;
    // y = A * sin(2π * t / T + φ)
    const angle = (2 * Math.PI * gameTime) / bar.period + bar.phase;
    bar.currentOffset = bar.amplitude * Math.sin(angle);
  });

  // 現在乗っているバーの移動量をプレイヤーに加算
  const activeBar = bars[player.barIndex];
  const deltaY = activeBar.currentOffset - activeBar.prevOffset;
  player.y += deltaY;
  player.displayX = activeBar.x;

  // 現在の幸福度 (画面比率スケーリング)
  const currentHappiness = (baseCenterY - player.y) * SCORE_SCALE;
  if (currentHappiness > maxHappinessRecorded) maxHappinessRecorded = currentHappiness;
  if (currentHappiness < minHappinessRecorded) minHappinessRecorded = currentHappiness;

  // 軌跡記録 (0.05秒間隔程度)
  if (trajectory.length === 0 || gameTime - trajectory[trajectory.length - 1].time > 0.05) {
    trajectory.push({
      x: player.displayX,
      y: player.y,
      time: gameTime,
      happiness: currentHappiness
    });
  }

  // 移動エフェクト更新
  for (let i = moveEffects.length - 1; i >= 0; i--) {
    moveEffects[i].life -= dt * 2.5;
    if (moveEffects[i].life <= 0) {
      moveEffects.splice(i, 1);
    }
  }

  updateHUD(currentHappiness);
}

// --- 描画処理 (Render) ---
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. 背景の基準線 (幸福 ±0)
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(30, baseCenterY);
  ctx.lineTo(canvas.width - 30, baseCenterY);
  ctx.stroke();

  // 基準線ラベル
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '11px sans-serif';
  ctx.fillText('基準高度 (±0 pt)', 35, baseCenterY - 6);
  ctx.fillText('↑ 幸福 (+)', canvas.width - 90, 30);
  ctx.fillText('↓ 不幸 (-)', canvas.width - 90, canvas.height - 20);
  ctx.restore();

  // 2. 9本のバー（長方形）の描画
  bars.forEach((bar, idx) => {
    const isCurrent = (idx === player.barIndex);
    const barX = bar.x - BAR_WIDTH / 2;

    // 長方形の上下位置（画面全体を十分に覆う長い縦帯）
    const barHeight = canvas.height * 2; 
    const barY = (canvas.height / 2 - barHeight / 2) + bar.currentOffset;

    // バーのグラデーション
    const grad = ctx.createLinearGradient(0, barY, 0, barY + barHeight);
    if (isCurrent) {
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
      grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.45)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.28)');
    } else {
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
      grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.12)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barX, 10, BAR_WIDTH, canvas.height - 20, 8);
    ctx.fill();

    // バーの枠線
    ctx.strokeStyle = isCurrent ? 'rgba(56, 189, 248, 0.8)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = isCurrent ? 2 : 1;
    ctx.stroke();

    // バーの動的テクスチャ（縞模様・グリッドで上下の動きを可視化）
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(barX, 10, BAR_WIDTH, canvas.height - 20, 8);
    ctx.clip();

    ctx.strokeStyle = isCurrent ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    const stripeGap = 30;
    const offsetMod = bar.currentOffset % stripeGap;
    for (let y = -stripeGap; y < canvas.height + stripeGap; y += stripeGap) {
      ctx.beginPath();
      ctx.moveTo(barX, y + offsetMod);
      ctx.lineTo(barX + BAR_WIDTH, y + offsetMod);
      ctx.stroke();
    }

    // 列番号
    ctx.fillStyle = isCurrent ? '#38bdf8' : 'rgba(255, 255, 255, 0.3)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${idx + 1}`, bar.x, canvas.height - 24);

    ctx.restore();
  });

  // 3. 軌跡（人生の足跡ライン）の描画
  if (trajectory.length > 1) {
    ctx.save();
    for (let i = 1; i < trajectory.length; i++) {
      const p1 = trajectory[i - 1];
      const p2 = trajectory[i];

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      const color = p2.happiness >= 0 
        ? `rgba(74, 222, 128, ${(i / trajectory.length) * 0.7})` 
        : `rgba(248, 113, 113, ${(i / trajectory.length) * 0.7})`;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  // 4. 移動エフェクト（横移動時の光るスライド線）
  moveEffects.forEach(effect => {
    ctx.save();
    ctx.strokeStyle = effect.isManual 
      ? `rgba(245, 158, 11, ${effect.life})` 
      : `rgba(168, 85, 247, ${effect.life})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(effect.fromX, effect.y);
    ctx.lineTo(effect.toX, effect.y);
    ctx.stroke();
    ctx.restore();
  });

  // 5. プレイヤードットの描画
  ctx.save();
  // 外側の発光パルス
  const pulse = Math.sin(gameTime * 8) * 4;
  const gradient = ctx.createRadialGradient(
    player.displayX, player.y, 2,
    player.displayX, player.y, PLAYER_RADIUS + 8 + pulse
  );
  gradient.addColorStop(0, '#4ade80');
  gradient.addColorStop(0.5, 'rgba(74, 222, 128, 0.5)');
  gradient.addColorStop(1, 'rgba(74, 222, 128, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(player.displayX, player.y, PLAYER_RADIUS + 8 + pulse, 0, Math.PI * 2);
  ctx.fill();

  // 本体のドット
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(player.displayX, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 6. 極端な高低で見切れた場合の画面端インジケーター
  if (player.y < 10) {
    // 画面上端に見切れた時 (超幸福)
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.moveTo(player.displayX, 6);
    ctx.lineTo(player.displayX - 8, 18);
    ctx.lineTo(player.displayX + 8, 18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(74, 222, 128, 0.9)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▲ 高みへ', player.displayX, 32);
  } else if (player.y > canvas.height - 10) {
    // 画面下端に見切れた時 (超不幸)
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.moveTo(player.displayX, canvas.height - 6);
    ctx.lineTo(player.displayX - 8, canvas.height - 18);
    ctx.lineTo(player.displayX + 8, canvas.height - 18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(248, 113, 113, 0.9)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼ 底へ', player.displayX, canvas.height - 24);
  }

  ctx.restore();
}

// --- メインゲームループ ---
function gameLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1); // 最大デルタクランプ
  lastTimestamp = timestamp;

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}

// --- キーボード操作 ---
window.addEventListener('keydown', (e) => {
  // スタート / リプレイ
  if (e.code === 'Space') {
    if (gameState === 'ready') {
      startGame();
      e.preventDefault();
      return;
    } else if (gameState === 'ended') {
      replayGame();
      e.preventDefault();
      return;
    }
  }

  if (gameState !== 'playing') return;

  if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    movePlayer(-1, true);
    e.preventDefault();
  } else if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    movePlayer(1, true);
    e.preventDefault();
  }
});

// ゲーム開始処理
function startGame() {
  resetGame();
  startOverlay.classList.add('hidden');
  resultOverlay.classList.add('hidden');
  gameState = 'playing';
  lastTimestamp = performance.now();
}

// リプレイ処理
function replayGame() {
  resetGame();
  resultOverlay.classList.add('hidden');
  gameState = 'playing';
  lastTimestamp = performance.now();
}

// クリックイベント
startBtn.addEventListener('click', startGame);
replayBtn.addEventListener('click', replayGame);

// 初期起動
resetGame();
requestAnimationFrame(gameLoop);
