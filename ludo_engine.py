"""Classic Ludo game engine (server authoritative)."""
import random

START_POS = [0, 13, 26, 39]
HOME_ENTRY = [51, 12, 25, 38]
SAFE_SPOTS = {0, 8, 13, 21, 26, 34, 39, 47}
COLORS = ["red", "green", "yellow", "blue"]


class LudoGame:
    def __init__(self, player_ids, player_names):
        self.player_ids = player_ids[:4]
        self.player_names = {pid: player_names[pid] for pid in self.player_ids}
        self.num_players = len(self.player_ids)
        self.tokens = {pid: [-1, -1, -1, -1] for pid in self.player_ids}
        self.current_idx = 0
        self.dice = 0
        self.rolled = False
        self.consecutive_sixes = 0
        self.winner = None
        self.last_capture = None
        self.valid_moves = []

    @property
    def current_player(self):
        return self.player_ids[self.current_idx]

    def roll_dice(self):
        if self.winner or self.rolled:
            return None
        self.dice = random.randint(1, 6)
        self.rolled = True
        self.last_capture = None

        if self.dice == 6:
            self.consecutive_sixes += 1
            if self.consecutive_sixes >= 3:
                self.consecutive_sixes = 0
                self._next_turn()
                return {"dice": self.dice, "extra_turn": False, "skipped": True, "no_moves": False}

        self.valid_moves = self._calc_valid_moves()
        if not self.valid_moves:
            if self.dice != 6:
                self.consecutive_sixes = 0
            self._next_turn(extra=self.dice == 6)
            return {
                "dice": self.dice,
                "extra_turn": False,
                "skipped": False,
                "no_moves": True,
            }

        return {
            "dice": self.dice,
            "extra_turn": self.dice == 6,
            "skipped": False,
            "no_moves": False,
            "valid_moves": self.valid_moves,
        }

    def _player_color_idx(self, pid):
        return self.player_ids.index(pid)

    def _calc_valid_moves(self):
        pid = self.current_player
        ci = self._player_color_idx(pid)
        moves = []
        for ti, pos in enumerate(self.tokens[pid]):
            if pos == 57:
                continue
            if pos == -1:
                if self.dice == 6 and not self._blocked_at_start(ci):
                    moves.append(ti)
                continue
            new_pos = self._advance(pid, pos, self.dice)
            if new_pos is not None:
                moves.append(ti)
        return moves

    def _blocked_at_start(self, ci):
        start = START_POS[ci]
        own_on_start = sum(
            1 for p in self.tokens[self.player_ids[ci]] if p == start
        )
        return own_on_start >= 2

    def _advance(self, pid, pos, steps):
        ci = self._player_color_idx(pid)
        if pos >= 52:
            new_pos = pos + steps
            if new_pos > 57:
                return None
            return new_pos
        entry = HOME_ENTRY[ci]
        dist_to_entry = (entry - pos) % 52
        if steps > dist_to_entry:
            home_steps = steps - dist_to_entry - 1
            if home_steps > 6:
                return None
            return 52 + home_steps
        return (pos + steps) % 52

    def move_token(self, token_idx):
        if self.winner or not self.rolled or token_idx not in self.valid_moves:
            return False, "Invalid move"
        pid = self.current_player
        pos = self.tokens[pid][token_idx]
        ci = self._player_color_idx(pid)

        if pos == -1:
            self.tokens[pid][token_idx] = START_POS[ci]
        else:
            new_pos = self._advance(pid, pos, self.dice)
            if new_pos is None:
                return False, "Invalid move"
            self.tokens[pid][token_idx] = new_pos
            self._handle_capture(pid, new_pos)

        if all(t == 57 for t in self.tokens[pid]):
            self.winner = pid

        extra = self.dice == 6 and not self.winner
        if extra:
            self.consecutive_sixes = 0
        self._next_turn(extra=extra)
        return True, "ok"

    def _handle_capture(self, pid, pos):
        if pos >= 52 or pos in SAFE_SPOTS:
            return
        self.last_capture = None
        for opid in self.player_ids:
            if opid == pid:
                continue
            for i, p in enumerate(self.tokens[opid]):
                if p == pos and p < 52:
                    self.tokens[opid][i] = -1
                    self.last_capture = {"by": pid, "player": opid, "token": i}

    def _next_turn(self, extra=False):
        self.rolled = False
        self.dice = 0
        self.valid_moves = []
        if self.winner:
            return
        if extra:
            return
        self.current_idx = (self.current_idx + 1) % self.num_players

    def state(self):
        return {
            "players": [
                {
                    "id": pid,
                    "name": self.player_names[pid],
                    "color": COLORS[self._player_color_idx(pid)],
                    "tokens": self.tokens[pid],
                }
                for pid in self.player_ids
            ],
            "current_player": self.current_player,
            "dice": self.dice,
            "rolled": self.rolled,
            "valid_moves": self.valid_moves,
            "winner": self.winner,
            "winner_name": self.player_names.get(self.winner) if self.winner else None,
            "last_capture": self.last_capture,
        }