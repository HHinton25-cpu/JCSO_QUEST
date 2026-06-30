import { firebaseConfig, GAME_ROOT } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getDatabase, ref, set, update, get, onValue, off, remove, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const LQ = window.LiveQuiz;
const $ = LQ.$;

let questionSets = [];
let selectedSet = null;
let bank = [];
let db = null;
let uid = null;
let firebaseReady = false;
let gamePin = '';
let playerUrl = '';
let unsubscribeGame = null;
let liveGame = null;
let selectedQuestions = [];
let activeQuestion = null;
let timerId = null;
let autoRevealTimer = null;
let revealInProgress = false;
let questionStartInProgress = false;
let lastPhase = '';
let lastRevealAudioKey = '';
let lastRevealAnimationKey = '';
let lastEndedAudioKey = '';

const els = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  wireEvents();

  try {
    questionSets = await LQ.loadQuestionSets(els.loadStatus);
    selectedSet = questionSets[0] || null;
    bank = selectedSet?.bank || [];
    renderSetup();
  } catch (err) {
    LQ.setStatus(els.loadStatus, err.message, 'error');
    return;
  }

  try {
    await initFirebase();
  } catch (err) {
    console.error(err);
    els.firebaseWarning.classList.remove('hidden');
    LQ.setStatus(els.setupStatus, 'Firebase is not configured yet. Follow the README setup steps before hosting.', 'error');
  }

  LQ.showScreen('setup');
}

function cacheElements() {
  [
    'load-status', 'bank-pill', 'question-set-select', 'game-mode-select', 'mode-preview', 'category-select', 'category-summary', 'question-count', 'timer-select',
    'shuffle-toggle', 'create-game', 'setup-status', 'firebase-warning', 'pin-display', 'lobby-mode-pill', 'copy-link',
    'join-url', 'join-qr', 'lobby-players', 'player-count-pill', 'start-game', 'round-label',
    'category-label', 'timer-bar', 'timer-text', 'answer-count', 'question-type', 'question-text',
    'mode-status-panel', 'answers-grid', 'reveal-now', 'next-question', 'reveal-title', 'correct-answer-text',
    'explanation-text', 'mode-reveal-banner', 'answer-bars', 'leaderboard-list', 'winner-title', 'final-mode-summary', 'final-leaderboard',
    'new-game', 'end-from-lobby', 'end-from-question'
  ].forEach(id => {
    els[toCamel(id)] = $(id);
  });
}

function wireEvents() {
  els.createGame.addEventListener('click', createGame);
  if (els.questionSetSelect) {
    els.questionSetSelect.addEventListener('change', () => {
      selectedSet = questionSets.find(set => set.id === els.questionSetSelect.value) || questionSets[0] || null;
      bank = selectedSet?.bank || [];
      renderSetup();
    });
  }
  if (els.gameModeSelect) {
    els.gameModeSelect.addEventListener('change', renderModePreview);
  }
  els.copyLink.addEventListener('click', async () => {
    const ok = await LQ.copyText(playerUrl);
    els.copyLink.textContent = ok ? 'Copied!' : 'Copy failed';
    setTimeout(() => { els.copyLink.textContent = 'Copy Join Link'; }, 1500);
  });
  els.startGame.addEventListener('click', startGame);
  els.revealNow.addEventListener('click', () => revealQuestion(true));
  els.nextQuestion.addEventListener('click', nextQuestion);
  els.newGame.addEventListener('click', () => window.location.href = 'host.html');
  els.endFromLobby.addEventListener('click', endGame);
  els.endFromQuestion.addEventListener('click', endGame);
}

function renderSetup() {
  if (!selectedSet && questionSets.length) selectedSet = questionSets[0];
  bank = selectedSet?.bank || [];

  if (els.questionSetSelect) {
    els.questionSetSelect.innerHTML = questionSets.map(set =>
      `<option value="${LQ.escapeAttr(set.id)}">${LQ.escapeHtml(set.label)} (${set.bank.length})</option>`
    ).join('');
    els.questionSetSelect.value = selectedSet?.id || questionSets[0]?.id || '';
  }

  if (els.gameModeSelect && !els.gameModeSelect.options.length) {
    els.gameModeSelect.innerHTML = LQ.gameModes.map(mode =>
      `<option value="${LQ.escapeAttr(mode.id)}">${mode.icon} ${LQ.escapeHtml(mode.name)}</option>`
    ).join('');
  }
  renderModePreview();

  els.bankPill.textContent = selectedSet
    ? `${selectedSet.label}: ${bank.length} questions loaded`
    : `${bank.length} questions loaded`;

  const categories = [...new Set(bank.map(q => q.category))].sort((a, b) => a.localeCompare(b));
  const counts = LQ.countBy(bank, q => q.category);
  els.categorySelect.innerHTML = `<option value="all">All categories (${bank.length})</option>` +
    categories.map(cat => `<option value="${LQ.escapeAttr(cat)}">${LQ.escapeHtml(cat)} (${counts[cat]})</option>`).join('');

  const scenarios = bank.filter(q => /scenario/i.test(q.type)).length;
  const recalls = bank.filter(q => /recall/i.test(q.type)).length;
  els.categorySummary.innerHTML = [
    { value: questionSets.length || 1, label: 'Question Sets' },
    { value: bank.length, label: 'Questions in Set' },
    { value: categories.length, label: 'Categories' },
    { value: LQ.gameModes.length, label: 'Game Modes' },
    { value: `${recalls}/${scenarios}`, label: 'Recall / Scenario' }
  ].map(stat => `<div class="stat-card"><strong>${stat.value}</strong><span>${stat.label}</span></div>`).join('');

  els.createGame.disabled = !firebaseReady || !bank.length;
}

function renderModePreview() {
  if (!els.modePreview) return;
  const mode = LQ.getGameMode(els.gameModeSelect?.value || 'classic');
  els.modePreview.innerHTML = `
    <div class="mode-preview-icon">${mode.icon}</div>
    <div>
      <strong>${LQ.escapeHtml(mode.name)}</strong>
      <p>${LQ.escapeHtml(mode.description)}</p>
      <small>${LQ.escapeHtml(mode.objective)}</small>
    </div>
  `;
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
  els.createGame.disabled = !bank.length;
  LQ.setStatus(els.setupStatus, 'Ready to host.', 'ok');
}

async function createGame() {
  LQ.Sounds.unlock();
  if (!firebaseReady) return;
  const settings = getSettings();
  selectedQuestions = selectQuestions(settings);
  if (!selectedQuestions.length) {
    LQ.setStatus(els.setupStatus, 'No questions available for that setup.', 'error');
    return;
  }

  els.createGame.disabled = true;
  LQ.setStatus(els.setupStatus, 'Creating game PIN…');

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const pin = LQ.makePin();
    const gameRef = ref(db, `${GAME_ROOT}/${pin}`);
    const existing = await get(gameRef);
    if (existing.exists()) continue;

    await set(gameRef, {
      hostUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      settings,
      state: {
        phase: 'lobby',
        pin,
        questionIndex: -1,
        questionCount: selectedQuestions.length,
        startedAt: 0,
        endsAt: 0
      },
      players: {}
    });

    gamePin = pin;
    playerUrl = LQ.buildPlayerUrl(pin);
    startGameListener();
    renderLobbyStatic();
    LQ.showScreen('lobby');
    return;
  }

  els.createGame.disabled = false;
  LQ.setStatus(els.setupStatus, 'Could not create a unique PIN. Try again.', 'error');
}

function getSettings() {
  const questionSetId = els.questionSetSelect?.value || selectedSet?.id || 'docjt';
  const sourceSet = questionSets.find(set => set.id === questionSetId) || selectedSet || questionSets[0] || { id: 'docjt', label: 'DOCJT Questions' };
  const mode = LQ.getGameMode(els.gameModeSelect?.value || 'classic');
  return {
    questionSetId: sourceSet.id,
    questionSetLabel: sourceSet.label,
    gameMode: mode.id,
    gameModeName: mode.name,
    gameModeIcon: mode.icon,
    category: els.categorySelect.value,
    requestedCount: els.questionCount.value,
    timerSeconds: Number(els.timerSelect.value),
    shuffleAnswers: els.shuffleToggle.checked
  };
}

function selectQuestions(settings) {
  selectedSet = questionSets.find(set => set.id === settings.questionSetId) || selectedSet || questionSets[0] || null;
  bank = selectedSet?.bank || [];
  let pool = settings.category === 'all' ? [...bank] : bank.filter(q => q.category === settings.category);
  pool = LQ.shuffle(pool);
  const count = settings.requestedCount === 'all' ? pool.length : Math.min(Number(settings.requestedCount), pool.length);
  return pool.slice(0, count);
}

function renderLobbyStatic() {
  const settings = liveGame?.settings || getSettings();
  const mode = LQ.getGameMode(settings.gameMode || 'classic');
  els.pinDisplay.textContent = gamePin;
  if (els.lobbyModePill) els.lobbyModePill.textContent = `${mode.icon} ${mode.name}`;
  els.joinUrl.textContent = playerUrl;
  els.joinQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(playerUrl)}`;
}

function startGameListener() {
  if (unsubscribeGame) unsubscribeGame();
  const gameRef = ref(db, `${GAME_ROOT}/${gamePin}`);
  const cb = snapshot => {
    liveGame = snapshot.val();
    if (!liveGame) {
      clearAutoReveal();
      cleanupTimer();
      LQ.Sounds.stopMusic();
      LQ.showScreen('setup');
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
    if (phase === 'reveal') LQ.Sounds.stopMusic();
    if (phase === 'ended') LQ.Sounds.stopMusic();
  }
  if (phase === 'lobby') renderLobbyPlayers(game);
  if (phase === 'question') renderQuestionProgress(game);
  if (phase === 'reveal') renderReveal(game);
  if (phase === 'ended') renderEnded(game);
}

function renderLobbyPlayers(game) {
  const players = LQ.rankPlayers(game.players || {});
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  if (els.lobbyModePill) els.lobbyModePill.textContent = `${mode.icon} ${mode.name}`;
  els.playerCountPill.textContent = `${players.length} joined`;
  if (!players.length) {
    els.lobbyPlayers.className = 'player-grid empty';
    els.lobbyPlayers.textContent = 'Waiting for players…';
    return;
  }
  els.lobbyPlayers.className = 'player-grid';
  els.lobbyPlayers.innerHTML = players.map(p => {
    const avatar = LQ.getAvatar(p.avatarId);
    return `
      <div class="player-chip-card ${p.online === false ? 'offline' : ''}">
        <span class="chip-avatar">${LQ.avatarMarkup(p, 'avatar-img')}</span>
        <span>${LQ.escapeHtml(p.name || 'Player')}</span>
        <small>${p.online === false ? 'offline' : 'ready'} · ${LQ.escapeHtml(p.avatarName || avatar.name)}</small>
      </div>
    `;
  }).join('');
}

async function startGame() {
  LQ.Sounds.unlock();
  if (!gamePin || !selectedQuestions.length) return;
  await nextQuestion();
}

async function nextQuestion() {
  LQ.Sounds.unlock();
  clearAutoReveal();
  if (!gamePin || questionStartInProgress) return;
  questionStartInProgress = true;
  revealInProgress = false;
  LQ.Sounds.resetCountdown();

  try {
    // Read a fresh game snapshot before locking the roster for the next question.
    // This prevents early reveal caused by the host using a stale local snapshot that
    // did not yet include every player who had joined the lobby.
    const latestSnap = await get(ref(db, `${GAME_ROOT}/${gamePin}`));
    if (latestSnap.exists()) liveGame = latestSnap.val();

    const currentIndex = Number(liveGame?.state?.questionIndex ?? -1);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= selectedQuestions.length) {
      questionStartInProgress = false;
      await endGame();
      return;
    }

    const q = selectedQuestions[nextIndex];
    let choices = q.choices.map((choice, originalIndex) => ({ choice, originalIndex }));
    if (liveGame?.settings?.shuffleAnswers ?? true) choices = LQ.shuffle(choices);
    const correctIndex = choices.findIndex(item => item.originalIndex === q.answer);
    const now = Date.now();
    const timerSeconds = Number(liveGame?.settings?.timerSeconds || 30);
    const playersAtStart = liveGame?.players || {};
    const eligiblePlayerUids = Object.keys(playersAtStart).filter(playerUid => playersAtStart[playerUid] && playersAtStart[playerUid].name);
    const eligiblePlayers = Object.fromEntries(eligiblePlayerUids.map(playerUid => [playerUid, true]));
    const eligiblePlayerNames = Object.fromEntries(eligiblePlayerUids.map(playerUid => [playerUid, String(playersAtStart[playerUid]?.name || 'Player')]));
    activeQuestion = {
      localIndex: nextIndex,
      question: q,
      choices,
      correctIndex,
      startedAt: now,
      endsAt: now + timerSeconds * 1000
    };

    await update(ref(db, `${GAME_ROOT}/${gamePin}`), {
    updatedAt: serverTimestamp(),
    [`answers/${nextIndex}`]: null,
    reveal: null,
    question: {
      key: `${nextIndex}_${q.id}_${now}`,
      category: q.category,
      type: q.type,
      text: q.question,
      choices: choices.map(item => item.choice),
      eligiblePlayers,
      eligiblePlayerNames,
      eligibleCount: eligiblePlayerUids.length
    },
    state: {
      phase: 'question',
      pin: gamePin,
      questionIndex: nextIndex,
      questionCount: selectedQuestions.length,
      startedAt: now,
      endsAt: now + timerSeconds * 1000
    }
  });

    LQ.Sounds.playMusic('question');
    LQ.showScreen('question');
    startTimer(activeQuestion.endsAt, () => revealQuestion(false));
  } finally {
    questionStartInProgress = false;
  }
}

function renderQuestionProgress(game) {
  const q = game.question || {};
  const state = game.state || {};
  const index = Number(state.questionIndex || 0);
  const total = Number(state.questionCount || selectedQuestions.length || 0);
  const answersForQuestion = game.answers?.[index] || {};
  const eligibleMap = q.eligiblePlayers || null;
  const eligibleUids = eligibleMap ? Object.keys(eligibleMap) : [];
  const questionKey = q.key || '';
  let playerCount = Number(q.eligibleCount || eligibleUids.length || 0);
  let answeredEligibleUids = eligibleUids.length
    ? eligibleUids.filter(playerUid => hasValidAnswer(answersForQuestion[playerUid], questionKey))
    : Object.keys(answersForQuestion).filter(playerUid => hasValidAnswer(answersForQuestion[playerUid], questionKey));
  let answerCount = answeredEligibleUids.length;

  if (!playerCount && !eligibleUids.length) {
    playerCount = Object.keys(game.players || {}).filter(playerUid => game.players[playerUid]?.name).length;
  }

  els.roundLabel.textContent = `Question ${index + 1} / ${total}`;
  els.categoryLabel.textContent = `${game.settings?.questionSetLabel || ''}${game.settings?.questionSetLabel ? ' · ' : ''}${q.category || 'Category'}`;
  els.questionType.textContent = q.type || 'Question';
  els.questionText.textContent = q.text || '';
  els.answerCount.textContent = `${answerCount} / ${playerCount} answered`;
  els.answersGrid.innerHTML = (q.choices || []).map((choice, i) => `
    <div class="answer-btn ${LQ.answerStyles[i % LQ.answerStyles.length]}">
      <span class="shape">${LQ.answerShapes[i % LQ.answerShapes.length]}</span>
      <span>${LQ.escapeHtml(choice)}</span>
    </div>
  `).join('');

  renderModeStatus(game);
  LQ.showScreen('question');
  startTimer(Number(state.endsAt || Date.now()), () => revealQuestion(false));

  // Only auto-reveal when the exact players locked in at question start have all answered
  // this exact question. We do not shrink the roster when phones briefly disconnect, and we
  // read a fresh Firebase snapshot before starting each question so newly joined lobby players
  // are included before the lock is created.
  const allLockedPlayersAnswered = playerCount > 0 && eligibleUids.length > 0 && eligibleUids.every(playerUid => hasValidAnswer(answersForQuestion[playerUid], questionKey));
  const questionHasDisplayedBriefly = Date.now() - Number(state.startedAt || Date.now()) >= 1200;
  if (allLockedPlayersAnswered && questionHasDisplayedBriefly && !revealInProgress && !autoRevealTimer) {
    cleanupTimer();
    autoRevealTimer = setTimeout(() => {
      autoRevealTimer = null;
      revealQuestion(false);
    }, 900);
  }
}

function hasValidAnswer(answer, questionKey) {
  if (!answer || typeof answer !== 'object') return false;
  if (questionKey && answer.questionKey && answer.questionKey !== questionKey) return false;
  return Number.isInteger(Number(answer.choiceIndex));
}


function startTimer(endsAt, onDone) {
  cleanupTimer();
  const totalMs = Math.max(1000, Number(liveGame?.settings?.timerSeconds || 30) * 1000);
  const tick = () => {
    const remainingMs = Math.max(0, endsAt - Date.now());
    const seconds = Math.ceil(remainingMs / 1000);
    els.timerText.textContent = seconds;
    els.timerBar.style.width = `${LQ.clamp((remainingMs / totalMs) * 100, 0, 100)}%`;
    LQ.Sounds.countdownTick(seconds);
    if (remainingMs <= 0) {
      cleanupTimer();
      onDone();
    }
  };
  tick();
  timerId = setInterval(tick, 200);
}

function cleanupTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function clearAutoReveal() {
  if (autoRevealTimer) clearTimeout(autoRevealTimer);
  autoRevealTimer = null;
}

async function revealQuestion(manual) {
  clearAutoReveal();
  if (!gamePin || revealInProgress) return;
  const game = liveGame;
  const index = Number(game?.state?.questionIndex ?? -1);
  if (!game || game.state?.phase !== 'question' || index < 0) return;
  revealInProgress = true;
  cleanupTimer();
  LQ.Sounds.stopMusic();

  const local = activeQuestion?.localIndex === index ? activeQuestion : rebuildActiveQuestion(index, game);
  if (!local) {
    revealInProgress = false;
    return;
  }

  const answers = game.answers?.[index] || {};
  const players = game.players || {};
  const choices = game.question?.choices || local.choices.map(c => c.choice);
  const counts = choices.map((_, i) => Object.values(answers).filter(a => Number(a.choiceIndex) === i).length);
  const totalMs = Math.max(1000, Number(game.settings?.timerSeconds || 30) * 1000);
  const updates = {
    updatedAt: serverTimestamp(),
    'state/phase': 'reveal',
    reveal: {
      correctIndex: local.correctIndex,
      correctAnswer: choices[local.correctIndex] || '',
      explanation: local.question.explanation,
      counts,
      manual: Boolean(manual),
      revealedAt: Date.now()
    }
  };

  const eligibleMap = game.question?.eligiblePlayers || null;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const modeEvents = [];

  Object.entries(players).forEach(([playerUid, player]) => {
    if (eligibleMap && !eligibleMap[playerUid]) return;
    const answer = answers[playerUid];
    const answered = Boolean(answer);
    const correct = answered && Number(answer.choiceIndex) === local.correctIndex;
    const elapsed = answered ? Math.max(0, Number(answer.answeredAt || Date.now()) - Number(game.state?.startedAt || Date.now())) : totalMs;
    const speedRatio = correct ? 1 - LQ.clamp(elapsed / totalMs, 0, 1) : 0;
    const speedBase = correct ? Math.round(500 + 500 * speedRatio) : 0;
    const nextStreak = correct ? Number(player.streak || 0) + 1 : 0;
    const streakBonus = correct ? Math.min(nextStreak * 100, 500) : 0;
    const reward = calculateModeReward(mode.id, { correct, speedBase, streakBonus, nextStreak, speedRatio, player, playerUid, questionIndex: index });
    const gain = reward.points;

    updates[`players/${playerUid}/score`] = Number(player.score || 0) + gain;
    updates[`players/${playerUid}/correct`] = Number(player.correct || 0) + (correct ? 1 : 0);
    updates[`players/${playerUid}/played`] = Number(player.played || 0) + 1;
    updates[`players/${playerUid}/answered`] = Number(player.answered || 0) + (answered ? 1 : 0);
    updates[`players/${playerUid}/streak`] = nextStreak;
    updates[`players/${playerUid}/lastGain`] = gain;
    updates[`players/${playerUid}/lastCorrect`] = correct;
    updates[`players/${playerUid}/lastChoiceIndex`] = answered ? Number(answer.choiceIndex) : -1;
    updates[`players/${playerUid}/coins`] = Number(player.coins || 0) + reward.coins;
    updates[`players/${playerUid}/distance`] = Number(player.distance || 0) + reward.distance;
    updates[`players/${playerUid}/power`] = Number(player.power || 0) + reward.power;
    updates[`players/${playerUid}/lastCoins`] = reward.coins;
    updates[`players/${playerUid}/lastDistance`] = reward.distance;
    updates[`players/${playerUid}/lastPower`] = reward.power;
    updates[`players/${playerUid}/lastModeLabel`] = reward.label;

    if (reward.label) {
      modeEvents.push({
        uid: playerUid,
        name: player.name || 'Player',
        avatarId: player.avatarId || LQ.avatarOptions[0].id,
        avatarIcon: player.avatarIcon || '',
        label: reward.label,
        value: reward.value
      });
    }
  });

  updates.reveal.mode = { id: mode.id, name: mode.name, icon: mode.icon, events: modeEvents.slice(0, 8) };

  await update(ref(db, `${GAME_ROOT}/${gamePin}`), updates);
  LQ.showScreen('reveal');
}

function rebuildActiveQuestion(index, game) {
  const q = selectedQuestions[index];
  if (!q || !game.question?.choices) return null;
  const correctAnswerText = q.choices[q.answer];
  const correctIndex = game.question.choices.findIndex(choice => choice === correctAnswerText);
  return {
    localIndex: index,
    question: q,
    choices: game.question.choices.map((choice, i) => ({ choice, originalIndex: i })),
    correctIndex: correctIndex >= 0 ? correctIndex : 0
  };
}

function renderReveal(game) {
  const reveal = game.reveal || {};
  const q = game.question || {};
  els.revealTitle.textContent = `Question ${Number(game.state?.questionIndex || 0) + 1} Answer`;
  els.correctAnswerText.textContent = reveal.correctAnswer || 'Correct answer';
  els.explanationText.textContent = reveal.explanation || '';
  renderModeRevealBanner(game);
  els.answerBars.innerHTML = (q.choices || []).map((choice, i) => {
    const count = Number(reveal.counts?.[i] || 0);
    const max = Math.max(1, ...(reveal.counts || [0]));
    return `
      <div class="answer-bar-row ${i === Number(reveal.correctIndex) ? 'correct' : ''}">
        <span class="mini-shape ${LQ.answerStyles[i % LQ.answerStyles.length]}">${LQ.answerShapes[i % LQ.answerShapes.length]}</span>
        <span class="bar-label">${LQ.escapeHtml(choice)}</span>
        <span class="bar-track"><span style="width:${(count / max) * 100}%"></span></span>
        <strong>${count}</strong>
      </div>
    `;
  }).join('');
  const revealAudioKey = `${game.question?.key || ''}_${game.reveal?.revealedAt || ''}`;
  const animateReveal = revealAudioKey && revealAudioKey !== lastRevealAnimationKey;
  if (revealAudioKey && revealAudioKey !== lastRevealAudioKey) {
    lastRevealAudioKey = revealAudioKey;
    LQ.Sounds.reveal(true);
    LQ.Sounds.countUp();
  }
  renderLeaderboard(els.leaderboardList, game.players || {}, { animate: animateReveal });
  if (animateReveal) lastRevealAnimationKey = revealAudioKey;
  const currentIndex = Number(game.state?.questionIndex || 0);
  els.nextQuestion.textContent = currentIndex + 1 >= Number(game.state?.questionCount || selectedQuestions.length) ? 'Finish Game' : 'Next Question';
  LQ.showScreen('reveal');
}

function renderLeaderboard(container, playersObj, options = {}) {
  const players = LQ.rankPlayers(playersObj);
  if (!players.length) {
    container.innerHTML = '<p class="muted">No players joined.</p>';
    return;
  }
  const animate = Boolean(options.animate);
  const modeId = liveGame?.settings?.gameMode || 'classic';
  container.innerHTML = players.map((p, i) => {
    const targetScore = Number(p.score || 0);
    const startScore = animate ? Math.max(0, targetScore - Number(p.lastGain || 0)) : targetScore;
    const avatar = LQ.getAvatar(p.avatarId);
    return `
      <div class="leader-row ${i === 0 ? 'first' : ''}">
        <div class="rank-wrap"><div class="rank">${i + 1}</div><div class="leader-avatar">${LQ.avatarMarkup(p, 'avatar-img')}</div></div>
        <div class="leader-name">
          <strong>${LQ.escapeHtml(p.name || 'Player')}</strong>
          <span>${formatLeaderboardDetail(p, modeId)}</span>
        </div>
        <div class="leader-score" data-from-score="${startScore}" data-to-score="${targetScore}">${LQ.formatScore(startScore)} pts</div>
      </div>
    `;
  }).join('');

  if (animate) {
    container.querySelectorAll('[data-to-score]').forEach(el => {
      LQ.animateNumber(el, Number(el.dataset.fromScore || 0), Number(el.dataset.toScore || 0), {
        suffix: ' pts',
        duration: 1000,
        onTick: () => LQ.Sounds.pointsTick()
      });
    });
  }
}

function formatLeaderboardDetail(p, modeId) {
  const base = `${Number(p.correct || 0)} correct · streak ${Number(p.streak || 0)}`;
  if (modeId === 'coin-rush') {
    return `${base} · ${LQ.formatScore(p.coins || 0)} coins${Number(p.lastCoins || 0) ? ` · +${LQ.formatScore(p.lastCoins)} coins` : ''}`;
  }
  if (modeId === 'cadet-race') {
    return `${base} · ${LQ.formatScore(p.distance || 0)} ft${Number(p.lastDistance || 0) ? ` · +${LQ.formatScore(p.lastDistance)} ft` : ''}`;
  }
  if (modeId === 'power-battle') {
    return `${base} · ${LQ.formatScore(p.power || 0)} power${Number(p.lastPower || 0) ? ` · +${LQ.formatScore(p.lastPower)} power` : ''}`;
  }
  return `${base}${Number(p.lastGain || 0) ? ` · +${LQ.formatScore(p.lastGain)} pts` : ''}`;
}

function renderModeStatus(game) {
  if (!els.modeStatusPanel) return;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const top = LQ.rankPlayers(game.players || {}).slice(0, 4);
  const cards = top.map((p, i) => {
    const avatar = LQ.getAvatar(p.avatarId);
    return `<div class="mode-mini-card">
      <span class="mode-mini-avatar">${LQ.avatarMarkup(p, 'avatar-img')}</span>
      <strong>${LQ.escapeHtml(p.name || 'Player')}</strong>
      <small>#${i + 1} · ${formatModeStat(p, mode.id)}</small>
    </div>`;
  }).join('');
  els.modeStatusPanel.innerHTML = `
    <div class="mode-objective"><strong>${mode.icon} ${LQ.escapeHtml(mode.shortName || mode.name)}</strong><span>${LQ.escapeHtml(mode.objective)}</span></div>
    <div class="mode-mini-grid">${cards || '<span class="muted">No players yet.</span>'}</div>
  `;
}

function formatModeStat(player, modeId) {
  if (modeId === 'coin-rush') return `${LQ.formatScore(player.coins || 0)} coins`;
  if (modeId === 'cadet-race') return `${LQ.formatScore(player.distance || 0)} ft`;
  if (modeId === 'power-battle') return `${LQ.formatScore(player.power || 0)} power`;
  return `${LQ.formatScore(player.score || 0)} pts`;
}

function renderModeRevealBanner(game) {
  if (!els.modeRevealBanner) return;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const events = game.reveal?.mode?.events || [];
  if (!events.length || mode.id === 'classic') {
    els.modeRevealBanner.innerHTML = `<strong>${mode.icon} ${LQ.escapeHtml(mode.name)}</strong><span>${LQ.escapeHtml(mode.scoring)}</span>`;
    return;
  }
  els.modeRevealBanner.innerHTML = `
    <strong>${mode.icon} ${LQ.escapeHtml(mode.name)} rewards</strong>
    <div class="mode-event-list">
      ${events.map(event => `<span class="mode-event-chip">${LQ.avatarMarkup(event, 'avatar-img tiny-avatar-img')} <b>${LQ.escapeHtml(event.name)}</b>: ${LQ.escapeHtml(event.label)}</span>`).join('')}
    </div>
  `;
}

function renderFinalModeSummary(game) {
  if (!els.finalModeSummary) return;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const ranked = LQ.rankPlayers(game.players || {});
  const top = ranked[0];
  if (!top) {
    els.finalModeSummary.innerHTML = `<strong>${mode.icon} ${LQ.escapeHtml(mode.name)}</strong><span>No player results.</span>`;
    return;
  }
  els.finalModeSummary.innerHTML = `<strong>${mode.icon} ${LQ.escapeHtml(mode.name)}</strong><span>Top result: ${LQ.escapeHtml(top.name || 'Player')} with ${formatModeStat(top, mode.id)} and ${LQ.formatScore(top.score || 0)} points.</span>`;
}

function calculateModeReward(modeId, ctx) {
  const basePoints = ctx.correct ? ctx.speedBase + ctx.streakBonus : 0;
  if (!ctx.correct) {
    return { points: 0, coins: 0, distance: 0, power: 0, value: 0, label: '' };
  }

  if (modeId === 'coin-rush') {
    const lucky = seededChance(`${ctx.playerUid}-${ctx.questionIndex}-${ctx.nextStreak}`, 0.18);
    const rawCoins = Math.round(25 + ctx.speedRatio * 35 + Math.min(ctx.nextStreak * 6, 36));
    const coins = lucky ? rawCoins * 2 : rawCoins;
    return {
      points: basePoints + coins * 12,
      coins,
      distance: 0,
      power: 0,
      value: coins,
      label: lucky ? `Lucky chest doubled to +${coins} coins` : `+${coins} coins`
    };
  }

  if (modeId === 'cadet-race') {
    const distance = Math.round(10 + ctx.speedRatio * 18 + Math.min(ctx.nextStreak * 2, 12));
    return {
      points: basePoints + distance * 30,
      coins: 0,
      distance,
      power: 0,
      value: distance,
      label: `Moved +${distance} ft`
    };
  }

  if (modeId === 'power-battle') {
    const power = Math.round(12 + ctx.speedRatio * 18 + Math.min(ctx.nextStreak * 3, 18));
    return {
      points: basePoints + power * 25,
      coins: 0,
      distance: 0,
      power,
      value: power,
      label: `Charged +${power} power`
    };
  }

  return {
    points: basePoints,
    coins: 0,
    distance: 0,
    power: 0,
    value: basePoints,
    label: `+${LQ.formatScore(basePoints)} points`
  };
}

function seededChance(seed, probability) {
  let hash = 0;
  for (let i = 0; i < String(seed).length; i += 1) {
    hash = ((hash << 5) - hash + String(seed).charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 1000) / 1000 < probability;
}

async function endGame() {
  if (!gamePin) return;
  clearAutoReveal();
  cleanupTimer();
  LQ.Sounds.stopMusic();
  await update(ref(db, `${GAME_ROOT}/${gamePin}`), {
    updatedAt: serverTimestamp(),
    'state/phase': 'ended',
    'state/endedAt': Date.now()
  });
  LQ.showScreen('ended');
}

function renderEnded(game) {
  const endedKey = `${game.state?.endedAt || 'ended'}`;
  if (endedKey !== lastEndedAudioKey) {
    lastEndedAudioKey = endedKey;
    LQ.Sounds.victory();
  }
  const ranked = LQ.rankPlayers(game.players || {});
  els.winnerTitle.textContent = ranked[0] ? `${ranked[0].name || 'Winner'} wins!` : 'Game ended';
  renderFinalModeSummary(game);
  renderLeaderboard(els.finalLeaderboard, game.players || {});
  LQ.showScreen('ended');
}

window.addEventListener('beforeunload', () => {
  clearAutoReveal();
  cleanupTimer();
  LQ.Sounds.stopMusic();
});

function toCamel(id) {
  return id.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}
