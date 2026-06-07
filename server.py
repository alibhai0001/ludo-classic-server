#!/usr/bin/env python3
"""Ludo online multiplayer server — global rooms, no local IP needed."""
import os
import random
import string
from pathlib import Path

from flask import Flask, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room

from ludo_engine import LudoGame

BASE = Path(__file__).parent
app = Flask(__name__, static_folder=str(BASE / "static"), static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "ludo-online-server")
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="eventlet",
    ping_timeout=60,
    ping_interval=25,
)

rooms = {}  # room_id -> dict


def gen_room_id():
    chars = string.ascii_uppercase + string.digits
    for _ in range(100):
        rid = "".join(random.choices(chars, k=6))
        if rid not in rooms:
            return rid
    return "".join(random.choices(chars, k=8))


def room_public(room):
    return {
        "id": room["id"],
        "host": room["host"],
        "players": [
            {"id": p["id"], "name": p["name"], "color": p.get("color")}
            for p in room["players"]
        ],
        "started": room["started"],
        "max_players": 4,
    }


@app.route("/")
def index():
    return send_from_directory(BASE / "static", "index.html")


@app.route("/health")
def health():
    return jsonify({"ok": True, "rooms": len(rooms)})


@socketio.on("connect")
def on_connect():
    emit("connected", {"ok": True})


@socketio.on("create_room")
def on_create_room(data):
    sid = request_sid()
    name = (data.get("name") or "Player").strip()[:20]
    rid = gen_room_id()
    player = {"id": sid, "name": name, "color": None}
    rooms[rid] = {
        "id": rid,
        "host": sid,
        "players": [player],
        "started": False,
        "game": None,
        "reactions": [],
    }
    join_room(rid)
    emit("room_created", {"room": room_public(rooms[rid]), "player_id": sid})
    emit("room_updated", room_public(rooms[rid]), room=rid)


@socketio.on("join_room")
def on_join_room(data):
    sid = request_sid()
    rid = (data.get("room_id") or "").strip().upper()
    name = (data.get("name") or "Player").strip()[:20]
    room = rooms.get(rid)
    if not room:
        emit("error_msg", {"message": "Room not found"})
        return
    if room["started"]:
        emit("error_msg", {"message": "Game already started"})
        return
    if len(room["players"]) >= 4:
        emit("error_msg", {"message": "Room is full"})
        return
    room["players"] = [p for p in room["players"] if p["name"].lower() != name.lower()]
    player = {"id": sid, "name": name, "color": None}
    room["players"].append(player)
    join_room(rid)
    emit("room_joined", {"room": room_public(room), "player_id": sid})
    emit("room_updated", room_public(room), room=rid)


@socketio.on("start_game")
def on_start_game(data):
    sid = request_sid()
    rid = (data.get("room_id") or "").strip().upper()
    room = rooms.get(rid)
    if not room or room["host"] != sid:
        emit("error_msg", {"message": "Only host can start"})
        return
    if len(room["players"]) < 2:
        emit("error_msg", {"message": "Need at least 2 players"})
        return
    if room["started"]:
        return
    pids = [p["id"] for p in room["players"]]
    names = {p["id"]: p["name"] for p in room["players"]}
    from ludo_engine import COLORS
    for i, p in enumerate(room["players"]):
        p["color"] = COLORS[i]
    room["game"] = LudoGame(pids, names)
    room["started"] = True
    emit("game_started", room["game"].state(), room=rid)


@socketio.on("roll_dice")
def on_roll_dice(data):
    sid = request_sid()
    rid = (data.get("room_id") or "").strip().upper()
    room = rooms.get(rid)
    if not room or not room["game"]:
        return
    if room["game"].current_player != sid:
        emit("error_msg", {"message": "Not your turn"})
        return
    result = room["game"].roll_dice()
    if result:
        emit("dice_rolled", {**result, "state": room["game"].state()}, room=rid)


@socketio.on("move_token")
def on_move_token(data):
    sid = request_sid()
    rid = (data.get("room_id") or "").strip().upper()
    token_idx = int(data.get("token", -1))
    room = rooms.get(rid)
    if not room or not room["game"]:
        return
    if room["game"].current_player != sid:
        emit("error_msg", {"message": "Not your turn"})
        return
    ok, msg = room["game"].move_token(token_idx)
    if ok:
        emit("game_updated", room["game"].state(), room=rid)
    else:
        emit("error_msg", {"message": msg})


@socketio.on("send_reaction")
def on_send_reaction(data):
    sid = request_sid()
    rid = (data.get("room_id") or "").strip().upper()
    room = rooms.get(rid)
    if not room:
        return
    reaction = {
        "from": sid,
        "name": next((p["name"] for p in room["players"] if p["id"] == sid), "Player"),
        "type": data.get("type", "emoji"),
        "content": data.get("content", "😂"),
    }
    emit("reaction", reaction, room=rid)


@socketio.on("webrtc_signal")
def on_webrtc_signal(data):
    target = data.get("target")
    if not target:
        return
    socketio.emit(
        "webrtc_signal",
        {
            "from": request_sid(),
            "signal": data.get("signal"),
            "type": data.get("type"),
        },
        to=target,
    )


@socketio.on("disconnect")
def on_disconnect():
    sid = request_sid()
    for rid, room in list(rooms.items()):
        room["players"] = [p for p in room["players"] if p["id"] != sid]
        if not room["players"]:
            del rooms[rid]
            continue
        if room["host"] == sid:
            room["host"] = room["players"][0]["id"]
        if room["started"] and len(room["players"]) < 2:
            room["started"] = False
            room["game"] = None
        emit("room_updated", room_public(room), room=rid)
        emit("player_left", {"id": sid}, room=rid)


def request_sid():
    from flask import request
    return request.sid


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Ludo online server: http://0.0.0.0:{port}")
    socketio.run(app, host="0.0.0.0", port=port, debug=False)