/** Ludo Classic — online multiplayer (no IP / no WiFi needed) */
let socket = null;
let myId = null;
let roomId = null;
let isHost = false;
let gameState = null;
let voice = null;
let pendingAction = null;

const $ = (id) => document.getElementById(id);
const screens = {
  home: $('screen-home'),
  lobby: $('screen-lobby'),
  game: $('screen-game')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

const GITHUB_SERVER_URL =
  'https://raw.githubusercontent.com/alibhai0001/ludo-classic-server/main/server-url.txt';

async function resolveServerUrl() {
  if (window.LUDO_SERVER && !window.LUDO_USE_GITHUB) return window.LUDO_SERVER;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return window.location.origin;
  }
  const candidates = [];
  if (window.LUDO_USE_GITHUB !== false) {
    try {
      const r = await fetch(`${GITHUB_SERVER_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) {
        const url = (await r.text()).trim().split('\n')[0].trim();
        if (url.startsWith('http')) candidates.push(url.replace(/\/$/, ''));
      }
    } catch (_) {}
  }
  if (window.LUDO_SERVER) candidates.push(window.LUDO_SERVER.replace(/\/$/, ''));
  candidates.push(window.location.origin.replace(/\/$/, ''));
  return [...new Set(candidates)];
}

async function pickLiveServer(urls) {
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(`${url}/health`, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) return url;
    } catch (_) {}
  }
  return urls[0];
}

function connectSocket(url) {
  if (socket) socket.disconnect();
  socket = io(url, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 4000,
    timeout: 10000
  });
  socket.on('connect', () => setOnlineStatus('online'));
  socket.on('disconnect', () => setOnlineStatus('offline'));
  socket.on('connect_error', () => {
    setOnlineStatus('connecting');
    toast('Server se connect ho raha hai...');
  });
  socket.on('error_msg', (d) => toast(d.message));
  return socket;
}

function setOnlineStatus(state) {
  const el = $('online-status');
  if (!el) return;
  const map = {
    finding: ['🔍 Server dhoondh rahe hain...', 'offline'],
    connecting: ['🟡 Connecting...', 'offline'],
    online: ['🟢 Online — khel sakte ho!', 'online'],
    offline: ['🔴 Disconnected', 'offline']
  };
  const [text, cls] = map[state] || map.connecting;
  el.textContent = text;
  el.className = `online-badge ${cls}`;
}

async function bootOnline() {
  setOnlineStatus('finding');
  const urls = await resolveServerUrl();
  setOnlineStatus('connecting');
  const live = await pickLiveServer(urls);
  connectSocket(live);
}

function showNameModal() {
  $('name-modal').classList.remove('hidden');
  $('player-name').value = '';
  setTimeout(() => $('player-name')?.focus(), 100);
}

function hideNameModal() {
  $('name-modal').classList.add('hidden');
}

function getName() {
  const n = $('player-name').value.trim();
  if (!n) { toast('Enter your name'); return null; }
  return n;
}

$('btn-create').onclick = () => {
  pendingAction = 'create';
  showNameModal();
};

$('btn-join').onclick = () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (!code) { toast('Enter Room ID'); return; }
  pendingAction = 'join';
  pendingJoinCode = code;
  showNameModal();
};

let pendingJoinCode = '';

$('btn-name-confirm').onclick = () => {
  const name = getName();
  if (!name) return;
  hideNameModal();
  const action = pendingAction;
  const joinCode = pendingJoinCode;
  pendingAction = null;

  const joinFlow = () => {
    if (action === 'create') {
      socket.emit('create_room', { name });
      socket.once('room_created', (d) => {
        myId = d.player_id;
        roomId = d.room.id;
        isHost = true;
        enterLobby(d.room);
      });
    } else if (action === 'join') {
      socket.emit('join_room', { room_id: joinCode, name });
      socket.once('room_joined', (d) => {
        myId = d.player_id;
        roomId = d.room.id;
        isHost = false;
        enterLobby(d.room);
      });
    }
  };

  if (socket.connected) joinFlow();
  else socket.once('connect', joinFlow);
};

$('player-name')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-name-confirm').click();
});

function enterLobby(room) {
  showScreen('lobby');
  $('lobby-room-id').textContent = room.id;
  updateLobby(room);
  socket.off('room_updated');
  socket.off('game_started');
  socket.on('room_updated', updateLobby);
  socket.on('game_started', onGameStarted);
}

function updateLobby(room) {
  const ul = $('player-list');
  ul.innerHTML = '';
  const colors = ['#ef4444', '#22c55e', '#eab308', '#3b82f6'];
  room.players.forEach((p, i) => {
    const li = document.createElement('li');
    const crown = p.id === room.host ? ' 👑' : '';
    li.innerHTML = `<span class="player-dot" style="background:${colors[i]}"></span> ${p.name}${crown}`;
    ul.appendChild(li);
  });
  isHost = myId === room.host;
  $('btn-start').disabled = !isHost || room.players.length < 2;
  $('btn-start').textContent = isHost
    ? `Start Game (${room.players.length}/4 players)`
    : `Waiting for host... (${room.players.length}/4)`;
}

$('btn-copy-code').onclick = () => {
  const text = `Join my Ludo game! Room ID: ${roomId}`;
  navigator.clipboard?.writeText(text);
  toast('Room ID copied — kahi se bhi join karo!');
};

$('btn-start').onclick = () => {
  socket.emit('start_game', { room_id: roomId });
};

$('btn-leave-lobby').onclick = () => {
  if (voice) voice.stop();
  socket.disconnect();
  showScreen('home');
};

function onGameStarted(state) {
  showScreen('game');
  gameState = state;
  $('winner-banner').classList.add('hidden');
  $('board').innerHTML = LudoBoard.renderBoardSVG();
  setupGameUI();
  setupVoice(state.players.map(p => p.id));
  renderGame();
  socket.off('dice_rolled');
  socket.off('game_updated');
  socket.off('reaction');
  socket.on('dice_rolled', (d) => {
    gameState = d.state;
    animateDice(d.dice);
    if (d.skipped) toast('Three 6s! Turn skipped');
    if (d.no_moves) toast('No valid moves — turn passed');
    renderGame();
  });
  socket.on('game_updated', (s) => {
    gameState = s;
    renderGame();
    if (s.last_capture) {
      const byName = s.players.find(p => p.id === s.last_capture.by)?.name || 'Someone';
      toast(`${byName} captured a token! 💥`);
    }
    if (s.winner) showWinner(s.winner_name);
  });
  socket.on('reaction', showReaction);
}

function animateDice(value) {
  const el = $('dice-display');
  el.classList.add('rolling');
  let n = 0;
  const iv = setInterval(() => {
    el.textContent = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][Math.floor(Math.random() * 6)];
    n++;
    if (n > 8) {
      clearInterval(iv);
      el.textContent = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][value - 1];
      el.classList.remove('rolling');
    }
  }, 80);
}

function setupGameUI() {
  $('btn-roll').onclick = () => {
    socket.emit('roll_dice', { room_id: roomId });
    $('btn-roll').disabled = true;
  };
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.onclick = () => sendReaction('emoji', btn.dataset.emoji);
  });
  document.querySelectorAll('.sticker-btn').forEach(btn => {
    btn.onclick = () => sendReaction('sticker', btn.dataset.sticker);
  });
}

function setupVoice(peerIds) {
  voice = new VoiceChat(socket, roomId, myId);
  $('btn-mic').onclick = async () => {
    if (!voice.localStream) {
      const ok = await voice.enableMic();
      if (!ok) { toast('Mic permission denied'); return; }
    }
    const on = voice.toggleMic();
    $('btn-mic').textContent = on ? '🎤 ON' : '🎤 OFF';
    $('voice-status').textContent = on ? 'Voice: mic on' : 'Voice: mic off';
    if (on) await voice.start(peerIds.filter(id => id !== myId));
  };
  $('btn-speaker').onclick = () => {
    const on = voice.toggleSpeaker();
    $('btn-speaker').textContent = on ? '🔊 ON' : '🔊 OFF';
    $('voice-status').textContent = on ? 'Speaker on' : 'Speaker muted';
  };
}

function renderGame() {
  if (!gameState) return;
  const myTurn = gameState.current_player === myId;
  const cur = gameState.players.find(p => p.id === gameState.current_player);
  $('turn-label').textContent = gameState.winner
    ? `🏆 ${gameState.winner_name} WINS!`
    : myTurn ? 'Your turn!' : `${cur?.name}'s turn`;
  $('btn-roll').disabled = !myTurn || gameState.rolled || !!gameState.winner;
  if (!gameState.rolled && !$('dice-display').classList.contains('rolling')) {
    $('dice-display').textContent = '🎲';
  } else if (gameState.dice && !$('dice-display').classList.contains('rolling')) {
    $('dice-display').textContent = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][gameState.dice - 1];
  }
  LudoBoard.renderTokens(
    $('board'),
    gameState,
    myId,
    gameState.valid_moves || [],
    (ti) => socket.emit('move_token', { room_id: roomId, token: ti })
  );
}

function showWinner(name) {
  const b = $('winner-banner');
  b.textContent = `🏆 ${name} WINS!`;
  b.classList.remove('hidden');
  sendReaction('sticker', `🏆 ${name} WINS!`);
}

function sendReaction(type, content) {
  socket.emit('send_reaction', { room_id: roomId, type, content });
}

function showReaction(r) {
  const layer = $('reactions-layer');
  const el = document.createElement('div');
  el.style.left = (15 + Math.random() * 70) + '%';
  el.style.top = (25 + Math.random() * 50) + '%';
  if (r.type === 'sticker') {
    el.className = 'floating-sticker';
    el.textContent = r.content;
  } else {
    el.className = 'floating-reaction';
    el.textContent = r.content;
  }
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

bootOnline();