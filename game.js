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
const replayBtnTop = document.getElementById('replay-btn-top');

const finalScoreDisplay = document.getElementById('final-score');
const resultRankDisplay = document.getElementById('result-rank');
const resultCommentDisplay = document.getElementById('result-comment');
const statManualCount = document.getElementById('stat-manual-count');
const statMaxScore = document.getElementById('stat-max-score');
const statMinScore = document.getElementById('stat-min-score');

// グラフ & 人生の転機用要素
const graphCanvas = document.getElementById('graphCanvas');
const graphCtx = graphCanvas ? graphCanvas.getContext('2d') : null;
const turningPointsList = document.getElementById('turning-points-list');

// 30秒を「人生100年」に換算するヘルパー (0s = 0歳, 30s = 100歳)
const timeToAge = (t) => Math.min(100, Math.max(0, Math.round((t / GAME_DURATION) * 100)));

// --- ゲーム状態管理 ---
let gameState = 'ready'; // 'ready' | 'playing' | 'ended'
let gameTime = 0; // 経過時間(秒)
let lastTimestamp = 0;
let nextAutoMoveTime = AUTO_MOVE_INTERVAL;
let manualChoicesLeft = MAX_MANUAL_CHOICES;
let manualMovesUsed = 0;

let baseCenterY = canvas.height / 2; // スタート時の基準高度 (300)
let maxHappinessRecorded = 0;
let minHappinessRecorded = 0;

// 移動エフェクト用
let moveEffects = [];

// 軌跡ログ [{x, y, time}] (キャンバス描画用)
let trajectory = [];

// 幸福度変遷ログ [{ time, score, barIndex, isManual }] (30秒グラフ用)
let happinessLog = [];
// ユーザー手動操作イベントログ [{ time, score, dir }]
let manualEvents = [];

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
  happinessLog = [];
  manualEvents = [];

  initBars();

  player.barIndex = 4; // 真ん中のバー
  player.y = baseCenterY;
  player.displayX = bars[player.barIndex].x;

  // 初期点ログ
  happinessLog.push({
    time: 0,
    score: 0,
    barIndex: 4,
    isManual: false
  });

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

  const currentScore = Math.round((baseCenterY - player.y) * SCORE_SCALE);

  if (isManual) {
    if (manualChoicesLeft <= 0) return;
    manualChoicesLeft--;
    manualMovesUsed++;
    updateChoiceDotsUI();

    // 手動操作イベント記録
    manualEvents.push({
      time: gameTime,
      score: currentScore,
      dir: direction,
      fromIdx: currentIdx,
      toIdx: targetIdx
    });
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

  // 人生の転機検出 & グラフ描画
  const turningPoints = detectTurningPoints();
  renderResultGraph(turningPoints);
  renderTurningPointsList(turningPoints);

  resultOverlay.classList.remove('hidden');
}

// --- ゲーム更新ロジック (Tick) ---
function update(dt) {
  if (gameState !== 'playing') return;

  gameTime += dt;

  // 30秒終了判定
  if (gameTime >= GAME_DURATION) {
    gameTime = GAME_DURATION;
    // 最終点を記録
    const finalHappiness = (baseCenterY - player.y) * SCORE_SCALE;
    happinessLog.push({
      time: GAME_DURATION,
      score: finalHappiness,
      barIndex: player.barIndex
    });
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
    happinessLog.push({
      time: gameTime,
      score: currentHappiness,
      barIndex: player.barIndex
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
if (replayBtnTop) {
  replayBtnTop.addEventListener('click', replayGame);
}

// 初期起動
resetGame();
requestAnimationFrame(gameLoop);

// ==========================================
// 人生の転機（3箇所）検出 & グラフ描画ロジック
// ==========================================

// --- 人生の転機（3箇所）の自動検出 ---
function detectTurningPoints() {
  if (happinessLog.length < 10) return [];

  let candidates = [];

  // 1. 手動操作（ユーザーの決断）の転機候補
  manualEvents.forEach(me => {
    // 操作前後1.2秒でのスコア変化量
    const beforeItem = happinessLog.find(h => h.time >= me.time - 1.2) || happinessLog[0];
    const afterItem = happinessLog.find(h => h.time >= me.time + 1.2) || happinessLog[happinessLog.length - 1];
    const delta = afterItem.score - beforeItem.score;

    candidates.push({
      time: me.time,
      score: me.score,
      importance: 60 + Math.abs(delta) * 1.5,
      isManual: true,
      delta: delta,
      type: 'manual'
    });
  });

  // 2. 変曲点（山・谷、または大きな落差のある波）
  const step = Math.max(1, Math.floor(happinessLog.length / 40));
  for (let i = step * 2; i < happinessLog.length - step * 2; i += step) {
    const cur = happinessLog[i];
    const prev = happinessLog[i - step * 2];
    const next = happinessLog[i + step * 2];
    const deltaPrev = cur.score - prev.score;
    const deltaNext = next.score - cur.score;

    const isPeak = deltaPrev > 8 && deltaNext < -8;
    const isValley = deltaPrev < -8 && deltaNext > 8;
    const totalDelta = next.score - prev.score;

    if (isPeak || isValley || Math.abs(totalDelta) > 20) {
      candidates.push({
        time: cur.time,
        score: cur.score,
        importance: Math.abs(totalDelta) + (isPeak || isValley ? 35 : 0),
        isManual: false,
        delta: totalDelta,
        type: isPeak ? 'peak' : (isValley ? 'valley' : (totalDelta > 0 ? 'rise' : 'fall'))
      });
    }
  }

  // 重要度順にソート
  candidates.sort((a, b) => b.importance - a.importance);

  // 時間間隔が最低4.5秒以上離れるように3点を選出
  let selected = [];
  for (let cand of candidates) {
    const isTooClose = selected.some(s => Math.abs(s.time - cand.time) < 4.5);
    if (!isTooClose) {
      selected.push(cand);
      if (selected.length === 3) break;
    }
  }

  // 3点に満たない場合、3つの時間帯 (2-10s, 10-20s, 20-28s) から補充
  if (selected.length < 3) {
    const zones = [[2, 10], [10, 20], [20, 28]];
    for (let zone of zones) {
      if (selected.length >= 3) break;
      const alreadyHasInZone = selected.some(s => s.time >= zone[0] && s.time <= zone[1]);
      if (!alreadyHasInZone) {
        const zoneItems = happinessLog.filter(h => h.time >= zone[0] && h.time <= zone[1]);
        if (zoneItems.length > 0) {
          const midItem = zoneItems[Math.floor(zoneItems.length / 2)];
          selected.push({
            time: midItem.time,
            score: midItem.score,
            isManual: false,
            delta: 0,
            type: 'wave'
          });
        }
      }
    }
  }

  // 時間順（① ② ③）にソート
  selected.sort((a, b) => a.time - b.time);

  // 各転機に「人生100年」の年齢に応じたリアルなタイトル・説明文を割り当て
  return selected.map((tp, idx) => {
    const age = timeToAge(tp.time);
    let title = '';
    let desc = '';
    let tag = '';
    let tagClass = 'rise';

    if (age < 23) {
      // --- 幼少・青春期 (0〜22歳) ---
      if (tp.isManual) {
        if (tp.delta > 0) {
          title = '進路の自立と大きな飛躍';
          desc = `親や周囲の敷いたレールを脱し、自らの意志で未知の道を選択。この決断が才能を大きく開花させる契機となった。`;
          tag = '自らの決断';
          tagClass = 'decision';
        } else {
          title = '若気の至りと挫折';
          desc = `周囲の反対を押し切って挑んだ背伸びの挑戦。しかし世間の壁は厚く、孤独と苦い挫折を味わうことになった。`;
          tag = '自らの決断';
          tagClass = 'decision';
        }
      } else if (tp.type === 'valley') {
        title = '思春期の葛藤からの脱却';
        desc = `自分らしさに悩み抜いた多感な思春期の暗雲を抜け、生涯の友や恩師との出会いによって光を見出した転機。`;
        tag = '心の成長';
        tagClass = 'rise';
      } else if (tp.type === 'peak' || tp.delta > 10) {
        title = '学生時代の才能開花と栄光';
        desc = `学業や部活動・創作で一気に頭角を現し、自信と熱気に満ち溢れた青春最高の黄金期。`;
        tag = '青春の輝き';
        tagClass = 'rise';
      } else {
        title = '家庭や学校の環境の激変';
        desc = `自力では抗えない環境の変化や人間関係の軋轢。世の中の不条理を初めて痛感した試練の時期。`;
        tag = '多感な試練';
        tagClass = 'fall';
      }
    } else if (age < 36) {
      // --- 青年・社会人初期 (23〜35歳) ---
      if (tp.isManual) {
        if (tp.delta > 0) {
          title = '電撃転職・独立の成功';
          desc = `安定に安住せず、自らの可能性を信じて新天地へダイブ。リスクを背負った決断が大きなキャリアアップを引き寄せた。`;
          tag = '自らの決断';
          tagClass = 'decision';
        } else {
          title = '新境地での予期せぬ蹉跌';
          desc = `現状打破を狙って打って出た大勝負。しかし飛び込んだ世界は想像以上に厳しく、手痛い代償を払うことに。`;
          tag = '自らの決断';
          tagClass = 'decision';
        }
      } else if (tp.type === 'valley') {
        title = 'どん底からの再起と覚醒';
        desc = `仕事の失敗や失恋など深い挫折を経験するも、不屈の反骨心で這い上がり、一回り大きな器を手に入れた復活劇。`;
        tag = '奇跡の再起';
        tagClass = 'rise';
      } else if (tp.type === 'peak' || tp.delta > 10) {
        title = '大抜擢・運命のパートナーとの出会い';
        desc = `仕事で大きな成果を上げ、プライベートでも運命的な出会いに恵まれるなど、人生の階段を一気に駆け上がった瞬間。`;
        tag = '飛躍の季節';
        tagClass = 'rise';
      } else {
        title = '激務と重圧によるスランプ';
        desc = `理想と現実のギャップ、責任の重さに打ちのめされ、心身ともに限界を試された過酷な社会の荒波。`;
        tag = '厳しい試練';
        tagClass = 'fall';
      }
    } else if (age < 56) {
      // --- 壮年・ミドル期 (36〜55歳) ---
      if (tp.isManual) {
        if (tp.delta > 0) {
          title = '後半生を見据えた乾坤一擲の舵切り';
          desc = `これまでの実績に甘んじることなく、真の天職を求めて大勝負に出た英断。人生のステージを一段押し上げた。`;
          tag = '自らの決断';
          tagClass = 'decision';
        } else {
          title = '重責の中での苦渋の選択';
          desc = `組織や家族を守るために下した苦しい決断。背負うものが大きくなったからこその重い代償と葛藤。`;
          tag = '自らの決断';
          tagClass = 'decision';
        }
      } else if (tp.type === 'valley') {
        title = 'ミドルエイジ危機からの起死回生';
        desc = `人生の折り返し地点で訪れた停滞期を、家族や仲間の絆で乗り越え、再び力強く立ち上がった転換点。`;
        tag = '絆による再起';
        tagClass = 'rise';
      } else if (tp.type === 'peak' || tp.delta > 10) {
        title = '社会的成功と家庭の円熟';
        desc = `長年培った経験と人脈が結実し、確固たる地位と人望を獲得。人生最大の充実感と誇りに包まれた絶頂期。`;
        tag = '人生の絶頂';
        tagClass = 'rise';
      } else {
        title = '予期せぬ逆風・健康の不安';
        desc = `体力の過信や環境の急変により、思わぬブレーキがかかる。自分の限界と向き合うことを余儀なくされた時期。`;
        tag = '人生の試練';
        tagClass = 'fall';
      }
    } else if (age < 76) {
      // --- 実年・シニア期 (56〜75歳) ---
      if (tp.isManual) {
        if (tp.delta > 0) {
          title = '第2の人生・悠々自適の挑戦';
          desc = `これまでのしがらみを手放し、長年の夢だった新たなライフワークや地域活動へ。自由と情熱を取り戻した決断。`;
          tag = '自らの決断';
          tagClass = 'decision';
        } else {
          title = '晩節の挑戦と厳しい誤算';
          desc = `退職後の新たな試みに出たものの、時代の急激な変化に直面し、思いがけない苦境に立たされた瞬間。`;
          tag = '自らの決断';
          tagClass = 'decision';
        }
      } else if (tp.type === 'valley') {
        title = '喪失を乗り越えた新たな生きがい';
        desc = `親しい人との別れや役割の喪失による孤独を乗り越え、新しい趣味やコミュニティで人生の豊かさを再発見。`;
        tag = '心の再生';
        tagClass = 'rise';
      } else if (tp.type === 'peak' || tp.delta > 10) {
        title = '知恵と経験がもたらす豊かな実り';
        desc = `人生の重荷から解放され、後進の育成や趣味に没頭。長年の苦労が報われるような、穏やかで輝かしい黄金期。`;
        tag = '円熟の輝き';
        tagClass = 'rise';
      } else {
        title = '体力の衰えと別れの寂寥';
        desc = `身体の変調や時代の移り変わりに寂しさを覚えるなど、人生の秋を迎えたことを静かに実感させられた時期。`;
        tag = '人生の黄昏';
        tagClass = 'fall';
      }
    } else {
      // --- 晩年・百寿期 (76〜100歳) ---
      if (tp.isManual) {
        title = '生きた証の継承と終活の覚悟';
        desc = `自らの歩んできた100年を慈しみ、次の世代へ想いやバトンを託す最後の尊い決断。心に深い安らぎが宿る。`;
        tag = '至高の決断';
        tagClass = 'decision';
      } else if (tp.type === 'valley') {
        title = '病魔を克服した奇跡の生命力';
        desc = `大病や体調の危機を奇跡的に乗り越え、生かされていることへの深い感謝と喜びに目覚めた瞬間。`;
        tag = '生命の奇跡';
        tagClass = 'rise';
      } else if (tp.type === 'peak' || tp.delta > 10) {
        title = '百寿の徳・愛と感謝に包まれた日々';
        desc = `子や孫、周囲の人々の温かい愛に包まれ、波乱万丈だった我が人生のすべてを肯定できた至福の境地。`;
        tag = '百寿の大往生';
        tagClass = 'rise';
      } else {
        title = '静寂と命の灯火を見つめる日々';
        desc = `かつての友が去り、静けさの中でこれまでの旅路を静かに振り返る。命の儚さと美しさを噛みしめる時間。`;
        tag = '静寂の時';
        tagClass = 'fall';
      }
    }

    return {
      index: idx + 1,
      time: tp.time,
      age: age,
      score: tp.score,
      isManual: tp.isManual,
      title: title,
      desc: desc,
      tag: tag,
      tagClass: tagClass
    };
  });
}

// --- 30秒の幸福度変遷グラフの描画 ---
function renderResultGraph(turningPoints) {
  if (!graphCanvas || !graphCtx || happinessLog.length === 0) return;

  const w = graphCanvas.width;
  const h = graphCanvas.height;
  graphCtx.clearRect(0, 0, w, h);

  // マージン設定
  const padL = 48;
  const padR = 24;
  const padT = 20;
  const padB = 26;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // スコアの最小・最大値からY軸レンジを計算
  let minScore = 0;
  let maxScore = 0;
  happinessLog.forEach(item => {
    if (item.score < minScore) minScore = item.score;
    if (item.score > maxScore) maxScore = item.score;
  });

  // 0ptを中心に上下対称または適切なマージンを持たせる
  const maxAbs = Math.max(60, Math.abs(minScore) + 15, Math.abs(maxScore) + 15);
  const yRange = maxAbs * 2;
  const zeroY = padT + plotH / 2;

  // 座標変換ヘルパー
  const getX = (t) => padL + (Math.max(0, Math.min(GAME_DURATION, t)) / GAME_DURATION) * plotW;
  const getY = (s) => zeroY - (s / maxAbs) * (plotH / 2);

  // 1. 背景グリッドと年齢目盛り (人生100年: 6秒 = 20歳刻み)
  graphCtx.save();

  for (let age = 0; age <= 100; age += 20) {
    const sec = (age / 100) * GAME_DURATION; // 0s, 6s, 12s, 18s, 24s, 30s
    const x = getX(sec);
    graphCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    graphCtx.lineWidth = 1;
    graphCtx.setLineDash([3, 3]);
    graphCtx.beginPath();
    graphCtx.moveTo(x, padT);
    graphCtx.lineTo(x, padT + plotH);
    graphCtx.stroke();

    // 年齢ラベル (0歳, 20歳, 40歳, 60歳, 80歳, 100歳)
    graphCtx.fillStyle = 'rgba(148, 163, 184, 0.9)';
    graphCtx.font = 'bold 9px sans-serif';
    graphCtx.textAlign = 'center';
    graphCtx.fillText(`${age}歳`, x, h - 8);
  }

  // 水平ゼロ基準線 (±0 pt)
  graphCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  graphCtx.lineWidth = 1.2;
  graphCtx.setLineDash([5, 5]);
  graphCtx.beginPath();
  graphCtx.moveTo(padL, zeroY);
  graphCtx.lineTo(w - padR, zeroY);
  graphCtx.stroke();

  // Y軸ラベル
  graphCtx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  graphCtx.font = '9px sans-serif';
  graphCtx.textAlign = 'right';
  graphCtx.fillText('±0 pt', padL - 6, zeroY + 3);
  graphCtx.fillText(`+${Math.round(maxAbs)}`, padL - 6, padT + 8);
  graphCtx.fillText(`-${Math.round(maxAbs)}`, padL - 6, padT + plotH);

  graphCtx.restore();

  // 2. エリア塗りつぶし（幸福度プラス＝緑、マイナス＝赤）
  graphCtx.save();
  // プラス域の塗りつぶし
  const gradPlus = graphCtx.createLinearGradient(0, padT, 0, zeroY);
  gradPlus.addColorStop(0, 'rgba(74, 222, 128, 0.28)');
  gradPlus.addColorStop(1, 'rgba(74, 222, 128, 0.02)');

  graphCtx.beginPath();
  graphCtx.moveTo(getX(happinessLog[0].time), zeroY);
  happinessLog.forEach(item => {
    const x = getX(item.time);
    const y = Math.min(zeroY, getY(item.score));
    graphCtx.lineTo(x, y);
  });
  graphCtx.lineTo(getX(happinessLog[happinessLog.length - 1].time), zeroY);
  graphCtx.closePath();
  graphCtx.fillStyle = gradPlus;
  graphCtx.fill();

  // マイナス域の塗りつぶし
  const gradMinus = graphCtx.createLinearGradient(0, zeroY, 0, padT + plotH);
  gradMinus.addColorStop(0, 'rgba(248, 113, 113, 0.02)');
  gradMinus.addColorStop(1, 'rgba(248, 113, 113, 0.28)');

  graphCtx.beginPath();
  graphCtx.moveTo(getX(happinessLog[0].time), zeroY);
  happinessLog.forEach(item => {
    const x = getX(item.time);
    const y = Math.max(zeroY, getY(item.score));
    graphCtx.lineTo(x, y);
  });
  graphCtx.lineTo(getX(happinessLog[happinessLog.length - 1].time), zeroY);
  graphCtx.closePath();
  graphCtx.fillStyle = gradMinus;
  graphCtx.fill();
  graphCtx.restore();

  // 3. 幸福度メイン折れ線ライン
  graphCtx.save();
  graphCtx.beginPath();
  graphCtx.moveTo(getX(happinessLog[0].time), getY(happinessLog[0].score));
  for (let i = 1; i < happinessLog.length; i++) {
    const x = getX(happinessLog[i].time);
    const y = getY(happinessLog[i].score);
    graphCtx.lineTo(x, y);
  }
  graphCtx.strokeStyle = '#38bdf8';
  graphCtx.lineWidth = 2.4;
  graphCtx.lineCap = 'round';
  graphCtx.lineJoin = 'round';
  graphCtx.shadowColor = 'rgba(56, 189, 248, 0.5)';
  graphCtx.shadowBlur = 6;
  graphCtx.stroke();
  graphCtx.restore();

  // 4. ユーザー操作タイミングのマーカー（⚡ 橙色）
  manualEvents.forEach(me => {
    const mx = getX(me.time);
    const my = getY(me.score);
    const age = timeToAge(me.time);

    graphCtx.save();
    // 縦のガイド点線
    graphCtx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
    graphCtx.lineWidth = 1.2;
    graphCtx.setLineDash([3, 3]);
    graphCtx.beginPath();
    graphCtx.moveTo(mx, padT);
    graphCtx.lineTo(mx, padT + plotH);
    graphCtx.stroke();

    // ひし形マーカー
    graphCtx.fillStyle = '#f59e0b';
    graphCtx.shadowColor = 'rgba(245, 158, 11, 0.8)';
    graphCtx.shadowBlur = 8;
    graphCtx.beginPath();
    const size = 5;
    graphCtx.moveTo(mx, my - size);
    graphCtx.lineTo(mx + size, my);
    graphCtx.lineTo(mx, my + size);
    graphCtx.lineTo(mx - size, my);
    graphCtx.closePath();
    graphCtx.fill();

    // 決断ラベル
    graphCtx.fillStyle = '#fbbf24';
    graphCtx.font = 'bold 8.5px sans-serif';
    graphCtx.textAlign = 'center';
    graphCtx.fillText('選択', mx, my - 7);
    graphCtx.restore();
  });

  // 5. 人生の3大転機マーカー（① ② ③ ピンク）
  turningPoints.forEach(tp => {
    const tx = getX(tp.time);
    const ty = getY(tp.score);

    graphCtx.save();
    // 縦ライン
    graphCtx.strokeStyle = 'rgba(236, 72, 153, 0.7)';
    graphCtx.lineWidth = 1.5;
    graphCtx.setLineDash([2, 2]);
    graphCtx.beginPath();
    graphCtx.moveTo(tx, padT + 8);
    graphCtx.lineTo(tx, padT + plotH);
    graphCtx.stroke();

    // バッジ背景
    graphCtx.shadowColor = 'rgba(236, 72, 153, 0.9)';
    graphCtx.shadowBlur = 8;
    graphCtx.fillStyle = '#ec4899';
    graphCtx.beginPath();
    graphCtx.arc(tx, ty, 8, 0, Math.PI * 2);
    graphCtx.fill();

    // バッジ番号テキスト (① ② ③)
    graphCtx.shadowBlur = 0;
    graphCtx.fillStyle = '#ffffff';
    graphCtx.font = 'bold 9.5px sans-serif';
    graphCtx.textAlign = 'center';
    graphCtx.textBaseline = 'middle';
    graphCtx.fillText(tp.index, tx, ty);

    // 年齢ラベル (約○歳)
    graphCtx.font = 'bold 8.5px sans-serif';
    graphCtx.fillStyle = '#f472b6';
    graphCtx.fillText(`${tp.age}歳`, tx, padT + 4);

    graphCtx.restore();
  });
}

// --- 人生の転機リスト（3つのドラマ）のDOM生成 ---
function renderTurningPointsList(turningPoints) {
  if (!turningPointsList) return;
  turningPointsList.innerHTML = '';

  turningPoints.forEach(tp => {
    const card = document.createElement('div');
    card.className = 'tp-card';
    card.innerHTML = `
      <div class="tp-card-header">
        <span class="tp-badge">${tp.index}</span>
        <span class="tp-time">【約${tp.age}歳の転機】</span>
      </div>
      <div class="tp-title">${tp.title}</div>
      <div class="tp-desc">${tp.desc}</div>
      <span class="tp-tag ${tp.tagClass}">${tp.tag}</span>
    `;
    turningPointsList.appendChild(card);
  });
}

