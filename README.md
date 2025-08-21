# Quiz Night App (Host on TV + Players on Phones)

A tiny, self‑hosted quiz platform built with Node.js + Socket.IO. 
- **Host view** (display on TV): load your quiz, run questions, show live leaderboard.
- **Player view** (iPhones, any phone): join with a room code, submit answers in real time.

No accounts, no cloud, runs locally on your Wi‑Fi.

## Quick Start

```bash
# 1) Extract this folder
cd quiz-night-app

# 2) Install deps
npm install

# 3) Start the server
npm start
```
Now open the **Host** at: `http://<your-computer-ip>:3000/host`  
Players open on phones: `http://<your-computer-ip>:3000/player` and enter the **room code** shown on the TV.

> Tip (macOS): Find your local IP via **System Settings → Network** (e.g., 192.168.1.23).  
> AirPlay / HDMI your browser tab to the TV.

## Features
- Room code lobby (4 letters)
- MCQ and short‑text questions
- Per-question timer (optional), manual next/end controls
- Auto scoring (MCQ index or any of accepted text answers)
- Live leaderboard
- Import quiz from JSON file
- Simple anti‑spam (one answer per question, name claim protection)

## Quiz JSON Format
Create a file like `my-quiz.json`:

```json
{
  "title": "General Knowledge",
  "questions": [
    { "type": "mcq", "question": "Capital of France?", "options": ["Berlin","Paris","Rome","Madrid"], "answer": 1, "time": 20 },
    { "type": "text", "question": "Who developed relativity?", "answers": ["Einstein","Albert Einstein"], "time": 25 }
  ]
}
```

- `type`: `"mcq"` or `"text"`  
- For MCQ: `options` (array of strings) and `answer` (0‑based index)  
- For text: `answers` (array of accepted strings; case/space insensitive match)  
- Optional `time` = seconds; if omitted, host manually ends the question.

## Files
- `server.js` — Express + Socket.IO server
- `public/host.html`, `public/host.js` — Host UI
- `public/player.html`, `public/player.js` — Player UI
- `public/index.html` — Landing page
- `public/style.css` — Shared styles

## Safety & Limits
This is a demo, not hardened for the internet. **Run on your local network.**  
Avoid personally identifiable information in names/questions.

## License
MIT
