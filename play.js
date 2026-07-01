import { firebaseConfig, GAME_ROOT } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getDatabase, ref, set, update, get, onValue, off, onDisconnect, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const LQ = window.LiveQuiz;
const $ = LQ.$;

let db = null;
let uid = null;
let firebaseReady = false;
let joinedPin = '';
let playerName = '';
let selectedAvatarId = localStorage.getItem('docjtLiveAvatar') || 'patrol_pals';
let liveGame = null;
let unsubscribeGame = null;
let timerId = null;
let lastQuestionKey = '';
let localAnswered = false;
let lastPhase = '';
let lastRevealAudioKey = '';
let lastGainAnimationKey = '';
let lastEndedAudioKey = '';
let localChestQuestionKey = '';
let localChestChoiceIndex = -1;
let goldRushFlowQuestionKey = '';
let goldRushFlowStage = 'question';
let goldRushChosenChestIndex = -1;
let goldRushLastTapAt = 0;
let goldRushLastKnownGold = null;
let goldRushNoticeTimer = null;
let raceFlowQuestionKey = '';
let raceFlowStage = 'question';
let raceChosenRouteIndex = -1;
let raceLastKnownDistance = null;
let raceNoticeTimer = null;
let rewardSubmitInProgress = false;

const RACE_FINISH_DISTANCE = 500;
const BATTLE_START_HEALTH = 5;
const POWER_BATTLE_INTRO_MS = 3000;
const SELF_PACED_MODES = new Set(['coin-rush', 'cadet-race']);
let lastSelfPacedRenderKey = '';
const BATTLE_IMAGES = {
  badge: 'jcso-battle-badge-md.png?v=20260630-cadet-race-qol-v1',
  shield: 'jcso-effect-shield-md.webp?v=20260630-cadet-race-qol-v1',
  attack: 'jcso-effect-attack-md.webp?v=20260630-cadet-race-qol-v1',
  speed: 'jcso-effect-speed-md.webp?v=20260630-cadet-race-qol-v1',
  elimination: 'jcso-effect-elimination-md.webp?v=20260630-cadet-race-qol-v1',
  vs: 'jcso-power-battle-vs-screen-md.webp?v=20260630-cadet-race-qol-v1',
  result: 'jcso-power-battle-result-screen-md.webp?v=20260630-cadet-race-qol-v1',
  waiting: 'jcso-power-battle-waiting-screen-md.webp?v=20260630-cadet-race-qol-v1',
  bye: 'jcso-power-battle-bye-screen-md.webp?v=20260630-cadet-race-qol-v1',
  eliminated: 'jcso-power-battle-eliminated-screen-md.webp?v=20260630-cadet-race-qol-v1',
  champion: 'jcso-power-battle-champion-screen-md.webp?v=20260630-cadet-race-qol-v1',
  hostBoard: 'jcso-power-battle-host-board-md.webp?v=20260630-cadet-race-qol-v1',
  hostResults: 'jcso-power-battle-host-results-md.webp?v=20260630-cadet-race-qol-v1',
  countdown1: 'jcso-countdown-1-md.webp?v=20260630-cadet-race-qol-v1',
  countdown2: 'jcso-countdown-2-md.webp?v=20260630-cadet-race-qol-v1',
  countdown3: 'jcso-countdown-3-md.webp?v=20260630-cadet-race-qol-v1',
  health1: 'jcso-health-1-md.png?v=20260630-cadet-race-qol-v1',
  health2: 'jcso-health-2-md.png?v=20260630-cadet-race-qol-v1',
  health3: 'jcso-health-3-md.png?v=20260630-cadet-race-qol-v1',
  health4: 'jcso-health-4-md.png?v=20260630-cadet-race-qol-v1',
  health5: 'jcso-health-5-md.png?v=20260630-cadet-race-qol-v1',
  badgeWinner: 'jcso-badge-winner-md.png?v=20260630-cadet-race-qol-v1',
  badgeDefeated: 'jcso-badge-defeated-md.png?v=20260630-cadet-race-qol-v1',
  badgeBothWrong: 'jcso-badge-both-wrong-md.png?v=20260630-cadet-race-qol-v1',
  badgeFastest: 'jcso-badge-fastest-md.png?v=20260630-cadet-race-qol-v1',
  badgeLostLife: 'jcso-badge-lost-life-md.png?v=20260630-cadet-race-qol-v1',
  badgeBye: 'jcso-badge-bye-md.png?v=20260630-cadet-race-qol-v1',
  reactionBest: 'jcso-reaction-best-md.png?v=20260630-cadet-race-qol-v1',
  reactionPersonalBest: 'jcso-reaction-personalbest-md.png?v=20260630-cadet-race-qol-v1',
  reactionRoundFast: 'jcso-reaction-roundfast-md.png?v=20260630-cadet-race-qol-v1',
  playerCard: 'jcso-ui-player-card-empty-md.png?v=20260630-cadet-race-qol-v1',
  timerRing: 'jcso-ui-timer-ring-md.png?v=20260630-cadet-race-qol-v1'
};
const GOLD_RUSH_IMAGES = {
  basic: 'gold-rush-chest-basic-md.png?v=20260630-cadet-race-qol-v1',
  rare: 'gold-rush-chest-rare-md.png?v=20260630-cadet-race-qol-v1',
  open: 'gold-rush-chest-open-md.png?v=20260630-cadet-race-qol-v1',
  coins: 'gold-rush-coin-pile-md.png?v=20260630-cadet-race-qol-v1',
  gems: 'gold-rush-gem-pile-md.png?v=20260630-cadet-race-qol-v1',
  vault: 'gold-rush-vault-open-md.png?v=20260630-cadet-race-qol-v1'
};

const RACE_IMAGES = {
  track: 'jcso-race-track-md.png?v=20260630-cadet-race-qol-v1',
  car: 'jcso-race-car-md.png?v=20260630-cadet-race-qol-v1',
  patrol: 'jcso-patrol-unit-md.png?v=20260630-cadet-race-qol-v1'
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  wireEvents();
  const pin = LQ.getParam('pin');
  if (pin) els.pinInput.value = pin.replace(/\D/g, '').slice(0, 6);
  const savedName = localStorage.getItem('docjtLiveName');
  if (savedName) els.nameInput.value = savedName;
  renderAvatarSelector();

  try {
    await initFirebase();
  } catch (err) {
    console.error(err);
    els.firebaseWarning.classList.remove('hidden');
    LQ.setStatus(els.joinStatus, 'The live game connection is not ready yet.', 'error');
  }
}

function cacheElements() {
  [
    'firebase-warning', 'pin-input', 'name-input', 'avatar-select', 'join-game', 'join-status', 'lobby-name',
    'lobby-avatar', 'lobby-mode', 'lobby-pin', 'player-round', 'player-score', 'player-mode', 'player-coins', 'player-timer', 'player-category',
    'player-question', 'player-answers', 'chest-panel', 'next-self-question', 'answer-status', 'answered-score', 'player-result-card',
    'player-result-icon', 'player-result-label', 'player-gain', 'player-correct-answer', 'player-mode-event',
    'player-explanation', 'player-total-score', 'player-rank', 'final-player-title', 'player-final-list'
  ].forEach(id => {
    els[toCamel(id)] = $(id);
  });
}

function wireEvents() {
  els.joinGame.addEventListener('click', joinGame);
  [els.pinInput, els.nameInput].forEach(input => {
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') joinGame();
    });
  });
  els.pinInput.addEventListener('input', () => {
    els.pinInput.value = els.pinInput.value.replace(/\D/g, '').slice(0, 6);
  });
  if (els.nextSelfQuestion) els.nextSelfQuestion.addEventListener('click', nextSelfPacedQuestion);
}

function renderAvatarSelector() {
  if (!els.avatarSelect) return;
  if (!LQ.avatarOptions.some(avatar => avatar.id === selectedAvatarId)) selectedAvatarId = LQ.avatarOptions[0].id;
  els.avatarSelect.innerHTML = LQ.avatarOptions.map(avatar => `
    <button type="button" class="avatar-option ${avatar.id === selectedAvatarId ? 'selected' : ''}" data-avatar-id="${LQ.escapeAttr(avatar.id)}" aria-label="${LQ.escapeAttr(avatar.name)}">
      <span class="avatar-pick-art">${LQ.avatarMarkup(avatar, 'avatar-img')}</span>
      <small>${LQ.escapeHtml(avatar.name)}</small>
      <em>${LQ.escapeHtml(avatar.role || avatar.rarity || 'Character')}</em>
    </button>
  `).join('');
  els.avatarSelect.querySelectorAll('[data-avatar-id]').forEach(button => {
    button.addEventListener('click', () => {
      selectedAvatarId = button.dataset.avatarId;
      localStorage.setItem('docjtLiveAvatar', selectedAvatarId);
      renderAvatarSelector();
    });
  });
}

async function initFirebase() {
  if (!LQ.isFirebaseConfigured(firebaseConfig)) {
    throw new Error('Firebase config has placeholder values.');
  }
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = getDatabase(app);
  const credential = await signInAnonymously(auth);
  uid = credential.user.uid;
  firebaseReady = true;
  LQ.setStatus(els.joinStatus, 'Ready to join.', 'ok');
}

async function joinGame() {
  LQ.Sounds.unlock();
  if (!firebaseReady) return;
  const pin = els.pinInput.value.trim();
  const name = els.nameInput.value.trim().slice(0, 24);
  if (!/^\d{6}$/.test(pin)) {
    LQ.setStatus(els.joinStatus, 'Enter the 6-digit game PIN.', 'error');
    return;
  }
  if (!name) {
    LQ.setStatus(els.joinStatus, 'Enter your name.', 'error');
    return;
  }

  LQ.setStatus(els.joinStatus, 'Joining…');
  const gameSnap = await get(ref(db, `${GAME_ROOT}/${pin}/state`));
  if (!gameSnap.exists()) {
    LQ.setStatus(els.joinStatus, 'No active game found with that PIN.', 'error');
    return;
  }

  joinedPin = pin;
  playerName = name;
  const avatar = LQ.getAvatar(selectedAvatarId);
  localStorage.setItem('docjtLiveName', playerName);
  localStorage.setItem('docjtLiveAvatar', avatar.id);
  const playerRef = ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}`);
  await set(playerRef, {
    name: playerName,
    avatarId: avatar.id,
    avatarIcon: '',
    avatarAsset: avatar.asset || '',
    avatarName: avatar.name,
    avatarRole: avatar.role || '',
    score: 0,
    coins: 0,
    distance: 0,
    power: 0,
    damage: 0,
    shield: 0,
    health: BATTLE_START_HEALTH,
    correct: 0,
    answered: 0,
    played: 0,
    streak: 0,
    lastGain: 0,
    lastCoins: 0,
    lastDistance: 0,
    lastPower: 0,
    lastDamage: 0,
    lastHealthChange: 0,
    lastShield: 0,
    lastReactionMs: 0,
    bestReactionMs: null,
    lastBattleOpponent: '',
    lastBattleResult: '',
    lastModeLabel: '',
    lastCorrect: false,
    lastChoiceIndex: -1,
    lastCorrectAnswer: '',
    lastExplanation: '',
    selfQuestionIndex: 0,
    resultReady: false,
    pendingRewardRequest: null,
    targetPickRequest: null,
    online: true,
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp()
  });
  onDisconnect(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}/online`)).set(false);
  onDisconnect(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}/lastSeen`)).set(serverTimestamp());

  startGameListener();
}

function startGameListener() {
  if (unsubscribeGame) unsubscribeGame();
  const gameRef = ref(db, `${GAME_ROOT}/${joinedPin}`);
  const cb = snapshot => {
    liveGame = snapshot.val();
    if (!liveGame) {
      cleanupTimer();
      LQ.setStatus(els.joinStatus, 'The game was closed.', 'error');
      LQ.showScreen('join');
      return;
    }
    renderFromGame(liveGame);
  };
  onValue(gameRef, cb);
  unsubscribeGame = () => off(gameRef, 'value', cb);
}

function renderFromGame(game) {
  const phase = game.state?.phase || 'lobby';
  if (phase !== lastPhase) {
    lastPhase = phase;
    if (phase === 'lobby') LQ.Sounds.playMusic('lobby');
    if (phase === 'question') {
      LQ.Sounds.resetCountdown();
      LQ.Sounds.playMusic('question');
    }
    if (phase === 'play') LQ.Sounds.playMusic('question');
    if (phase === 'reveal') LQ.Sounds.stopMusic();
    if (phase === 'ended') LQ.Sounds.stopMusic();
  }
  const qKey = game.question?.key || '';
  if (qKey && qKey !== lastQuestionKey) {
    lastQuestionKey = qKey;
    localAnswered = Boolean(getMyAnswer(game));
  }
  if (phase === 'lobby') renderLobby(game);
  if (phase === 'question') renderQuestion(game);
  if (phase === 'play') renderSelfPacedPlay(game);
  if (phase === 'reveal') renderReveal(game);
  if (phase === 'ended') renderEnded(game);
}

function renderLobby(game) {
  document.body.classList.remove('gold-rush-play', 'race-play', 'battle-play');
  cleanupTimer();
  const me = game.players?.[uid] || {};
  const avatar = LQ.getAvatar(me.avatarId || selectedAvatarId);
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  els.lobbyName.textContent = playerName || me.name || 'Player';
  if (els.lobbyAvatar) els.lobbyAvatar.innerHTML = LQ.avatarMarkup(me.avatarId ? me : avatar, 'avatar-img large-avatar-img');
  if (els.lobbyMode) els.lobbyMode.innerHTML = `${LQ.modeLogoMarkup(mode, 'mode-logo-chip mode-logo-inline')} <span>${LQ.escapeHtml(mode.objective)}</span>`;
  els.lobbyPin.textContent = game.state?.pin || joinedPin;
  LQ.showScreen('lobby');
}

function renderQuestion(game) {
  document.body.classList.remove('gold-rush-play', 'race-play', 'battle-play');
  const q = game.question || {};
  const state = game.state || {};
  const me = game.players?.[uid] || {};
  const answer = getMyAnswer(game);
  const answered = localAnswered || Boolean(answer);
  const eligible = isEligibleForCurrentQuestion(game);

  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  els.playerRound.textContent = `Question ${Number(state.questionIndex || 0) + 1} / ${Number(state.questionCount || 0)}`;
  els.playerScore.textContent = formatMainPlayerStat(me, mode.id);
  if (els.playerMode) els.playerMode.innerHTML = LQ.modeLogoMarkup(mode, 'mode-logo-chip player-mode-logo');
  if (els.playerCoins) els.playerCoins.textContent = formatPlayerModeStat(me, mode.id);
  els.playerCategory.textContent = q.category || 'Category';
  els.playerQuestion.textContent = q.text || 'Pick your answer';
  els.answeredScore.textContent = `${formatMainPlayerStat(me, mode.id)} · ${formatPlayerModeStat(me, mode.id)}`;

  if (!eligible) {
    const message = mode.id === 'power-battle'
      ? 'You are out of Power Battle. Watch the leaderboard for the winner.'
      : 'You joined during this question. You will be able to answer the next one.';
    if (mode.id === 'power-battle') {
      renderBattleEliminated(game, me);
      LQ.setStatus(els.answerStatus, message, '');
      LQ.showScreen('question');
    } else {
      LQ.setStatus(els.answerStatus, message, '');
      LQ.showScreen('answered');
    }
    cleanupTimer();
    return;
  }

  if (answered) {
    if (mode.id === 'power-battle') {
      renderBattleMatchupPanel(game, me, true);
      if (els.chestPanel) els.chestPanel.dataset.battlePhase = 'waiting';
      document.body.classList.remove('battle-intro');
      document.body.classList.add('battle-live');
    }
    LQ.showScreen('answered');
    cleanupTimer();
    return;
  }

  els.playerAnswers.innerHTML = (q.choices || []).map((choice, i) => `
    <button type="button" class="answer-btn ${LQ.answerStyles[i % LQ.answerStyles.length]}" data-choice-index="${i}">
      <span class="shape">${LQ.answerShapes[i % LQ.answerShapes.length]}</span>
      <span>${LQ.escapeHtml(choice)}</span>
    </button>
  `).join('');
  document.querySelectorAll('[data-choice-index]').forEach(button => {
    button.addEventListener('click', () => submitAnswer(Number(button.dataset.choiceIndex)));
  });
  if (mode.id === 'power-battle') {
    document.body.classList.add('battle-play');
    const openingCountdownMs = Math.max(0, POWER_BATTLE_INTRO_MS - (Date.now() - Number(game.state?.startedAt || Date.now())));
    renderBattleMatchupPanel(game, me, false);
    if (els.chestPanel) {
      els.chestPanel.dataset.battlePhase = 'intro';
      els.chestPanel.classList.toggle('hidden', openingCountdownMs <= 0);
    }
    document.body.classList.toggle('battle-intro', openingCountdownMs > 0);
    document.body.classList.toggle('battle-live', openingCountdownMs <= 0);
    const opponentUid = q.battlePairs?.[uid] || '';
    const opponent = opponentUid ? game.players?.[opponentUid] : null;
    const opponentName = opponent?.name || 'a bye round';
    LQ.setStatus(els.answerStatus, opponentUid
      ? `Power Battle: matched against ${opponentName}. Fastest correct answer wins; wrong or no answer loses 1 life.`
      : 'Power Battle: bye round. Answer to stay sharp while the others battle.', '');
  } else {
    if (els.chestPanel) els.chestPanel.classList.add('hidden');
    LQ.setStatus(els.answerStatus, 'Choose an answer before time runs out.');
  }
  LQ.showScreen('question');
  startTimer(Number(state.endsAt || Date.now()));
}

function startTimer(endsAt) {
  cleanupTimer();
  const startedAt = Number(liveGame?.state?.startedAt || Date.now());
  const tick = () => {
    const now = Date.now();
    const remainingMs = Math.max(0, endsAt - now);
    const seconds = Math.ceil(remainingMs / 1000);
    const isPowerBattle = document.body.classList.contains('battle-play');
    const openingCountdownMs = isPowerBattle ? Math.max(0, POWER_BATTLE_INTRO_MS - (now - startedAt)) : 0;
    const answerButtons = Array.from(document.querySelectorAll('[data-choice-index]'));
    if (isPowerBattle && openingCountdownMs > 0) {
      const count = Math.max(1, Math.ceil(openingCountdownMs / 1000));
      document.body.classList.add('battle-intro');
      document.body.classList.remove('battle-live');
      if (els.chestPanel) {
        els.chestPanel.classList.remove('hidden');
        els.chestPanel.dataset.battlePhase = 'intro';
      }
      els.playerTimer.innerHTML = `<span class="pb-countdown-number">${count}</span>`;
      answerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('countdown-locked'); });
    } else {
      if (isPowerBattle) {
        document.body.classList.remove('battle-intro');
        document.body.classList.add('battle-live');
        if (els.chestPanel?.dataset?.battlePhase === 'intro' && !localAnswered) {
          els.chestPanel.classList.add('hidden');
        }
      }
      els.playerTimer.textContent = seconds;
      answerButtons.forEach(btn => { if (!localAnswered) btn.disabled = false; btn.classList.remove('countdown-locked'); });
    }
    LQ.Sounds.countdownTick(seconds);
    if (remainingMs <= 0) {
      cleanupTimer();
      localAnswered = true;
      LQ.showScreen('answered');
    }
  };
  tick();
  timerId = setInterval(tick, 200);
}

function cleanupTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

async function submitAnswer(choiceIndex) {
  if (liveGame?.state?.phase === 'play') {
    await submitSelfPacedAnswer(choiceIndex);
    return;
  }
  if (!joinedPin || !liveGame || localAnswered) return;
  const index = Number(liveGame.state?.questionIndex ?? -1);
  if (index < 0 || liveGame.state?.phase !== 'question') return;
  if (!isEligibleForCurrentQuestion(liveGame)) {
    localAnswered = true;
    LQ.showScreen('answered');
    return;
  }

  localAnswered = true;
  LQ.Sounds.answerSent();
  document.querySelectorAll('[data-choice-index]').forEach(btn => btn.disabled = true);
  LQ.setStatus(els.answerStatus, 'Answer sent!', 'ok');
  await set(ref(db, `${GAME_ROOT}/${joinedPin}/answers/${index}/${uid}`), {
    choiceIndex,
    answeredAt: Date.now(),
    questionKey: liveGame.question?.key || ''
  });
  LQ.showScreen('answered');
}

function isEligibleForCurrentQuestion(game) {
  const eligibleMap = game?.question?.eligiblePlayers;
  if (!eligibleMap) return true;
  return Boolean(eligibleMap[uid]);
}

function getMyAnswer(game) {
  const index = Number(game.state?.questionIndex ?? -1);
  if (index < 0) return null;
  return game.answers?.[index]?.[uid] || null;
}


function setGoldRushStage(stage) {
  const valid = stage || 'question';
  document.body.classList.remove('gold-stage-question', 'gold-stage-chest', 'gold-stage-opening', 'gold-stage-result', 'gold-stage-leaderboard', 'gold-stage-target');
  if (document.body.classList.contains('gold-rush-play')) {
    document.body.classList.add(`gold-stage-${valid}`);
  }
}

function resetGoldRushFlow(questionKey) {
  if (goldRushFlowQuestionKey !== questionKey) {
    goldRushFlowQuestionKey = questionKey;
    goldRushFlowStage = 'question';
    goldRushChosenChestIndex = -1;
    goldRushLastTapAt = 0;
  }
}

function wireGoldRushDoubleTap(element, handler) {
  if (!element) return;
  const onTap = event => {
    event.preventDefault();
    goldRushLastTapAt = Date.now();
    handler();
  };
  element.addEventListener('click', onTap);
}


function showGoldRushNotice(message, tone = '') {
  if (!message || !document.body.classList.contains('gold-rush-play')) return;
  let notice = document.getElementById('gold-rush-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'gold-rush-notice';
    notice.className = 'gold-rush-notice';
    document.body.appendChild(notice);
  }
  notice.className = `gold-rush-notice show ${tone || ''}`.trim();
  notice.innerHTML = `<strong>Gold Rush update</strong><span>${LQ.escapeHtml(message)}</span>`;
  if (goldRushNoticeTimer) clearTimeout(goldRushNoticeTimer);
  goldRushNoticeTimer = setTimeout(() => {
    notice.classList.remove('show');
  }, 3600);
}

function watchGoldRushExternalChange(player, mode) {
  if (mode.id !== 'coin-rush') return;
  const currentGold = Number(player.coins || 0);
  if (goldRushLastKnownGold === null) {
    goldRushLastKnownGold = currentGold;
    return;
  }
  const delta = currentGold - goldRushLastKnownGold;
  goldRushLastKnownGold = currentGold;
  if (!delta) return;
  const busyWithOwnReward = Boolean(player.pendingRewardRequest || player.targetPickRequest || player.resultReady || goldRushFlowStage === 'opening' || goldRushFlowStage === 'result');
  if (busyWithOwnReward) return;
  const label = delta > 0
    ? `You gained ${LQ.formatScore(delta)} gold.`
    : `You lost ${LQ.formatScore(Math.abs(delta))} gold.`;
  showGoldRushNotice(player.lastModeLabel || label, delta < 0 ? 'danger' : 'gain');
}

function showGoldRushLeaderboard(game, player) {
  if (!els.chestPanel) return;
  setGoldRushStage('leaderboard');
  els.playerAnswers.innerHTML = '';
  els.chestPanel.classList.remove('hidden');
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.add('hidden');
  const ranked = rankPlayersForMode(game.players || {}, 'coin-rush').slice(0, 8);
  const myRank = ranked.findIndex(p => p.uid === uid) + 1;
  els.playerCategory.textContent = 'Gold Rush Leaderboard';
  els.playerQuestion.textContent = myRank ? `You are #${myRank}` : 'Leaderboard';
  els.chestPanel.innerHTML = `
    <div class="gold-screen-card gold-leaderboard-screen">
      <div class="gold-screen-logo">${LQ.modeLogoMarkup('coin-rush', 'mode-logo-chip chest-mode-logo')}</div>
      <h2>Gold Rush Leaderboard</h2>
      <p class="gold-screen-help">Tap anywhere to continue to the next question.</p>
      <div class="gold-rush-leaderboard-list">
        ${ranked.map((p, i) => `
          <div class="gold-rush-leader-row ${p.uid === uid ? 'mine' : ''}">
            <span class="gold-rank">#${i + 1}</span>
            ${LQ.avatarMarkup(p, 'avatar-img tiny-avatar-img')}
            <strong>${LQ.escapeHtml(p.name || 'Player')}</strong>
            <span>${LQ.formatScore(p.coins || 0)} gold</span>
          </div>
        `).join('') || '<p>No players yet.</p>'}
      </div>
    </div>
  `;
  wireGoldRushDoubleTap(els.chestPanel.querySelector('.gold-leaderboard-screen'), () => nextSelfPacedQuestion());
  LQ.setStatus(els.answerStatus, 'Tap the leaderboard to continue.', '');
}

function renderGoldRushResultScreen(game, player) {
  if (!els.chestPanel) return;
  setGoldRushStage('result');
  els.playerAnswers.innerHTML = '';
  els.chestPanel.classList.remove('hidden');
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.add('hidden');
  const correct = Boolean(player.lastCorrect);
  const gain = formatPlayerGain(player, 'coin-rush');
  const rewardArt = resultArtForMode(correct, 'coin-rush', player);
  els.playerCategory.textContent = correct ? 'Chest opened' : 'No chest earned';
  els.playerQuestion.textContent = correct ? gain.label : 'Incorrect answer';
  els.chestPanel.innerHTML = `
    <div class="gold-screen-card gold-result-screen">
      <div class="gold-screen-logo">${LQ.modeLogoMarkup('coin-rush', 'mode-logo-chip chest-mode-logo')}</div>
      <div class="gold-result-art">${rewardArt}</div>
      <h2>${LQ.escapeHtml(correct ? gain.label : 'No reward this question')}</h2>
      <p class="gold-result-label">${LQ.escapeHtml(formatRevealModeEvent(player, 'coin-rush'))}</p>
      <div class="gold-answer-box">
        <strong>Correct answer:</strong>
        <span>${LQ.escapeHtml(player.lastCorrectAnswer || '')}</span>
      </div>
      ${player.lastExplanation ? `<p class="gold-explanation">${LQ.escapeHtml(player.lastExplanation)}</p>` : ''}
      <p class="gold-screen-help">Tap to show the leaderboard.</p>
    </div>
  `;
  wireGoldRushDoubleTap(els.chestPanel.querySelector('.gold-result-screen'), () => {
    goldRushFlowStage = 'leaderboard';
    showGoldRushLeaderboard(game, player);
  });
  LQ.setStatus(els.answerStatus, 'Tap the result to show the leaderboard.', correct ? 'ok' : '');
}

function renderGoldRushChestOpening(questionIndex, choiceIndex, chestIndex) {
  if (!els.chestPanel) return;
  setGoldRushStage('opening');
  els.playerAnswers.innerHTML = '';
  els.chestPanel.classList.remove('hidden');
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.add('hidden');
  const chosenImage = coinRushChestImage(questionIndex, choiceIndex, chestIndex);
  els.chestPanel.innerHTML = `
    <div class="gold-screen-card gold-opening-screen">
      <div class="gold-screen-logo">${LQ.modeLogoMarkup('coin-rush', 'mode-logo-chip chest-mode-logo')}</div>
      <p class="eyebrow">Chest selected</p>
      <div class="gold-opening-focus">
        ${assetImage(chosenImage, 'Selected Gold Rush chest', 'gold-opening-before')}
        ${assetImage(GOLD_RUSH_IMAGES.open, 'Opened Gold Rush chest', 'gold-opening-after')}
      </div>
      <h2>Opening Chest ${chestIndex + 1}…</h2>
      <p>Revealing your reward.</p>
    </div>
  `;
}


function setRaceStage(stage) {
  const valid = stage || 'question';
  document.body.classList.remove('race-stage-question', 'race-stage-route', 'race-stage-opening', 'race-stage-result', 'race-stage-leaderboard');
  if (document.body.classList.contains('race-play')) {
    document.body.classList.add(`race-stage-${valid}`);
  }
}

function resetRaceFlow(questionKey) {
  if (raceFlowQuestionKey !== questionKey) {
    raceFlowQuestionKey = questionKey;
    raceFlowStage = 'question';
    raceChosenRouteIndex = -1;
  }
}

function showRaceNotice(message, tone = '') {
  if (!message || !document.body.classList.contains('race-play')) return;
  let notice = document.getElementById('cadet-race-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'cadet-race-notice';
    notice.className = 'cadet-race-notice';
    document.body.appendChild(notice);
  }
  notice.className = `cadet-race-notice show ${tone || ''}`.trim();
  notice.innerHTML = `<strong>Cadet Race update</strong><span>${LQ.escapeHtml(message)}</span>`;
  if (raceNoticeTimer) clearTimeout(raceNoticeTimer);
  raceNoticeTimer = setTimeout(() => notice.classList.remove('show'), 3600);
}

function watchRaceExternalChange(player, mode) {
  if (mode.id !== 'cadet-race') return;
  const currentDistance = Number(player.distance || 0);
  if (raceLastKnownDistance === null) {
    raceLastKnownDistance = currentDistance;
    return;
  }
  const delta = currentDistance - raceLastKnownDistance;
  raceLastKnownDistance = currentDistance;
  if (!delta) return;
  const busyWithOwnReward = Boolean(player.pendingRewardRequest || player.resultReady || raceFlowStage === 'opening' || raceFlowStage === 'result');
  if (busyWithOwnReward) return;
  const label = delta > 0
    ? `You moved forward ${LQ.formatScore(delta)} ft.`
    : `You moved back ${LQ.formatScore(Math.abs(delta))} ft.`;
  showRaceNotice(player.lastModeLabel || label, delta < 0 ? 'danger' : 'gain');
}

function showRaceLeaderboard(game, player) {
  if (!els.chestPanel) return;
  setRaceStage('leaderboard');
  els.playerAnswers.innerHTML = '';
  els.chestPanel.classList.remove('hidden');
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.add('hidden');
  const ranked = rankPlayersForMode(game.players || {}, 'cadet-race').slice(0, 8);
  const myRank = ranked.findIndex(p => p.uid === uid) + 1;
  const finish = RACE_FINISH_DISTANCE;
  els.playerCategory.textContent = 'Cadet Race Leaderboard';
  els.playerQuestion.textContent = myRank ? `You are #${myRank}` : 'Leaderboard';
  els.chestPanel.innerHTML = `
    <div class="race-screen-card race-leaderboard-screen">
      <div class="race-screen-logo">${LQ.modeLogoMarkup('cadet-race', 'mode-logo-chip chest-mode-logo')}</div>
      ${assetImage(RACE_IMAGES.track, 'Cadet Race track', 'race-screen-track')}
      <h2>Cadet Race Leaderboard</h2>
      <p class="race-screen-help">Tap anywhere to continue to the next question.</p>
      <div class="race-leaderboard-list">
        ${ranked.map((p, i) => {
          const distance = LQ.clamp(Number(p.distance || 0), 0, finish);
          const percent = Math.round((distance / finish) * 100);
          return `
            <div class="race-leader-row ${p.uid === uid ? 'mine' : ''}">
              <span class="race-rank">#${i + 1}</span>
              ${LQ.avatarMarkup(p, 'avatar-img tiny-avatar-img')}
              <strong>${LQ.escapeHtml(p.name || 'Player')}</strong>
              <span>${LQ.formatScore(distance)} ft</span>
              <div class="race-leader-track"><i style="width:${percent}%"></i><em style="left:${percent}%">🏎️</em></div>
            </div>`;
        }).join('') || '<p>No racers yet.</p>'}
      </div>
    </div>
  `;
  wireGoldRushDoubleTap(els.chestPanel.querySelector('.race-leaderboard-screen'), () => nextSelfPacedQuestion());
  LQ.setStatus(els.answerStatus, 'Tap the leaderboard to continue.', '');
}

function renderRaceResultScreen(game, player) {
  if (!els.chestPanel) return;
  setRaceStage('result');
  els.playerAnswers.innerHTML = '';
  els.chestPanel.classList.remove('hidden');
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.add('hidden');
  const correct = Boolean(player.lastCorrect);
  const gain = formatPlayerGain(player, 'cadet-race');
  const rewardArt = resultArtForMode(correct, 'cadet-race', player);
  els.playerCategory.textContent = correct ? 'Route result' : 'No movement';
  els.playerQuestion.textContent = correct ? gain.label : 'Incorrect answer';
  els.chestPanel.innerHTML = `
    <div class="race-screen-card race-result-screen">
      <div class="race-screen-logo">${LQ.modeLogoMarkup('cadet-race', 'mode-logo-chip chest-mode-logo')}</div>
      <div class="race-result-art">${rewardArt}</div>
      <h2>${LQ.escapeHtml(correct ? gain.label : 'No movement this question')}</h2>
      <p class="race-result-label">${LQ.escapeHtml(formatRevealModeEvent(player, 'cadet-race'))}</p>
      <div class="race-answer-box">
        <strong>Correct answer:</strong>
        <span>${LQ.escapeHtml(player.lastCorrectAnswer || '')}</span>
      </div>
      ${player.lastExplanation ? `<p class="race-explanation">${LQ.escapeHtml(player.lastExplanation)}</p>` : ''}
      <p class="race-screen-help">Tap to show the leaderboard.</p>
    </div>
  `;
  wireGoldRushDoubleTap(els.chestPanel.querySelector('.race-result-screen'), () => {
    raceFlowStage = 'leaderboard';
    showRaceLeaderboard(game, player);
  });
  LQ.setStatus(els.answerStatus, 'Tap the result to show the leaderboard.', correct ? 'ok' : '');
}

function renderRaceRouteOpening(questionIndex, choiceIndex, routeIndex) {
  if (!els.chestPanel) return;
  setRaceStage('opening');
  els.playerAnswers.innerHTML = '';
  els.chestPanel.classList.remove('hidden');
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.add('hidden');
  const routes = [
    { title: 'Patrol Route', img: RACE_IMAGES.track, alt: 'Race track route' },
    { title: 'Siren Sprint', img: RACE_IMAGES.car, alt: 'Race car route' },
    { title: 'Unit Move', img: RACE_IMAGES.patrol, alt: 'Patrol unit route' }
  ];
  const route = routes[routeIndex % routes.length];
  els.chestPanel.innerHTML = `
    <div class="race-screen-card race-opening-screen">
      <div class="race-screen-logo">${LQ.modeLogoMarkup('cadet-race', 'mode-logo-chip chest-mode-logo')}</div>
      <p class="eyebrow">Route selected</p>
      <div class="race-opening-focus">
        ${assetImage(route.img, route.alt, 'race-opening-route')}
        ${assetImage(RACE_IMAGES.car, 'Cadet Race car', 'race-opening-car')}
      </div>
      <h2>${LQ.escapeHtml(route.title)}</h2>
      <p>Checking your route result…</p>
    </div>
  `;
}

function renderSelfPacedPlay(game) {
  cleanupTimer();
  const mode = LQ.getGameMode(game.settings?.gameMode || 'coin-rush');
  document.body.classList.toggle('gold-rush-play', mode.id === 'coin-rush');
  document.body.classList.toggle('race-play', mode.id === 'cadet-race');
  document.body.classList.remove('battle-play');
  const me = game.players?.[uid] || {};
  const questionBank = game.questionBank || [];
  if (!questionBank.length) {
    LQ.setStatus(els.answerStatus, 'The host has not loaded questions for this game.', 'error');
    LQ.showScreen('question');
    return;
  }

  const qIndex = Number(me.selfQuestionIndex || 0) % questionBank.length;
  const q = questionBank[qIndex];
  const questionKey = `${qIndex}_${q.id || q.question}`;
  if (mode.id === 'coin-rush') resetGoldRushFlow(questionKey);
  if (mode.id === 'cadet-race') resetRaceFlow(questionKey);
  const goal = Number(game.state?.goalLimit || game.settings?.goalLimit || (mode.id === 'coin-rush' ? 10000 : 500));
  const renderKey = [
    mode.id,
    game.state?.phase || '',
    qIndex,
    me.pendingRewardRequest?.requestId || '',
    me.targetPickRequest?.requestId || '',
    me.resultReady ? 'result' : 'question',
    mode.id === 'coin-rush' ? 'gold-stable' : mode.id === 'cadet-race' ? 'race-stable' : (me.coins || 0),
    mode.id === 'coin-rush' ? 'gold-stable' : mode.id === 'cadet-race' ? 'race-stable' : (me.distance || 0),
    mode.id === 'coin-rush' ? 'gold-stable' : mode.id === 'cadet-race' ? 'race-stable' : (me.lastModeLabel || ''),
    localChestQuestionKey,
    localChestChoiceIndex,
    mode.id === 'coin-rush' ? goldRushFlowStage : mode.id === 'cadet-race' ? raceFlowStage : '',
    mode.id === 'coin-rush' ? goldRushChosenChestIndex : mode.id === 'cadet-race' ? raceChosenRouteIndex : -1
  ].join('|');
  watchGoldRushExternalChange(me, mode);
  watchRaceExternalChange(me, mode);
  const onlyOtherPlayersChanged = renderKey === lastSelfPacedRenderKey;
  if (onlyOtherPlayersChanged) {
    updateSelfPacedTopbar(me, mode, goal);
    startSelfPacedClock(game);
    return;
  }
  lastSelfPacedRenderKey = renderKey;

  updateSelfPacedTopbar(me, mode, goal);
  startSelfPacedClock(game);
  els.playerCategory.textContent = q.category || 'Category';
  els.playerQuestion.textContent = q.question || 'Pick your answer';
  els.playerAnswers.innerHTML = '';
  els.chestPanel?.classList.add('hidden');
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.add('hidden');
  if (mode.id === 'coin-rush') setGoldRushStage('question');
  if (mode.id === 'cadet-race') setRaceStage('question');

  if (me.pendingRewardRequest) {
    if (mode.id === 'coin-rush') setGoldRushStage('opening');
    if (mode.id === 'cadet-race') setRaceStage('opening');
    renderOpeningReward(mode.id);
    LQ.showScreen('question');
    return;
  }

  if (me.targetPickRequest) {
    if (mode.id === 'coin-rush') setGoldRushStage('chest');
    renderGoldStealTargetPicker(game, me.targetPickRequest);
    LQ.showScreen('question');
    return;
  }

  if (me.resultReady) {
    if (mode.id === 'coin-rush') {
      if (goldRushFlowStage === 'leaderboard') showGoldRushLeaderboard(game, me);
      else {
        goldRushFlowStage = 'result';
        renderGoldRushResultScreen(game, me);
      }
    } else if (mode.id === 'cadet-race') {
      if (raceFlowStage === 'leaderboard') showRaceLeaderboard(game, me);
      else {
        raceFlowStage = 'result';
        renderRaceResultScreen(game, me);
      }
    } else {
      renderSelfPacedResult(me, mode.id);
    }
    LQ.showScreen('question');
    return;
  }

  if (localChestQuestionKey === questionKey && localChestChoiceIndex >= 0) {
    if (mode.id === 'coin-rush') {
      goldRushFlowStage = 'chest';
      setGoldRushStage('chest');
    }
    if (mode.id === 'cadet-race') {
      raceFlowStage = 'route';
      setRaceStage('route');
    }
    renderChestChoices(mode.id, qIndex, localChestChoiceIndex);
    LQ.showScreen('question');
    return;
  }

  els.playerAnswers.innerHTML = (q.choices || []).map((choice, i) => `
    <button type="button" class="answer-btn ${LQ.answerStyles[i % LQ.answerStyles.length]}" data-choice-index="${i}">
      <span class="shape">${LQ.answerShapes[i % LQ.answerShapes.length]}</span>
      <span>${LQ.escapeHtml(choice)}</span>
    </button>
  `).join('');
  document.querySelectorAll('[data-choice-index]').forEach(button => {
    button.addEventListener('click', () => submitSelfPacedAnswer(Number(button.dataset.choiceIndex)));
  });
  LQ.setStatus(els.answerStatus, mode.id === 'coin-rush' ? 'Answer correctly to unlock the chest screen.' : mode.id === 'cadet-race' ? 'Answer correctly to unlock the route screen.' : 'Answer correctly to unlock three mystery rewards. No question timer.', '');
  LQ.showScreen('question');
}

function updateSelfPacedTopbar(player, mode, goal) {
  if (els.playerRound) els.playerRound.innerHTML = `${LQ.modeLogoMarkup(mode, 'mode-logo-chip player-round-logo')} <span>Question ${Number(player.played || 0) + 1}</span>`;
  if (els.playerScore) els.playerScore.textContent = formatMainPlayerStat(player, mode.id);
  if (els.playerMode) els.playerMode.innerHTML = LQ.modeLogoMarkup(mode, 'mode-logo-chip player-mode-logo');
  if (els.playerCoins) {
    els.playerCoins.textContent = mode.id === 'coin-rush'
      ? `Gold Rush • Goal ${LQ.formatScore(goal)}`
      : `${formatPlayerModeStat(player, mode.id)} · Goal ${LQ.formatScore(goal)} ${objectiveUnit(mode.id)}`;
  }
}

function timeLeftLabel(game) {
  const endsAt = Number(game?.state?.endsAt || 0);
  if (!endsAt) return '∞';
  const ms = Math.max(0, endsAt - Date.now());
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function startSelfPacedClock(game) {
  cleanupTimer();
  const tick = () => {
    const current = liveGame || game;
    if (!current || current.state?.phase !== 'play') {
      cleanupTimer();
      return;
    }
    if (els.playerTimer) els.playerTimer.textContent = timeLeftLabel(current);
    const endsAt = Number(current.state?.endsAt || 0);
    if (endsAt && Date.now() >= endsAt) {
      if (els.playerTimer) els.playerTimer.textContent = '0:00';
      LQ.setStatus(els.answerStatus, 'Time is up. Waiting for the final leaderboard…', '');
    }
  };
  tick();
  const endsAt = Number((liveGame || game)?.state?.endsAt || 0);
  if (endsAt) timerId = setInterval(tick, 1000);
}

function objectiveUnit(modeId) {
  if (modeId === 'coin-rush') return 'gold';
  if (modeId === 'cadet-race') return 'ft';
  if (modeId === 'power-battle') return 'lives';
  return 'points';
}

async function submitSelfPacedAnswer(choiceIndex) {
  if (!joinedPin || !liveGame || rewardSubmitInProgress) return;
  const game = liveGame;
  if (game.state?.phase !== 'play') return;
  const me = game.players?.[uid] || {};
  if (me.pendingRewardRequest || me.resultReady) return;
  const questionBank = game.questionBank || [];
  if (!questionBank.length) return;
  const qIndex = Number(me.selfQuestionIndex || 0) % questionBank.length;
  const q = questionBank[qIndex];
  const questionKey = `${qIndex}_${q.id || q.question}`;
  const correct = Number(choiceIndex) === Number(q.answer || 0);
  document.querySelectorAll('[data-choice-index]').forEach(btn => btn.disabled = true);
  LQ.Sounds.answerSent();

  if (correct && SELF_PACED_MODES.has(game.settings?.gameMode || 'coin-rush')) {
    localChestQuestionKey = questionKey;
    localChestChoiceIndex = choiceIndex;
    if ((game.settings?.gameMode || 'coin-rush') === 'coin-rush') {
      goldRushFlowStage = 'chest';
      setGoldRushStage('chest');
    }
    if ((game.settings?.gameMode || 'coin-rush') === 'cadet-race') {
      raceFlowStage = 'route';
      setRaceStage('route');
    }
    renderChestChoices(game.settings?.gameMode || 'coin-rush', qIndex, choiceIndex);
    LQ.setStatus(els.answerStatus, 'Correct — pick one reward chest.', 'ok');
    return;
  }

  await update(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}`), {
    answered: Number(me.answered || 0) + 1,
    played: Number(me.played || 0) + 1,
    streak: 0,
    resultReady: true,
    lastCorrect: false,
    lastChoiceIndex: choiceIndex,
    lastGain: 0,
    lastCoins: 0,
    lastDistance: 0,
    lastPower: 0,
    lastDamage: 0,
    lastHealthChange: 0,
    lastShield: 0,
    lastModeLabel: 'Incorrect — no reward chest this question.',
    lastCorrectAnswer: (q.choices || [])[Number(q.answer || 0)] || '',
    lastExplanation: q.explanation || '',
    lastSeen: serverTimestamp()
  });
}

function renderChestChoices(modeId, questionIndex, choiceIndex) {
  if (!els.chestPanel) return;
  els.playerAnswers.innerHTML = '';
  els.chestPanel.classList.remove('hidden');
  const title = modeId === 'cadet-race' ? 'Choose a route card' : modeId === 'power-battle' ? 'Choose a tactical crate' : 'Choose a Gold Rush chest';
  if (modeId === 'coin-rush') setGoldRushStage('chest');
  if (modeId === 'cadet-race') setRaceStage('route');
  const subtitle = modeId === 'coin-rush'
    ? 'Pick one mystery chest.'
    : modeId === 'cadet-race'
      ? 'Pick one route card.'
      : 'Pick one of the three tactical crates. It can add power, shield you, heal you, steal power, or overload.';
  els.chestPanel.innerHTML = `
    <div class="chest-intro ${modeId === 'coin-rush' ? 'gold-rush-chest-intro' : modeId === 'cadet-race' ? 'race-card-intro' : ''}">
      <p class="eyebrow">Correct answer</p>
      ${modeId === 'coin-rush' ? LQ.modeLogoMarkup('coin-rush', 'mode-logo-chip chest-mode-logo') : modeId === 'cadet-race' ? LQ.modeLogoMarkup('cadet-race', 'mode-logo-chip chest-mode-logo') : ''}
      ${modeId === 'cadet-race' ? assetImage(RACE_IMAGES.track, 'Cadet Race track', 'race-intro-track') : ''}
      <h2>${LQ.escapeHtml(title)}</h2>
      <p>${LQ.escapeHtml(subtitle)}</p>
      ${modeId === 'coin-rush' ? '<p class="gold-screen-help">Tap one chest. The others will disappear.</p>' : ''}
      ${modeId === 'cadet-race' ? '<p class="race-screen-help">Tap one route. The others will disappear.</p>' : ''}
    </div>
    <div class="chest-grid ${modeId === 'coin-rush' ? 'gold-chest-grid' : modeId === 'cadet-race' ? 'race-route-grid' : ''}">
      ${[0, 1, 2].map(i => renderRewardChoiceButton(modeId, questionIndex, choiceIndex, i)).join('')}
    </div>
  `;
  els.chestPanel.querySelectorAll('[data-chest-index]').forEach(button => {
    button.addEventListener('click', () => chooseRewardChest(questionIndex, choiceIndex, Number(button.dataset.chestIndex)));
  });
}

function renderRewardChoiceButton(modeId, questionIndex, choiceIndex, chestIndex) {
  if (modeId === 'coin-rush') {
    const image = coinRushChestImage(questionIndex, choiceIndex, chestIndex);
    return `
      <button type="button" class="chest-choice gold-chest-choice" data-chest-index="${chestIndex}" aria-label="Open mystery chest ${chestIndex + 1}">
        <span class="chest-glow" aria-hidden="true"></span>
        ${assetImage(image, `Mystery chest ${chestIndex + 1}`, 'chest-choice-img')}
        <strong>Chest ${chestIndex + 1}</strong>
        <small>Tap to open</small>
      </button>
    `;
  }
  if (modeId === 'cadet-race') {
    const routes = [
      { title: 'Patrol Route', img: RACE_IMAGES.track, alt: 'Race track route' },
      { title: 'Siren Sprint', img: RACE_IMAGES.car, alt: 'Race car route' },
      { title: 'Unit Move', img: RACE_IMAGES.patrol, alt: 'Patrol unit route' }
    ];
    const route = routes[chestIndex % routes.length];
    return `
      <button type="button" class="chest-choice race-route-choice" data-chest-index="${chestIndex}" aria-label="Choose ${route.title}">
        <span class="race-card-sheen" aria-hidden="true"></span>
        ${assetImage(route.img, route.alt, 'race-route-img')}
        <strong>${route.title}</strong>
        <small>Tap to drive</small>
      </button>
    `;
  }
  const label = 'Crate';
  const icon = '🛡️';
  return `<button type="button" class="chest-choice" data-chest-index="${chestIndex}"><span>${icon}</span><strong>${label} ${chestIndex + 1}</strong><small>Mystery reward</small></button>`;
}

function coinRushChestImage(questionIndex, choiceIndex, chestIndex) {
  const variants = [GOLD_RUSH_IMAGES.basic, GOLD_RUSH_IMAGES.rare, GOLD_RUSH_IMAGES.basic];
  const offset = Math.floor(seededUnit(`${questionIndex}:${choiceIndex}:gold-chests`) * variants.length) % variants.length;
  return variants[(chestIndex + offset) % variants.length];
}


function battleCountdownAsset(seconds) {
  if (Number(seconds) === 1) return BATTLE_IMAGES.countdown1;
  if (Number(seconds) === 2) return BATTLE_IMAGES.countdown2;
  return BATTLE_IMAGES.countdown3;
}

function battleHealthAsset(currentLives) {
  const lives = LQ.clamp(Math.round(Number(currentLives || BATTLE_START_HEALTH)), 1, BATTLE_START_HEALTH);
  if (lives <= 1) return BATTLE_IMAGES.health1;
  if (lives === 2) return BATTLE_IMAGES.health2;
  if (lives === 3) return BATTLE_IMAGES.health3;
  if (lives === 4) return BATTLE_IMAGES.health4;
  return BATTLE_IMAGES.health5;
}

function renderBattleMatchupPanel(game, me, waiting = false) {
  if (!els.chestPanel) return;
  const q = game.question || {};
  const startingLives = Number(game.settings?.goalLimit || BATTLE_START_HEALTH);
  const opponentUid = q.battlePairs?.[uid] || '';
  const opponent = opponentUid ? game.players?.[opponentUid] : null;
  const myLives = LQ.clamp(Number(me.health ?? startingLives), 0, startingLives);
  const opponentLives = opponent ? LQ.clamp(Number(opponent.health ?? startingLives), 0, startingLives) : 0;
  const isBye = !opponent;
  const statusLine = opponent
    ? (waiting ? 'Waiting for your matchup result…' : 'Fastest correct answer wins this matchup.')
    : 'Bye round — no life lost this round.';
  const headline = opponent
    ? `${LQ.escapeHtml(me.name || playerName || 'You')} vs ${LQ.escapeHtml(opponent.name || 'Opponent')}`
    : `${LQ.escapeHtml(me.name || playerName || 'You')} gets a bye`;

  els.chestPanel.classList.remove('hidden');
  els.chestPanel.innerHTML = `
    <div class="pb-native-card ${waiting ? 'is-waiting' : ''} ${isBye ? 'is-bye' : ''}">
      <div class="pb-native-topline">
        ${LQ.modeLogoMarkup('power-battle', 'mode-logo-chip pb-native-logo')}
        <span>${LQ.escapeHtml(headline)}</span>
      </div>
      <div class="pb-duel-grid">
        <div class="pb-fighter pb-blue">
          <div class="pb-fighter-frame">${LQ.avatarMarkup(me, 'avatar-img pb-fighter-avatar')}</div>
          <strong>${LQ.escapeHtml(me.name || playerName || 'You')}</strong>
          <img class="pb-health-img" src="${battleHealthAsset(Math.max(1, myLives || 1))}" alt="${myLives} lives" loading="lazy" decoding="async" />
          <small>${LQ.formatScore(myLives)} lives · best ${formatReactionTime(me.bestReactionMs)}</small>
        </div>
        <div class="pb-vs-core"><span>VS</span></div>
        <div class="pb-fighter pb-gold">
          <div class="pb-fighter-frame">${opponent ? LQ.avatarMarkup(opponent, 'avatar-img pb-fighter-avatar') : '<span class="pb-bye-star">★</span>'}</div>
          <strong>${LQ.escapeHtml(opponent?.name || 'Bye Round')}</strong>
          ${opponent ? `<img class="pb-health-img" src="${battleHealthAsset(Math.max(1, opponentLives || 1))}" alt="${opponentLives} lives" loading="lazy" decoding="async" />` : '<div class="pb-bye-pill">No opponent</div>'}
          <small>${opponent ? `${LQ.formatScore(opponentLives)} lives · best ${formatReactionTime(opponent.bestReactionMs)}` : 'Automatic advance'}</small>
        </div>
      </div>
      <div class="pb-native-status">
        <span>${waiting ? 'Answer locked in' : 'Power Battle'}</span>
        <strong>${LQ.escapeHtml(statusLine)}</strong>
      </div>
    </div>
  `;
}

function renderBattleEliminated(game, me) {
  if (!els.chestPanel) return;
  els.playerAnswers.innerHTML = '';
  els.playerCategory.textContent = 'Power Battle';
  els.playerQuestion.textContent = 'You have been eliminated';
  els.chestPanel.classList.remove('hidden');
  els.chestPanel.innerHTML = `
    <div class="pb-native-card pb-eliminated-panel">
      <div class="pb-native-topline">
        ${LQ.modeLogoMarkup('power-battle', 'mode-logo-chip pb-native-logo')}
        <span>Eliminated</span>
      </div>
      <div class="pb-eliminated-body">
        ${LQ.avatarMarkup(me, 'avatar-img pb-eliminated-avatar')}
        <h2>Out of lives</h2>
        <p>Watch the battle continue.</p>
        <div class="pb-stat-pills">
          <span>Best reaction <b>${formatReactionTime(me.bestReactionMs)}</b></span>
          <span>Wins <b>${LQ.formatScore(me.damage || 0)}</b></span>
        </div>
      </div>
    </div>
  `;
}

function formatReactionTime(ms) {
  const value = Number(ms || 0);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 60000) return `${Math.round(value / 1000)}s`;
  return `${(value / 1000).toFixed(value < 10000 ? 2 : 1)}s`;
}

function reactionSort(a, b) {
  const av = Number(a.bestReactionMs || 0);
  const bv = Number(b.bestReactionMs || 0);
  if (av && bv) return av - bv;
  if (av && !bv) return -1;
  if (!av && bv) return 1;
  return 0;
}

function assetImage(src, alt, className) {
  const versionedSrc = String(src || '').includes('?') ? src : `${src}?v=20260630-cadet-race-qol-v1`;
  return `<img class="${LQ.escapeAttr(className || 'asset-img')}" src="${LQ.escapeAttr(versionedSrc)}" alt="${LQ.escapeAttr(alt || '')}" loading="lazy" decoding="async" />`;
}


function renderPowerBattleRevealArt(game, me) {
  const opponentUid = me.lastBattleOpponentUid || '';
  const opponent = opponentUid ? (game.players || {})[opponentUid] : null;
  const myResult = String(me.lastBattleResult || '');
  const myReaction = Number(me.lastReactionMs || 0);
  const oppReaction = Number(me.lastBattleOpponentReactionMs || 0);
  const myLives = LQ.formatScore(me.health ?? BATTLE_START_HEALTH);
  const oppLives = opponent ? LQ.formatScore(opponent.health ?? BATTLE_START_HEALTH) : '—';
  const headline = myResult === 'bye'
    ? 'Bye round'
    : myResult === 'both-wrong'
      ? 'Both players missed'
      : myResult === 'win'
        ? 'You won the matchup'
        : 'You lost 1 life';
  const resultClass = myResult === 'win' ? 'win' : myResult === 'bye' ? 'bye' : myResult === 'both-wrong' ? 'both-wrong' : 'loss';
  const myBadge = myResult === 'win' ? BATTLE_IMAGES.badgeWinner : myResult === 'bye' ? BATTLE_IMAGES.badgeBye : myResult === 'both-wrong' ? BATTLE_IMAGES.badgeBothWrong : BATTLE_IMAGES.badgeLostLife;
  const oppBadge = myResult === 'win' ? BATTLE_IMAGES.badgeDefeated : myResult === 'bye' ? BATTLE_IMAGES.badgeBye : myResult === 'both-wrong' ? BATTLE_IMAGES.badgeBothWrong : BATTLE_IMAGES.badgeWinner;
  return `
    <div class="pb-result-native ${resultClass}">
      <div class="pb-result-header">
        ${LQ.modeLogoMarkup('power-battle', 'mode-logo-chip pb-native-logo')}
        <h2>${headline}</h2>
      </div>
      <div class="pb-result-duel">
        <div class="pb-result-player mine">
          <div class="pb-fighter-frame">${LQ.avatarMarkup(me, 'avatar-img pb-result-avatar')}</div>
          <strong>${LQ.escapeHtml(me.name || 'You')}</strong>
          <img class="pb-badge-img" src="${myBadge}" alt="" loading="lazy" decoding="async" />
          <span>Reaction <b>${formatReactionTime(myReaction)}</b></span>
          <span>Lives <b>${myLives}</b></span>
        </div>
        <div class="pb-vs-core small"><span>VS</span></div>
        <div class="pb-result-player opponent">
          <div class="pb-fighter-frame">${opponent ? LQ.avatarMarkup(opponent, 'avatar-img pb-result-avatar') : '<span class="pb-bye-star">★</span>'}</div>
          <strong>${LQ.escapeHtml(opponent?.name || 'Bye')}</strong>
          <img class="pb-badge-img" src="${oppBadge}" alt="" loading="lazy" decoding="async" />
          <span>Reaction <b>${formatReactionTime(oppReaction)}</b></span>
          <span>Lives <b>${oppLives}</b></span>
        </div>
      </div>
      <div class="pb-result-note">${myResult === 'both-wrong' ? 'Both players lose 1 life.' : myResult === 'bye' ? 'No life lost this round.' : 'Fastest correct answer wins the matchup.'}</div>
    </div>`;
}

function seededUnit(seed) {
  let hash = 2166136261;
  const text = String(seed || 'seed');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}


function renderGoldStealTargetPicker(game, targetPickRequest) {
  if (!els.chestPanel) return;
  goldRushFlowStage = 'target';
  setGoldRushStage('target');
  els.playerAnswers.innerHTML = '';
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.add('hidden');
  els.chestPanel.classList.remove('hidden');
  els.playerCategory.textContent = 'Steal Chest';
  els.playerQuestion.textContent = 'Choose who to steal from';
  const players = Object.entries(game.players || {})
    .map(([playerUid, player]) => ({ uid: playerUid, ...player }))
    .filter(player => player.uid !== uid && Number(player.coins || 0) > 0)
    .sort((a, b) => (Number(b.coins || 0) - Number(a.coins || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
  const pct = Math.round(Number(targetPickRequest.percent || 0.25) * 100);
  const targetCards = players.map((player, i) => `
    <button type="button" class="steal-target-card ${i === 0 ? 'leader-target' : ''}" data-steal-target="${LQ.escapeAttr(player.uid)}">
      <span class="rank-badge">#${i + 1}</span>
      <span class="target-avatar">${LQ.avatarMarkup(player, 'avatar-img')}</span>
      <strong>${LQ.escapeHtml(player.name || 'Player')}</strong>
      <small>${LQ.formatScore(player.coins || 0)} gold</small>
    </button>
  `).join('');
  els.chestPanel.innerHTML = `
    <div class="gold-screen-card gold-steal-target-screen">
      <div class="gold-screen-logo">${LQ.modeLogoMarkup('coin-rush', 'mode-logo-chip chest-mode-logo')}</div>
      ${assetImage(GOLD_RUSH_IMAGES.vault, 'Gold Rush vault', 'opening-chest-img')}
      <h2>Steal chest unlocked</h2>
      <p>Choose a player. This chest can steal up to ${pct}% of that player’s gold.</p>
      <div class="steal-target-grid">
        ${targetCards || '<p class="muted">No one has gold to steal yet.</p>'}
      </div>
      ${!targetCards ? '<button type="button" class="primary-btn jumbo" data-steal-target="">Take consolation gold</button>' : ''}
    </div>
  `;
  els.chestPanel.querySelectorAll('[data-steal-target]').forEach(button => {
    button.addEventListener('click', () => chooseStealTarget(button.dataset.stealTarget || ''));
  });
  LQ.setStatus(els.answerStatus, 'Choose who to steal from.', 'ok');
}

async function chooseStealTarget(targetUid) {
  if (!joinedPin || !liveGame || rewardSubmitInProgress) return;
  const me = liveGame.players?.[uid] || {};
  const targetPickRequest = me.targetPickRequest;
  if (!targetPickRequest) return;
    rewardSubmitInProgress = true;
  goldRushFlowStage = 'opening';
  setGoldRushStage('opening');
  if (els.chestPanel) {
    els.chestPanel.innerHTML = `<div class="gold-screen-card gold-opening-screen"><div class="gold-screen-logo">${LQ.modeLogoMarkup('coin-rush', 'mode-logo-chip chest-mode-logo')}</div>${assetImage(GOLD_RUSH_IMAGES.open, 'Gold Rush chest', 'gold-opening-after')}<h2>${targetUid ? 'Stealing gold…' : 'Resolving chest…'}</h2><p>Revealing your reward.</p></div>`;
  }
  try {
    await update(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}`), {
      pendingRewardRequest: {
        ...targetPickRequest,
        targetUid: targetUid || '',
        targetSelectedAt: Date.now()
      },
      targetPickRequest: null,
      resultReady: false,
      lastModeLabel: targetUid ? 'Stealing selected gold…' : 'Resolving chest…',
      lastSeen: serverTimestamp()
    });
  } finally {
    rewardSubmitInProgress = false;
  }
}

async function chooseRewardChest(questionIndex, choiceIndex, chestIndex) {
  if (!joinedPin || !liveGame || rewardSubmitInProgress) return;
  rewardSubmitInProgress = true;
  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  localChestQuestionKey = '';
  localChestChoiceIndex = -1;
  goldRushFlowStage = 'question';
  goldRushChosenChestIndex = -1;
  goldRushLastTapAt = 0;
  raceFlowStage = 'question';
  raceChosenRouteIndex = -1;
  const modeId = liveGame.settings?.gameMode || 'coin-rush';
  if (modeId === 'coin-rush') {
    goldRushChosenChestIndex = chestIndex;
    goldRushFlowStage = 'opening';
    renderGoldRushChestOpening(questionIndex, choiceIndex, chestIndex);
  } else if (modeId === 'cadet-race') {
    raceChosenRouteIndex = chestIndex;
    raceFlowStage = 'opening';
    renderRaceRouteOpening(questionIndex, choiceIndex, chestIndex);
  } else if (els.chestPanel) {
    els.chestPanel.innerHTML = '<div class="loader small-loader"></div>';
  }
  try {
    await update(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}`), {
      pendingRewardRequest: {
        requestId,
        modeId: liveGame.settings?.gameMode || 'coin-rush',
        questionIndex,
        choiceIndex,
        chestIndex,
        createdAt: Date.now()
      },
      resultReady: false,
      lastModeLabel: 'Opening chest…',
      lastSeen: serverTimestamp()
    });
  } finally {
    rewardSubmitInProgress = false;
  }
}

function renderOpeningReward(modeId) {
  els.playerAnswers.innerHTML = '';
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.add('hidden');
  if (modeId === 'coin-rush') setGoldRushStage('opening');
  if (els.chestPanel) {
    els.chestPanel.classList.remove('hidden');
    if (modeId === 'coin-rush') {
      const chosen = goldRushChosenChestIndex >= 0 ? goldRushChosenChestIndex : 0;
      renderGoldRushChestOpening(0, 0, chosen);
      LQ.setStatus(els.answerStatus, 'Opening reward…', '');
      return;
    }
    if (modeId === 'cadet-race') {
      const chosen = raceChosenRouteIndex >= 0 ? raceChosenRouteIndex : 0;
      renderRaceRouteOpening(0, 0, chosen);
      LQ.setStatus(els.answerStatus, 'Checking route…', '');
      return;
    }
    const art = '<div class="loader small-loader"></div>';
    els.chestPanel.innerHTML = `<div class="chest-opening chest-opening-art">${art}<h2>Opening reward…</h2><p>Your game reward is being resolved.</p></div>`;
  }
  LQ.setStatus(els.answerStatus, 'Opening reward…', '');
}

function renderSelfPacedResult(player, modeId) {
  if (modeId === 'coin-rush' && liveGame) {
    renderGoldRushResultScreen(liveGame, player);
    return;
  }
  if (modeId === 'cadet-race' && liveGame) {
    renderRaceResultScreen(liveGame, player);
    return;
  }
  els.playerAnswers.innerHTML = '';
  const correct = Boolean(player.lastCorrect);
  const gain = formatPlayerGain(player, modeId);
  const rewardType = String(player.lastRewardType || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const cardClass = `${correct ? 'self-result-card' : 'self-result-card wrong'} ${modeId === 'coin-rush' ? 'gold-rush-result-card' : modeId === 'cadet-race' ? 'race-result-card' : ''} reward-${rewardType || 'none'}`;
  if (els.chestPanel) {
    els.chestPanel.classList.remove('hidden');
    els.chestPanel.innerHTML = `
      <div class="${cardClass}">
        ${modeId === 'coin-rush' ? `<div class="result-mode-brand">${LQ.modeLogoMarkup('coin-rush', 'mode-logo-chip chest-mode-logo')}</div>` : modeId === 'cadet-race' ? `<div class="result-mode-brand">${LQ.modeLogoMarkup('cadet-race', 'mode-logo-chip chest-mode-logo')}</div>` : ''}
        <div class="result-icon mode-result-icon">${resultArtForMode(correct, modeId, player)}</div>
        <p class="eyebrow">${correct ? 'Chest result' : 'No reward'}</p>
        <h2>${LQ.escapeHtml(gain.label || '')}</h2>
        <p class="mode-event-line">${LQ.escapeHtml(formatRevealModeEvent(player, modeId))}</p>
        <p class="result-explanation"><strong>Correct answer:</strong> ${LQ.escapeHtml(player.lastCorrectAnswer || '')}</p>
        ${player.lastExplanation ? `<p class="result-explanation">${LQ.escapeHtml(player.lastExplanation)}</p>` : ''}
      </div>
    `;
  }
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.remove('hidden');
  LQ.setStatus(els.answerStatus, `${formatMainPlayerStat(player, modeId)} · ${formatPlayerModeStat(player, modeId)}`, correct ? 'ok' : '');
}

async function nextSelfPacedQuestion() {
  if (!joinedPin || !liveGame) return;
  const me = liveGame.players?.[uid] || {};
  const nextIndex = Number(me.selfQuestionIndex || 0) + 1;
  localChestQuestionKey = '';
  localChestChoiceIndex = -1;
  goldRushFlowStage = 'question';
  goldRushChosenChestIndex = -1;
  goldRushLastTapAt = 0;
  goldRushLastKnownGold = null;
  raceFlowStage = 'question';
  raceChosenRouteIndex = -1;
  raceLastKnownDistance = null;
  await update(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}`), {
    selfQuestionIndex: nextIndex,
    resultReady: false,
    pendingRewardRequest: null,
    targetPickRequest: null,
    lastModeLabel: '',
    lastSeen: serverTimestamp()
  });
}

function renderReveal(game) {
  document.body.classList.remove('gold-rush-play', 'race-play', 'battle-play');
  cleanupTimer();
  const me = game.players?.[uid] || {};
  const reveal = game.reveal || {};
  const correct = Boolean(me.lastCorrect);
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const ranked = rankPlayersForMode(game.players || {}, mode.id);
  const rank = ranked.findIndex(p => p.uid === uid) + 1;
  const gainInfo = formatPlayerGain(me, mode.id);

  els.playerResultCard.classList.toggle('wrong', !correct && Number(me.lastGain || 0) <= 0);
  if (mode.id === 'power-battle') {
    els.playerResultIcon.innerHTML = renderPowerBattleRevealArt(game, me);
  } else {
    els.playerResultIcon.textContent = resultIconForMode(correct, mode.id, me);
  }
  els.playerResultLabel.textContent = mode.id === 'power-battle' ? 'Power Battle result' : resultLabelForMode(correct, mode.id, me);
  els.playerCorrectAnswer.textContent = `Correct answer: ${reveal.correctAnswer || ''}`;
  if (els.playerModeEvent) els.playerModeEvent.textContent = formatRevealModeEvent(me, mode.id);
  if (els.playerExplanation) els.playerExplanation.textContent = reveal.explanation || '';
  els.playerRank.textContent = rank ? `Rank ${rank}` : 'Rank —';

  const gain = Number(gainInfo.value || 0);
  const revealKey = `${game.question?.key || ''}_${reveal.revealedAt || ''}`;
  const shouldAnimate = revealKey && revealKey !== lastGainAnimationKey;

  if (revealKey && revealKey !== lastRevealAudioKey) {
    lastRevealAudioKey = revealKey;
    LQ.Sounds.reveal(correct);
    LQ.Sounds.countUp();
  }

  if (mode.id === 'power-battle') {
    if (shouldAnimate) lastGainAnimationKey = revealKey;
    els.playerGain.textContent = '';
  } else if (shouldAnimate && gain > 0) {
    lastGainAnimationKey = revealKey;
    LQ.animateNumber(els.playerGain, 0, gain, {
      prefix: '+',
      suffix: gainInfo.suffix,
      duration: 1000,
      onTick: () => LQ.Sounds.pointsTick()
    });
  } else {
    if (shouldAnimate) lastGainAnimationKey = revealKey;
    els.playerGain.textContent = gainInfo.label;
  }
  els.playerTotalScore.textContent = formatMainPlayerStat(me, mode.id);

  LQ.showScreen('reveal');
}


function renderPowerBattleEndHero(game, ranked, me) {
  const winner = ranked[0] || null;
  const isWinner = Boolean(winner && winner.uid === uid);
  const title = isWinner ? 'Power Battle Champion' : 'Power Battle Complete';
  const subtitle = isWinner
    ? `You survived with ${LQ.formatScore(me?.health ?? BATTLE_START_HEALTH)} lives.`
    : `Winner: ${LQ.escapeHtml(winner?.name || 'Player')}`;
  return `
    <div class="pb-final-native ${isWinner ? 'champion' : ''}">
      <div class="pb-final-burst">★</div>
      ${LQ.modeLogoMarkup('power-battle', 'mode-logo-chip pb-native-logo')}
      <h2>${title}</h2>
      <p>${subtitle}</p>
      <div class="pb-final-player">
        ${LQ.avatarMarkup(isWinner ? me : (winner || me), 'avatar-img pb-final-avatar')}
        <strong>${LQ.escapeHtml((isWinner ? me?.name : winner?.name) || 'Player')}</strong>
      </div>
      <div class="pb-stat-pills">
        <span>Best reaction <b>${formatReactionTime(me?.bestReactionMs)}</b></span>
        <span>Wins <b>${LQ.formatScore(me?.damage || 0)}</b></span>
      </div>
    </div>`;
}

function renderEnded(game) {
  document.body.classList.remove('gold-rush-play', 'race-play', 'battle-play');
  cleanupTimer();
  const endedKey = `${game.state?.endedAt || 'ended'}`;
  if (endedKey !== lastEndedAudioKey) {
    lastEndedAudioKey = endedKey;
    LQ.Sounds.victory();
  }
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const ranked = rankPlayersForMode(game.players || {}, mode.id);
  const myRank = ranked.findIndex(p => p.uid === uid) + 1;
  const me = (game.players || {})[uid] || {};
  els.finalPlayerTitle.textContent = myRank ? `You finished #${myRank}` : 'Game ended';
  const hero = mode.id === 'power-battle' ? renderPowerBattleEndHero(game, ranked, me) : '';
  els.playerFinalList.innerHTML = `${hero}<div class="power-battle-final-board">${ranked.slice(0, 10).map((p, i) => `
      <div class="leader-row ${p.uid === uid ? 'mine' : ''}">
        <div class="rank-wrap"><div class="rank">${i + 1}</div><div class="leader-avatar">${LQ.avatarMarkup(p, 'avatar-img')}</div></div>
        <div class="leader-name">
          <strong>${LQ.escapeHtml(p.name || 'Player')}</strong>
          <span>${Number(p.correct || 0)} correct · ${formatPlayerModeStat(p, mode.id)}</span>
        </div>
        <div class="leader-score">${formatMainPlayerStat(p, mode.id)}</div>
      </div>
    `).join('')}</div>`;
  LQ.showScreen('ended');
}

function formatMainPlayerStat(player, modeId) {
  if (modeId === 'coin-rush') return `${LQ.formatScore(player.coins || 0)} gold`;
  if (modeId === 'cadet-race') return `${LQ.formatScore(player.distance || 0)} ft`;
  if (modeId === 'power-battle') return `${LQ.formatScore(player.health ?? BATTLE_START_HEALTH)} lives`;
  return `${LQ.formatScore(player.score || 0)} pts`;
}

function formatPlayerModeStat(player, modeId) {
  if (modeId === 'coin-rush') return `${LQ.formatScore(player.coins || 0)} gold in vault`;
  if (modeId === 'cadet-race') return `${LQ.formatScore(player.distance || 0)} / ${RACE_FINISH_DISTANCE} ft`;
  if (modeId === 'power-battle') return `${LQ.formatScore(player.health ?? BATTLE_START_HEALTH)} lives · ${LQ.formatScore(player.damage || 0)} wins · best ${formatReactionTime(player.bestReactionMs)}`;
  return `${LQ.formatScore(player.score || 0)} pts`;
}

function formatPlayerGain(player, modeId) {
  if (modeId === 'coin-rush') {
    const delta = Number(player.lastCoins || 0);
    return { value: delta, suffix: ' gold', label: `${formatSigned(delta)} gold` };
  }
  if (modeId === 'cadet-race') {
    const delta = Number(player.lastDistance || 0);
    return { value: delta, suffix: ' ft', label: `${formatSigned(delta)} ft` };
  }
  if (modeId === 'power-battle') {
    const hp = Number(player.lastHealthChange || 0);
    const wins = Number(player.lastDamage || 0);
    if (wins > 0) return { value: wins, suffix: ' win', label: `Won matchup` };
    if (hp < 0) return { value: hp, suffix: ' life', label: `${formatSigned(hp)} life` };
    return { value: Number(player.lastGain || 0), suffix: ' lives', label: `${LQ.formatScore(player.health ?? BATTLE_START_HEALTH)} lives` };
  }
  const pts = Number(player.lastGain || 0);
  return { value: pts, suffix: ' pts', label: `${formatSigned(pts)} pts` };
}

function formatRevealModeEvent(player, modeId) {
  if (modeId === 'classic') {
    return player.lastModeLabel || (player.lastCorrect ? 'Speed and streak points added.' : 'No points this round.');
  }
  if (player.lastModeLabel) return player.lastModeLabel;
  if (modeId === 'coin-rush') return player.lastCorrect ? `Chest result: ${formatSigned(player.lastCoins || 0)} gold` : 'No chest — answer correctly to open one.';
  if (modeId === 'cadet-race') return player.lastCorrect ? `Track move: ${formatSigned(player.lastDistance || 0)} ft` : 'No move this round.';
  if (modeId === 'power-battle') return player.lastModeLabel || 'Power Battle round complete.';
  return 'Round complete.';
}

function resultArtForMode(correct, modeId, player) {
  if (modeId === 'coin-rush' && correct) {
    const type = String(player.lastRewardType || '').toLowerCase();
    let image = GOLD_RUSH_IMAGES.coins;
    if (type === 'triple' || type === 'jackpot') image = GOLD_RUSH_IMAGES.gems;
    if (type === 'loss-percent' || type === 'trap') image = GOLD_RUSH_IMAGES.open;
    if (type === 'steal-percent' || type === 'steal-empty' || type === 'steal' || type === 'raid-percent' || type === 'raid') image = GOLD_RUSH_IMAGES.vault;
    return assetImage(image, 'Chest reward', 'result-art-img');
  }
  if (modeId === 'cadet-race' && correct) {
    const type = String(player.lastRewardType || '').toLowerCase();
    let image = RACE_IMAGES.car;
    if (type === 'roll') image = RACE_IMAGES.patrol;
    if (type === 'roadblock') image = RACE_IMAGES.track;
    if (type === 'swap') image = RACE_IMAGES.track;
    if (type === 'sprint' || type === 'boost' || type === 'shortcut') image = RACE_IMAGES.car;
    return assetImage(image, 'Cadet Race result', 'result-art-img race-result-art');
  }
  if (modeId === 'power-battle') {
    let image = BATTLE_IMAGES.badge;
    if (Number(player.health || 0) <= 0) image = BATTLE_IMAGES.eliminated;
    else if (Number(player.lastHealthChange || 0) < 0) image = BATTLE_IMAGES.attack;
    else if (String(player.lastBattleResult || '') === 'win') image = BATTLE_IMAGES.vs;
    return assetImage(image, 'Power Battle result', 'result-art-img battle-result-art');
  }
  return resultIconForMode(correct, modeId, player);
}

function resultIconForMode(correct, modeId, player) {
  if (modeId === 'coin-rush') return correct ? '🪙' : '×';
  if (modeId === 'cadet-race') return correct ? '🏁' : '↺';
  if (modeId === 'power-battle') {
    if (Number(player.lastHealthChange || 0) < 0) return '💥';
    return correct ? '🛡️' : '×';
  }
  return correct ? '✓' : '×';
}

function resultLabelForMode(correct, modeId, player) {
  if (modeId === 'coin-rush') return correct ? 'Gold Rush chest opened!' : 'No chest this round';
  if (modeId === 'cadet-race') return correct ? 'Patrol moved!' : 'Wrong turn';
  if (modeId === 'power-battle') {
    if (Number(player.health || 0) <= 0) return 'Eliminated';
    if (Number(player.lastHealthChange || 0) < 0) return 'Life lost';
    if (Number(player.lastDamage || 0) > 0) return `Matchup won · ${formatReactionTime(player.lastReactionMs)}`;
    return 'Battle round';
  }
  return correct ? 'Correct!' : 'Not this time';
}

function rankPlayersForMode(playersObj, modeId) {
  const players = Object.entries(playersObj || {}).map(([playerUid, player]) => ({ uid: playerUid, ...player }));
  const nameSort = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
  if (modeId === 'coin-rush') {
    return players.sort((a, b) => (Number(b.coins || 0) - Number(a.coins || 0)) || (Number(b.correct || 0) - Number(a.correct || 0)) || nameSort(a, b));
  }
  if (modeId === 'cadet-race') {
    return players.sort((a, b) => (Number(b.distance || 0) - Number(a.distance || 0)) || (Number(b.correct || 0) - Number(a.correct || 0)) || nameSort(a, b));
  }
  if (modeId === 'power-battle') {
    return players.sort((a, b) => (Number(b.health ?? BATTLE_START_HEALTH) - Number(a.health ?? BATTLE_START_HEALTH)) || (Number(b.damage || 0) - Number(a.damage || 0)) || reactionSort(a, b) || (Number(b.correct || 0) - Number(a.correct || 0)) || nameSort(a, b));
  }
  return LQ.rankPlayers(playersObj);
}

function formatSigned(value) {
  const number = Math.round(Number(value || 0));
  return `${number >= 0 ? '+' : '-'}${LQ.formatScore(Math.abs(number))}`;
}

window.addEventListener('beforeunload', () => {
  cleanupTimer();
  LQ.Sounds.stopMusic();
  if (db && joinedPin && uid) {
    update(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}`), {
      online: false,
      lastSeen: serverTimestamp()
    });
  }
});

function toCamel(id) {
  return id.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}
