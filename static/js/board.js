/** Ludo board rendering + token positions (synced with server path indices) */
const CELL = 100 / 15;

const BOARD_PATH = (() => {
  const seq = [
    [6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],
    [13,2],[13,3],[13,4],[13,5],[13,6],
    [14,6],[14,7],[14,8],
    [13,8],[13,9],[13,10],[13,11],[13,12],[13,13],[13,14],
    [12,14],[11,14],[10,14],[9,14],[8,14],[7,14],[6,14],
    [6,13],[6,12],[6,11],[6,10],[6,9],[6,8],
    [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
    [0,7],[0,6],
    [1,6],[2,6],[3,6],[4,6],[5,6],
    [6,6],[6,5],[6,4],[6,3],[6,2]
  ];
  const cell = CELL;
  return seq.map(([x, y], i) => ({
    i,
    x: (x + 0.5) * cell,
    y: (y + 0.5) * cell
  }));
})();

const START_IDX = { red: 0, green: 13, yellow: 26, blue: 39 };

const HOME_PATHS = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  green:  [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  blue:   [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]]
};

const YARD_POS = {
  red:    [[1.5,1.5],[3.5,1.5],[1.5,3.5],[3.5,3.5]],
  green:  [[10.5,1.5],[12.5,1.5],[10.5,3.5],[12.5,3.5]],
  yellow: [[10.5,10.5],[12.5,10.5],[10.5,12.5],[12.5,12.5]],
  blue:   [[1.5,10.5],[3.5,10.5],[1.5,12.5],[3.5,12.5]]
};

function posToXY(color, tokenPos) {
  if (tokenPos === -1) return null;
  if (tokenPos === 57) {
    const h = HOME_PATHS[color][5];
    return { x: (h[0] + 0.5) * CELL, y: (h[1] + 0.5) * CELL };
  }
  if (tokenPos >= 52) {
    const h = HOME_PATHS[color][tokenPos - 52];
    return { x: (h[0] + 0.5) * CELL, y: (h[1] + 0.5) * CELL };
  }
  const idx = (START_IDX[color] + tokenPos) % 52;
  const p = BOARD_PATH[idx];
  return { x: p.x, y: p.y };
}

function yardXY(color, ti) {
  const [x, y] = YARD_POS[color][ti];
  return { x: x * CELL, y: y * CELL };
}

function renderBoardSVG() {
  const dots = BOARD_PATH.map(p =>
    `<circle cx="${p.x}" cy="${p.y}" r="0.8" fill="#cbd5e1" opacity="0.5"/>`
  ).join('');

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" fill="#f8fafc"/>
    <rect x="0" y="0" width="40" height="40" fill="#fecaca" stroke="#333" stroke-width="0.3"/>
    <rect x="60" y="0" width="40" height="40" fill="#bbf7d0" stroke="#333" stroke-width="0.3"/>
    <rect x="60" y="60" width="40" height="40" fill="#fef08a" stroke="#333" stroke-width="0.3"/>
    <rect x="0" y="60" width="40" height="40" fill="#bfdbfe" stroke="#333" stroke-width="0.3"/>
    <rect x="40" y="40" width="20" height="20" fill="#e2e8f0" stroke="#333" stroke-width="0.3"/>
    <polygon points="50,42 54,50 50,58 46,50" fill="#94a3b8"/>
    <rect x="40" y="0" width="20" height="40" fill="#f1f5f9" stroke="#333" stroke-width="0.2"/>
    <rect x="40" y="60" width="20" height="40" fill="#f1f5f9" stroke="#333" stroke-width="0.2"/>
    <rect x="0" y="40" width="40" height="20" fill="#f1f5f9" stroke="#333" stroke-width="0.2"/>
    <rect x="60" y="40" width="40" height="20" fill="#f1f5f9" stroke="#333" stroke-width="0.2"/>
    <rect x="6.66" y="0" width="6.66" height="6.66" fill="#ef4444"/>
    <rect x="53.33" y="0" width="6.66" height="6.66" fill="#22c55e"/>
    <rect x="53.33" y="93.33" width="6.66" height="6.66" fill="#eab308"/>
    <rect x="6.66" y="93.33" width="6.66" height="6.66" fill="#3b82f6"/>
    <line x1="${7.5*CELL}" y1="${0}" x2="${7.5*CELL}" y2="${6.66*CELL}" stroke="#ef4444" stroke-width="1.2" opacity="0.5"/>
    <line x1="${93.33}" y1="${7.5*CELL}" x2="${100}" y2="${7.5*CELL}" stroke="#22c55e" stroke-width="1.2" opacity="0.5"/>
    <line x1="${7.5*CELL}" y1="${93.33}" x2="${7.5*CELL}" y2="${100}" stroke="#eab308" stroke-width="1.2" opacity="0.5"/>
    <line x1="${0}" y1="${7.5*CELL}" x2="${6.66*CELL}" y2="${7.5*CELL}" stroke="#3b82f6" stroke-width="1.2" opacity="0.5"/>
    ${dots}
  </svg>`;
}

function renderTokens(container, state, myId, validMoves, onTokenClick) {
  container.querySelectorAll('.token').forEach(t => t.remove());

  state.players.forEach(player => {
    player.tokens.forEach((pos, ti) => {
      const xy = pos === -1 ? yardXY(player.color, ti) : posToXY(player.color, pos);
      if (!xy) return;

      const el = document.createElement('div');
      el.className = `token ${player.color}`;
      const isMyTurn = state.current_player === myId;
      const isMine = player.id === myId;
      const canMove = isMyTurn && isMine && validMoves.includes(ti);
      if (canMove) el.classList.add('selectable');
      el.style.left = `calc(${xy.x}% - 11px)`;
      el.style.top = `calc(${xy.y}% - 11px)`;
      el.textContent = ti + 1;
      el.title = `${player.name} #${ti + 1}`;
      if (canMove) el.onclick = () => onTokenClick(ti);
      container.appendChild(el);
    });
  });
}

window.LudoBoard = { renderBoardSVG, renderTokens, posToXY };