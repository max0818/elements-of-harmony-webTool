import os
import uuid
import subprocess
import shutil
import webbrowser
import threading
from flask import Flask, request, jsonify, render_template, send_from_directory

import librosa
import numpy as np

app = Flask(__name__)
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 1. Ищем ffmpeg в папке рядом с app.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
local_ffmpeg = os.path.join(BASE_DIR, "ffmpeg.exe") # Для Windows
# local_ffmpeg = os.path.join(BASE_DIR, "ffmpeg")   # Раскомментируй, если переносишь на Linux/Mac

if os.path.exists(local_ffmpeg):
    FFMPEG = local_ffmpeg
    print(f"[i] Используется локальный ffmpeg: {FFMPEG}")
else:
    # 2. Если локального нет, ищем в системном PATH
    FFMPEG = shutil.which("ffmpeg")
    if FFMPEG:
        print(f"[i] Используется системный ffmpeg: {FFMPEG}")
    else:
        print("[!] ВНИМАНИЕ: ffmpeg не найден ни рядом со скриптом, ни в PATH.")

SESSIONS = {}

def _run_ffmpeg(args):
    if not FFMPEG:
        raise RuntimeError("ffmpeg не найден в PATH.")
    cmd = [FFMPEG, "-y"] + args
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"ffmpeg failed: {e.stderr.decode(errors='ignore')}")

def convert_to_ogg(input_path, output_path):
    _run_ffmpeg(["-i", input_path, "-c:a", "libvorbis", "-q:a", "10", output_path])

def convert_to_wav(input_path, output_path):
    _run_ffmpeg(["-i", input_path, "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le", output_path])

def analyze_audio(path):
    y, sr = librosa.load(path, sr=None, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.atleast_1d(tempo)[0])

    hop = 512
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_env, sr=sr, hop_length=hop,
        delta=0.0, wait=1, backtrack=False, units='frames'
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop)
    strengths = onset_env[onset_frames]

    events = []
    env_len = len(onset_env)
    for frame, t, s in zip(onset_frames, onset_times, strengths):
        peak = float(s)
        threshold = peak * 0.4
        j = frame + 1
        max_hold_frames = int(1.5 * sr / hop)
        while j < env_len and j - frame < max_hold_frames and onset_env[j] >= threshold:
            j += 1
        hold_dur = float((j - frame) * hop / sr)
        events.append({"time": float(t), "strength": peak, "hold": hold_dur})

    target = 4000
    if len(onset_env) > target:
        step = len(onset_env) // target
        env_ds = onset_env[::step]
        env_times = librosa.frames_to_time(np.arange(0, len(onset_env), step), sr=sr, hop_length=hop)
    else:
        env_ds = onset_env
        env_times = librosa.frames_to_time(np.arange(len(onset_env)), sr=sr, hop_length=hop)

    return {
        "duration": duration,
        "bpm": bpm,
        "events": events,
        "env": [float(x) for x in env_ds],
        "env_times": [float(x) for x in env_times],
    }

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file"}), 400

    sid = uuid.uuid4().hex
    ext = os.path.splitext(f.filename)[1].lower() or ".bin"
    base = os.path.splitext(f.filename)[0]
    raw_path = os.path.join(UPLOAD_DIR, f"{sid}_raw{ext}")
    ogg_path = os.path.join(UPLOAD_DIR, f"{sid}.ogg")
    wav_path = os.path.join(UPLOAD_DIR, f"{sid}.wav")
    f.save(raw_path)

    try:
        convert_to_ogg(raw_path, ogg_path)
        convert_to_wav(raw_path, wav_path)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400

    if " - " in base:
        author, title = base.split(" - ", 1)
    else:
        author, title = "", base

    SESSIONS[sid] = {
        "ogg_path": ogg_path,
        "wav_path": wav_path,
        "original_base": base,
        "title": title.strip(),
        "author": author.strip(),
        "analysis": None,
    }

    # Автоанализ сразу
    try:
        data = analyze_audio(wav_path)
        SESSIONS[sid]["analysis"] = data
    except Exception as e:
        return jsonify({"error": f"analyze failed: {e}"}), 500

    return jsonify({
        "session_id": sid,
        "title": title.strip(),
        "author": author.strip(),
        "audio_url": f"/audio/{sid}",
        "download_ogg_url": f"/download_ogg/{sid}",
        "config_filename": base + ".txt",
        "analysis": data,
    })

@app.route("/audio/<sid>")
def audio(sid):
    if sid not in SESSIONS:
        return "Not found", 404
    return send_from_directory(UPLOAD_DIR, f"{sid}.ogg", mimetype="audio/ogg")

@app.route("/download_ogg/<sid>")
def download_ogg(sid):
    if sid not in SESSIONS:
        return "Not found", 404
    name = SESSIONS[sid]["original_base"] + ".ogg"
    return send_from_directory(UPLOAD_DIR, f"{sid}.ogg", as_attachment=True, download_name=name)

@app.route("/analyze/<sid>", methods=["POST"])
def analyze(sid):
    if sid not in SESSIONS:
        return jsonify({"error": "Not found"}), 404
    data = analyze_audio(SESSIONS[sid]["wav_path"])
    SESSIONS[sid]["analysis"] = data
    return jsonify(data)

@app.route("/download/<sid>", methods=["POST"])
def download(sid):
    if sid not in SESSIONS:
        return jsonify({"error": "Not found"}), 404
    content = request.json.get("content", "")
    filename = request.json.get("filename") or (SESSIONS[sid]["original_base"] + ".txt")
    path = os.path.join(UPLOAD_DIR, f"{sid}_out.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return send_from_directory(UPLOAD_DIR, os.path.basename(path), as_attachment=True, download_name=filename)

if __name__ == "__main__":
    threading.Timer(1.0, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    app.run(host="127.0.0.1", port=5000, debug=False)