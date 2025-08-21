const socket = io();

const join = document.getElementById('join');
const joinBtn = document.getElementById('joinBtn');
const roomCodeInput = document.getElementById('code');
const nameInput = document.getElementById('name');
const joinError = document.getElementById('joinError');

const game = document.getElementById('game');
const roomCodeBadge = document.getElementById('roomCode');
const quizTitle = document.getElementById('quizTitle');

const qText = document.getElementById('qText');
const options = document.getElementById('options');
const textAnswer = document.getElementById('textAnswer');
const textInput = document.getElementById('textInput');
const submitText = document.getElementById('submitText');
const feedback = document.getElementById('feedback');
const timeBadge = document.getElementById('timeBadge');
const timeLeft = document.getElementById('timeLeft');

let canAnswer = false;
let answered = false;

joinBtn.onclick = () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();
  if (!code || !name) {
    joinError.textContent = 'Enter a room code and name.';
    return;
  }
  socket.emit('player:join', { code, name });
};

socket.on('player:joined', ({ code, title }) => {
  join.style.display = 'none';
  game.style.display = 'block';
  roomCodeBadge.textContent = code;
  quizTitle.textContent = title || 'Quiz';
});

socket.on('player:error', ({ message }) => {
  joinError.textContent = message;
});

socket.on('room:meta', ({ title }) => {
  quizTitle.textContent = title || 'Quiz';
});

socket.on('q:show', (q) => {
  canAnswer = true;
  answered = false;
  feedback.textContent = '';
  timeBadge.style.display = q.time ? 'inline-block' : 'none';
  qText.textContent = q.question;
  timeLeft.textContent = q.time || '';
  options.innerHTML = '';
  textAnswer.style.display = 'none';

  if (q.type === 'mcq') {
    (q.options || []).forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option';
      btn.textContent = `${i+1}. ${opt}`;
      btn.onclick = () => submit(i);
      options.appendChild(btn);
    });
  } else {
    textAnswer.style.display = 'flex';
  }

  if (q.time) {
    let t = q.time;
    const timer = setInterval(() => {
      t -= 1;
      if (t < 0) t = 0;
      timeLeft.textContent = t;
      if (t === 0 || !canAnswer) clearInterval(timer);
    }, 1000);
  }
});

socket.on('q:ended', ({ correct }) => {
  canAnswer = false;
  if (!answered) feedback.textContent = '⏱ Too late!';
  if (correct.type === 'mcq') {
    // No need to do anything else here; host shows reveal
  } else {
    // Show accepted answers for info
  }
});

socket.on('quiz:ended', ({ leaderboard }) => {
  canAnswer = false;
  feedback.textContent = '🎉 Quiz finished!';
});

submitText.onclick = () => {
  const val = textInput.value.trim();
  if (!val) return;
  submit(val);
};

function submit(value) {
  if (!canAnswer || answered) return;
  answered = true;
  socket.emit('player:answer', { value });
  feedback.textContent = '✅ Answer submitted';
}
