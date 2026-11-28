<img width="1920" height="1020" alt="Снимок экрана 2026-11-28 162034" src="https://github.com/user-attachments/assets/5b30b84b-dfe8-4d6e-9ea5-1bd3a3cda681" />
<img width="1920" height="1020" alt="Снимок экрана 2026-11-28 162051" src="https://github.com/user-attachments/assets/3150a385-5450-48de-99ec-d59b725ef0d7" />

# 🎵 Elements of Harmony — WebTool

## Table of Contents

- [Before You Start](#before-you-start)
- [How to Run](#how-to-run)
- [How to Use](#how-to-use)
- [Screenshots](#screenshots)
- [License](license.md)

### Terms
- Tap — a single press in the minigame
- Hold — a press-and-hold in the minigame

## Before You Start

You need to install Python 3.10+ [from the official website](https://python.org) (version `3.14.10` was used during testing)

The `Standalone` version of the Elements of Harmony mod was used during testing

## How to Run

1. Download the repository: `Code -> Download ZIP`
2. Extract it anywhere
3. Download `ffmpeg.exe` from `Releases` and place it in the root folder of the extracted repository (in the same folder as `app.py` and the other files)
4. Run `install.bat`
5. Run `run.bat`
6. If the browser doesn't open automatically, open it manually and go to `http://127.0.0.1:5000`

## How to Use

1. Click the `Select File` button or drag and drop a track file onto the page
2. Fill in all the fields in the left panel
3. Select the score percentages
4. Use the sliders to set the desired number and spacing of taps and holds (roughly: 1 minute — 100 taps). On the right side of the main block, you can see two graphs (taps and holds on the top one, and track visualization on the bottom one). Below that is the player. Further down is the tap and hold log. At the very bottom, you can see the config preview
5. Once you have set the desired values using the sliders, click the `Recalculate` button so the app recalculates the taps and adds them to the config (note: after recalculation, the `bpm` field resets to the track's actual BPM!)
6. Download the generated files: the track in `.ogg` format and the config file
7. Move these two files into the game directory at: `My Little Pony/Elements of Harmony/Assets/Minigame/Dance/`

If you need to upload another track, simply scroll up the left panel, click the `x` in the top right corner, and confirm closing in the modal window.

---

# Have fun playing!
