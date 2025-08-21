
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

function makeCode(existing) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O to avoid confusion
  let code = '';
  do {
    code = Array.from({length: 4}, () => alphabet[Math.floor(Math.random()*alphabet.length)]).join('');
  } while (existing.has(code));
  return code;
}

// In-memory rooms (reset when server restarts)
const rooms = new Map();
// Shape: rooms.set(code, {
//   hostId, started, title, quiz, qIndex, players: Map<socketId, {name, score}>
//   nameToId: Map<nameLower, socketId>,
//   acceptingAnswers, answers: Map<socketId, { submitted: boolean, value, correct:boolean, time: number }>
// })

io.on('connection', (socket) => {
  // Host creates a room
  socket.on('host:createRoom', () => {
    const code = makeCode(rooms);
    rooms.set(code, {
      hostId: socket.id,
      started: false,
      title: 'Untitled Quiz',
      quiz: null,
      qIndex: -1,
      acceptingAnswers: false,
      answers: new Map(),
      players: new Map(),
      nameToId: new Map()
    });
    socket.join(code);
    socket.emit('host:roomCreated', { code });
  });

  // Host loads quiz JSON
  socket.on('host:setQuiz', ({ code, title, quiz }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    room.title = title || 'Untitled Quiz';
    room.quiz = quiz;
    room.qIndex = -1;
    room.started = false;
    io.to(code).emit('room:meta', { title: room.title, qCount: quiz.questions.length });
  });

  // Host starts quiz
  socket.on('host:start', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || !room.quiz) return;
    room.started = true;
    room.qIndex = -1;
    io.to(code).emit('room:started');
  });

  // Host next question
  socket.on('host:next', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || !room.quiz) return;
    room.qIndex += 1;
    if (room.qIndex >= room.quiz.questions.length) {
      io.to(code).emit('quiz:ended', { leaderboard: leaderboardData(room) });
      room.acceptingAnswers = false;
      return;
    }
    room.answers = new Map();
    const q = room.quiz.questions[room.qIndex];
    room.acceptingAnswers = true;
    io.to(code).emit('q:show', sanitizeQuestionForPlayers(q, room.qIndex));
    io.to(room.hostId).emit('host:q:show', { ...q, index: room.qIndex });

    // Auto end by timer if present
    if (typeof q.time === 'number' && q.time > 0) {
      setTimeout(() => {
        // Only end if still same question and accepting
        const r2 = rooms.get(code);
        if (!r2 || r2.qIndex !== room.qIndex || !r2.acceptingAnswers) return;
        endQuestion(code);
      }, q.time * 1000);
    }
  });

  // Host ends question manually
  socket.on('host:endQuestion', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    endQuestion(code);
  });

  // Player joins
  socket.on('player:join', ({ code, name }) => {
    const room = rooms.get(code);
    if (!room) {
      socket.emit('player:error', { message: 'Room not found.' });
      return;
    }
    const nameKey = (name || '').trim().toLowerCase();
    if (!nameKey) {
      socket.emit('player:error', { message: 'Please enter a name.' });
      return;
    }
    // name claim protection
    if (room.nameToId.has(nameKey)) {
      socket.emit('player:error', { message: 'Name already taken in this room.' });
      return;
    }
    room.players.set(socket.id, { name: name.trim(), score: 0 });
    room.nameToId.set(nameKey, socket.id);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerName = name.trim();

    socket.emit('player:joined', { code, title: room.title });
    io.to(code).emit('room:players', rosterData(room));
  });

  // Player answer
  socket.on('player:answer', ({ value }) => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (!room || !room.acceptingAnswers) return;
    const q = room.quiz.questions[room.qIndex];
    if (!q) return;
    const now = Date.now();
    // prevent multiple submissions
    if (room.answers.has(socket.id)) return;

    const correct = isCorrect(q, value);
    room.answers.set(socket.id, { submitted: true, value, correct, time: now });
    socket.emit('player:answer:received', { correct }); // don't reveal answer yet
    io.to(room.hostId).emit('host:answer:update', { count: room.answers.size, total: room.players.size });
  });

  // Disconnect cleanup
  socket.on('disconnect', () => {
    // Host disconnect
    for (const [code, room] of rooms.entries()) {
      if (room.hostId === socket.id) {
        io.to(code).emit('room:closed');
        rooms.delete(code);
        break;
      }
      // Player disconnect
      if (room.players.has(socket.id)) {
        const nameKey = (room.players.get(socket.id).name || '').trim().toLowerCase();
        room.players.delete(socket.id);
        room.nameToId.delete(nameKey);
        io.to(code).emit('room:players', rosterData(room));
        break;
      }
    }
  });

  function endQuestion(code) {
    const room = rooms.get(code);
    if (!room || !room.quiz) return;
    room.acceptingAnswers = false;
    const q = room.quiz.questions[room.qIndex];
    // score answers
    for (const [pid, ans] of room.answers.entries()) {
      if (ans.correct) {
        const p = room.players.get(pid);
        if (p) p.score += 1;
      }
    }
    const correctAnswerPayload = revealAnswerPayload(q);
    io.to(code).emit('q:ended', {
      index: room.qIndex,
      correct: correctAnswerPayload,
      leaderboard: leaderboardData(room),
      answerStats: answerStats(room, q)
    });
    io.to(room.hostId).emit('host:q:ended', {
      index: room.qIndex,
      correct: correctAnswerPayload,
      answers: hostAnswerList(room, q)
    });
  }
});

function isCorrect(q, value) {
  if (q.type === 'mcq') {
    const idx = Number(value);
    return Number.isInteger(idx) && idx === q.answer;
  } else {
    const v = String(value || '').trim().toLowerCase();
    const accepted = (q.answers || []).map(a => String(a).trim().toLowerCase());
    return accepted.includes(v);
  }
}

function sanitizeQuestionForPlayers(q, index) {
  if (q.type === 'mcq') {
    return { index, type: q.type, question: q.question, options: q.options, time: q.time || null };
  } else {
    return { index, type: q.type, question: q.question, time: q.time || null };
  }
}

function revealAnswerPayload(q) {
  if (q.type === 'mcq') {
    return { type: 'mcq', answerIndex: q.answer };
  } else {
    return { type: 'text', accepted: q.answers || [] };
  }
}

function rosterData(room) {
  return Array.from(room.players.values()).map(p => ({ name: p.name, score: p.score }));
}

function leaderboardData(room) {
  return Array.from(room.players.values())
    .sort((a,b) => b.score - a.score)
    .map((p, i) => ({ rank: i+1, name: p.name, score: p.score }));
}

function answerStats(room, q) {
  if (q.type === 'mcq') {
    const counts = Array(q.options.length).fill(0);
    for (const ans of room.answers.values()) {
      const idx = Number(ans.value);
      if (Number.isInteger(idx) && idx >=0 && idx < counts.length) counts[idx]++;
    }
    return { type: 'mcq', counts };
  } else {
    const total = Array.from(room.answers.values()).length;
    const correct = Array.from(room.answers.values()).filter(a => a.correct).length;
    return { type: 'text', total, correct };
  }
}

function hostAnswerList(room, q) {
  // return answers as list with name + value + correctness
  const list = [];
  for (const [pid, ans] of room.answers.entries()) {
    const player = room.players.get(pid);
    if (!player) continue;
    list.push({ name: player.name, value: ans.value, correct: ans.correct });
  }
  return list.sort((a,b) => (a.name.localeCompare(b.name)));
}

server.listen(PORT, () => {
  console.log(`Quiz Night server running on http://localhost:${PORT}`);
});
