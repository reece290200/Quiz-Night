const socket = io();

let roomCode = null;
let quizData = null;
let timerInterval = null;
let currentTimeLeft = null;
let currentQuestion = null;

const els = {
  roomInfo: document.getElementById('roomInfo'),
  createRoom: document.getElementById('createRoom'),
  quizFile: document.getElementById('quizFile'),
  loadQuiz: document.getElementById('loadQuiz'),
  startQuiz: document.getElementById('startQuiz'),
  lobby: document.getElementById('lobby'),
  playerList: document.getElementById('playerList'),
  playerCount: document.getElementById('playerCount'),
  roomCode: document.getElementById('roomCode'),
  quizTitle: document.getElementById('quizTitle'),
  questionPanel: document.getElementById('question'),
  qText: document.getElementById('qText'),
  qOptions: document.getElementById('qOptions'),
  answerCount: document.getElementById('answerCount'),
  nextQuestion: document.getElementById('nextQuestion'),
  endQuestion: document.getElementById('endQuestion'),
  timerBadge: document.getElementById('timerBadge'),
  timer: document.getElementById('timer'),
  qIndex: document.getElementById('qIndex'),
  summary: document.getElementById('summary'),
  leaderboard: document.getElementById('leaderboard'),
  setup: document.getElementById('setup'),
  hostAnswers: document.getElementById('hostAnswers'),
};

els.createRoom.onclick = () => {
  socket.emit('host:createRoom');
};

socket.on('host:roomCreated', ({ code }) => {
  roomCode = code;
  els.roomInfo.style.display = 'inline-block';
  els.roomInfo.textContent = `Room Code: ${code}`;
  els.lobby.style.display = 'block';
  els.roomCode.textContent = code;
});

els.loadQuiz.onclick = async () => {
  if (!roomCode) return alert('Create a room first.');
  const file = els.quizFile.files[0];
  if (!file) return alert('Select a quiz JSON file.');
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return alert('Invalid JSON.');
  }
  if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
    return alert('Quiz must have a non-empty "questions" array.');
  }
  quizData = data;
  els.quizTitle.textContent = data.title || 'Untitled Quiz';
  els.startQuiz.disabled = false;
  socket.emit('host:setQuiz', { code: roomCode, title: data.title || 'Untitled Quiz', quiz: data });
};

els.startQuiz.onclick = () => {
  if (!quizData) return;
  socket.emit('host:start', { code: roomCode });
  // first question will be triggered by "next"
};

els.nextQuestion.onclick = () => {
  socket.emit('host:next', { code: roomCode });
  resetTimer();
};

els.endQuestion.onclick = () => {
  socket.emit('host:endQuestion', { code: roomCode });
  resetTimer();
};

socket.on('room:meta', ({ title, qCount }) => {
  els.quizTitle.textContent = title;
});

socket.on('room:started', () => {
  els.setup.style.display = 'none';
  els.summary.style.display = 'none';
  els.questionPanel.style.display = 'block';
  // ask first question
  els.nextQuestion.click();
});

socket.on('room:players', (players) => {
  els.playerCount.textContent = players.length;
  els.playerList.innerHTML = players.map(p => `<li>${p.name} <span class="small dim">(${p.score})</span></li>`).join('');
});

socket.on('q:show', (q) => {
  currentQuestion = q;
  els.qIndex.textContent = String(q.index + 1);
  els.qText.textContent = q.question;
  els.qOptions.innerHTML = '';
  els.hostAnswers.textContent = '';
  els.answerCount.textContent = '0';
  if (q.type === 'mcq' && q.options) {
    const ol = document.createElement('ol');
    q.options.forEach((opt, i) => {
      const li = document.createElement('li');
      li.textContent = `${opt}`;
      ol.appendChild(li);
    });
    els.qOptions.appendChild(ol);
  }
  if (q.time) {
    currentTimeLeft = q.time;
    els.timerBadge.style.display = 'inline-block';
    els.timer.textContent = currentTimeLeft;
    timerInterval = setInterval(() => {
      currentTimeLeft -= 1;
      if (currentTimeLeft < 0) currentTimeLeft = 0;
      els.timer.textContent = currentTimeLeft;
      if (currentTimeLeft === 0) {
        clearInterval(timerInterval);
      }
    }, 1000);
  } else {
    els.timerBadge.style.display = 'none';
  }
});

socket.on('host:answer:update', ({ count, total }) => {
  els.answerCount.textContent = `${count}/${total}`;
});

socket.on('q:ended', ({ index, correct, leaderboard, answerStats }) => {
  // show correct answer
  if (currentQuestion && currentQuestion.index === index) {
    if (correct.type === 'mcq') {
      const idx = correct.answerIndex;
      const items = (currentQuestion.options || []).map((opt, i) => {
        const mark = i === idx ? '✅' : '❌';
        return `<div>${mark} ${opt}</div>`;
      }).join('');
      els.qOptions.innerHTML = items;
    } else {
      els.qOptions.innerHTML = `<div>✅ Accepted answers: ${correct.accepted.join(', ')}</div>`;
    }
  }
  // show leaderboard
  renderLeaderboard(leaderboard);
  // stats
  if (answerStats && answerStats.type === 'mcq') {
    els.hostAnswers.innerHTML = 'Answer distribution: ' +
      answerStats.counts.map((c,i)=>`[${i+1}:${c}]`).join(' ');
  } else if (answerStats && answerStats.type === 'text') {
    els.hostAnswers.textContent = `Correct: ${answerStats.correct}/${answerStats.total}`;
  }
});

socket.on('host:q:show', (q) => {
  // no-op: already handled by q:show for host display
});

socket.on('host:q:ended', ({ answers }) => {
  // Show a compact list of who answered what
  els.hostAnswers.innerHTML += '<br/>' + answers.map(a => `${a.correct?'✅':'❌'} ${a.name}: ${a.value}`).join(' • ');
});

socket.on('quiz:ended', ({ leaderboard }) => {
  renderLeaderboard(leaderboard);
  els.questionPanel.style.display = 'none';
  els.summary.style.display = 'block';
});

socket.on('room:closed', () => {
  alert('Room closed (host disconnected).');
  location.href = '/';
});

function renderLeaderboard(data) {
  const rows = data.map(d => `<tr><td>${d.rank}</td><td>${d.name}</td><td>${d.score}</td></tr>`).join('');
  els.leaderboard.innerHTML = `<table><thead><tr><th>#</th><th>Name</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function resetTimer() {
  if (timerInterval) clearInterval(timerInterval);
  els.timerBadge.style.display = 'none';
}
