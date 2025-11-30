const WebSocket = require('ws');
const { randomUUID } = require('crypto');

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

/* ==========================================================================
   CONFIG
   ========================================================================== */
const LATENCY_MS = 200;
const TICK_RATE = 20;   
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 800;

// Physics Constants
const MAX_BOOST = 100;
const BOOST_DRAIN = 3.0;
const BOOST_REFILL = 50;
const BOOST_REGEN = 0.15;
const STUN_DURATION = 5000;
const MEGA_COIN_DURATION = 8000; 
const MEGA_MIN_INTERVAL = 10000; 
const MEGA_MAX_INTERVAL = 30000; 
const PLAYER_SIZE = 24;
const COIN_SIZE = 12;
const MEGAC_SIZE = 35; 

// Victory Conditions
const SCORE_THRESHOLD = 50;      // First to 50 points wins
const TIME_LIMIT = 5 * 60 * 1000; // 5 minutes in milliseconds

// Ramming cooldown system
const RAM_COOLDOWN = 2000; // 2 seconds cooldown after ramming

let gameStartTime = null;
let gameWinner = null;
let gameEndTime = null;
let isStartingNewGame = false;

/* ==========================================================================
   CHARACTER DEFINITIONS
   ========================================================================== */
const CHARACTERS = {
  SPEEDSTER: {
    name: "SPEEDSTER",
    baseSpeed: 6,
    boostSpeed: 14,
    boostDrain: 2.25,
    stunDuration: 4000,
    playerSize: 20
  },
  TANK: {
    name: "BULLDOZER",
    baseSpeed: 4,
    boostSpeed: 10,
    boostDrain: 3.0,
    stunDuration: 5000,
    playerSize: 28,
    canRamWithoutBoost: true,
    mineDamage: 0
  },
  GHOST: {
    name: "PHANTOM",
    baseSpeed: 5,
    boostSpeed: 12,
    boostDrain: 3.0,
    stunDuration: 5000,
    playerSize: 22,
  },
  COLLECTOR: {
    name: "HOARDER",
    baseSpeed: 5,
    boostSpeed: 12,
    boostDrain: 3.0,
    stunDuration: 5000,
    playerSize: 24,
    doubleCoinChance: 0.2
  },
  JUGGERNAUT: {
    name: "TITAN",
    baseSpeed: 4.5,
    boostSpeed: 15,
    boostDrain: 4.0,
    stunDuration: 5000,
    playerSize: 26,
  },
  TRICKSTER: {
    name: "DECEIVER",
    baseSpeed: 5.5,
    boostSpeed: 11,
    boostDrain: 3.0,
    stunDuration: 5000,
    playerSize: 22,
  }
};

/* ==========================================================================
   STATE
   ========================================================================== */
let players = {}; 
let coins = [];
let megaCoin = null; 
let nextMegaSpawnTime = 0; 
let serverTick = 0;
let gameActive = false;
let countdownTimer = null;

// Spawn initial items
for (let i = 0; i < 5; i++) spawnCoin();
scheduleNextMega(); 

/* ==========================================================================
   HELPER FUNCTIONS
   ========================================================================== */
function getSpawnLocation() {
  const padding = 60;
  const existingPlayers = Object.values(players);

  // 1. If no players exist, pick a purely random spot
  if (existingPlayers.length === 0) {
    return {
      x: padding + Math.random() * (MAP_WIDTH - padding * 2),
      y: padding + Math.random() * (MAP_HEIGHT - padding * 2)
    };
  }

  // 2. If players exist, try 10 random spots and pick the best one
  let bestLocation = null;
  let maxMinDistance = -1;

  // "Candidate Sampling" Algorithm
  for (let i = 0; i < 15; i++) {
    // Generate a random candidate
    const candidate = {
      x: padding + Math.random() * (MAP_WIDTH - padding * 2),
      y: padding + Math.random() * (MAP_HEIGHT - padding * 2)
    };

    // Find the distance to the NEAREST player for this candidate
    let minDistanceToAnyPlayer = Infinity;
    
    for (const p of existingPlayers) {
      const dist = Math.hypot(p.x - candidate.x, p.y - candidate.y);
      if (dist < minDistanceToAnyPlayer) {
        minDistanceToAnyPlayer = dist;
      }
    }

    // If this candidate's "safety buffer" is larger than what we found before, keep it
    if (minDistanceToAnyPlayer > maxMinDistance) {
      maxMinDistance = minDistanceToAnyPlayer;
      bestLocation = candidate;
    }
  }

  return bestLocation;
}

function scheduleNextMega() {
  const delay = MEGA_MIN_INTERVAL + Math.random() * (MEGA_MAX_INTERVAL - MEGA_MIN_INTERVAL);
  nextMegaSpawnTime = Date.now() + delay;
}

function sendDelayed(ws, data) {
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, LATENCY_MS); 
}

function broadcastDelayed(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

function spawnCoin() {
  const currentNitros = coins.filter(c => c.type === 'boost').length;
  const currentBombs = coins.filter(c => c.type === 'bomb').length;
  let type = 'score';
  const rand = Math.random();

  if (currentNitros === 0 && rand < 0.10) type = 'boost';
  else if (currentBombs === 0 && rand > 0.10 && rand < 0.25) type = 'bomb';

  coins.push({
    id: randomUUID(),
    type: type,
    x: Math.random() * (MAP_WIDTH - COIN_SIZE),
    y: Math.random() * (MAP_HEIGHT - COIN_SIZE)
  });
}

function spawnMegaCoin() {
    megaCoin = {
        x: Math.random() * (MAP_WIDTH - MEGAC_SIZE),
        y: Math.random() * (MAP_HEIGHT - MEGAC_SIZE),
        expiresAt: Date.now() + MEGA_COIN_DURATION
    };
    broadcastDelayed({ type: 'event', text: `WARNING: MEGA COIN DETECTED!` });
}

function applyStun(victim, attacker) {
  const character = CHARACTERS[victim.character] || CHARACTERS.SPEEDSTER;
  victim.stunned = true;
  victim.stunEndTime = Date.now() + (character.stunDuration || STUN_DURATION);
  victim.isBoosting = false;
  
  // POINT REDUCTION: Victim loses exactly 1 point when rammed
  if (victim.score > 0) {
    victim.score = Math.max(0, victim.score - 1); // Lose exactly 1 point
  }
  
  victim.stunCount = (victim.stunCount || 0) + 1;
}

function checkVictoryConditions() {
  if (!gameActive || gameWinner || isStartingNewGame) return;
  
  const now = Date.now();
  const playersArray = Object.values(players);
  
  // 1. Check score threshold victory
  const thresholdWinner = playersArray.find(p => p.score >= SCORE_THRESHOLD);
  if (thresholdWinner) {
    endGame(thresholdWinner, `DOMINATION: ${thresholdWinner.name} reached ${SCORE_THRESHOLD} points!`);
    return;
  }
  
  // 2. Check time limit victory
  if (gameStartTime && now - gameStartTime >= TIME_LIMIT) {
    const sortedPlayers = playersArray.sort((a, b) => b.score - a.score);
    
    if (sortedPlayers.length >= 2 && sortedPlayers[0].score === sortedPlayers[1].score) {
      // Tie - no winner
      endGame(null, `TIME'S UP: Draw game! Both players have ${sortedPlayers[0].score} points.`);
    } else if (sortedPlayers.length > 0) {
      // Clear winner
      endGame(sortedPlayers[0], `TIME'S UP: ${sortedPlayers[0].name} wins with ${sortedPlayers[0].score} points!`);
    } else {
      endGame(null, "TIME'S UP: No winner!");
    }
    return;
  }
}

function endGame(winner, message) {
  gameActive = false;
  gameWinner = winner;
  gameEndTime = Date.now();
  
  broadcastDelayed({
    type: 'gameOver',
    winner: winner ? {
      id: winner.id,
      name: winner.name,
      color: winner.color,
      score: winner.score
    } : null,
    message: message,
    finalScores: Object.values(players).map(p => ({
      name: p.name,
      score: p.score,
      color: p.color,
      character: p.character
    })),
    gameDuration: Date.now() - gameStartTime
  });
  
  // Reset game after 8 seconds
  setTimeout(() => {
    resetGame();
  }, 8000);
}

function resetGame() {
  isStartingNewGame = true;
  
  // Reset players
  Object.values(players).forEach(p => {
    p.score = 0;
    p.boostValue = 100;
    p.stunned = false;
    p.stunCount = 0;
    p.ramCooldownEndTime = 0;
    const spawn = getSpawnLocation();
    p.x = spawn.x;
    p.y = spawn.y;
  });
  
  // Reset items
  coins = [];
  for (let i = 0; i < 5; i++) spawnCoin();
  megaCoin = null;
  scheduleNextMega();
  
  gameWinner = null;
  gameStartTime = null;
  gameEndTime = null;
  
  // Update: Broadcast status false so clients stop their 5:00 timer
  broadcastDelayed({ type: 'status', active: false });

  if (Object.keys(players).length >= 2) {
    startGameCountdown();
  } else {
    isStartingNewGame = false;
    broadcastDelayed({ type: 'event', text: 'WAITING FOR PLAYERS...' });
  }
}

function startGameCountdown() {
  // We use 8 seconds to match your HTML
  let countdown = 8; 
  
  // 1. Tell clients to show the Overlay with the countdown
  broadcastDelayed({ type: 'matchCountdown', count: countdown });
  
  countdownTimer = setInterval(() => {
    countdown--;
    
    if (countdown > 0) {
      // Optional: Send sync updates, but client handle logic is usually enough
    } else {
      clearInterval(countdownTimer);
      startNewGame();
    }
  }, 1000);
}

function startNewGame() {
  gameStartTime = Date.now();
  gameActive = true;
  isStartingNewGame = false;
  
  broadcastDelayed({ type: 'status', active: true });
  broadcastDelayed({ type: 'event', text: '>>> MATCH STARTED! <<<' });
  broadcastDelayed({ type: 'event', text: `First to ${SCORE_THRESHOLD} points or highest score in 5 minutes wins!` });
}

function checkGameStart() {
  if (Object.keys(players).length >= 2 && !gameActive && !isStartingNewGame) {
    startGameCountdown();
  }
}

/* ==========================================================================
   CONNECTION HANDLER
   ========================================================================== */
wss.on('connection', (ws) => {
  const wsId = randomUUID();
  let playerId = null;
  console.log(`[NET] New connection: ${wsId}`);

  ws.on('message', (messageStr) => {
    try {
      const msg = JSON.parse(messageStr);

      if (msg.type === 'join') {
        playerId = randomUUID();
        const spawnPoint = getSpawnLocation();
        const characterType = msg.character || 'SPEEDSTER';
        const character = CHARACTERS[characterType] || CHARACTERS.SPEEDSTER;
        
        players[playerId] = {
          id: playerId,
          name: msg.name || 'Racer',
          color: msg.color || '#00f3ff',
          character: characterType,
          x: spawnPoint.x, 
          y: spawnPoint.y,
          score: 0, 
          boostValue: 100, 
          inputs: [], 
          lastProcessedInput: 0,
          isBoosting: false, 
          stunned: false, 
          stunEndTime: 0,
          stunCount: 0,
          // Ramming cooldown tracking
          ramCooldownEndTime: 0,
          baseSpeed: character.baseSpeed,
          boostSpeed: character.boostSpeed,
          boostDrain: character.boostDrain,
          playerSize: character.playerSize || PLAYER_SIZE,
          canRamWithoutBoost: character.canRamWithoutBoost || false,
          mineDamage: character.mineDamage !== undefined ? character.mineDamage : 1,
        };

        // Send INIT immediately so client knows they are in
        sendDelayed(ws, { type: 'init', selfId: playerId, spawn: spawnPoint });
        broadcastDelayed({ type: 'event', text: `SYSTEM: ${players[playerId].name} (${character.name}) connected.` });

        // Check if we should start a game
        checkGameStart();
        
        // Send current status
        if (gameActive) {
          sendDelayed(ws, { type: 'status', active: true });
        } else {
          sendDelayed(ws, { type: 'status', active: false });
        }
      }
      else if (msg.type === 'input' && playerId && players[playerId]) {
        players[playerId].inputs.push(msg.payload);
      }
      else if (msg.type === 'ping') {
        sendDelayed(ws, { type: 'pong', clientTime: msg.clientTime });
      }
      else if (msg.type === 'chat' && playerId && players[playerId]) {
        const safeText = String(msg.text).substring(0, 50); 
        if (safeText.trim().length > 0) {
          broadcastDelayed({ 
            type: 'chat', 
            name: players[playerId].name, 
            color: players[playerId].color, 
            text: safeText 
          });
        }
      }
    } catch (e) { console.error(e); }
  });

  ws.on('close', () => {
    if (playerId && players[playerId]) {
      broadcastDelayed({ type: 'event', text: `SYSTEM: ${players[playerId].name} disconnected.` });
      delete players[playerId];
      
      if (Object.keys(players).length === 0) {
        // No players left
        gameActive = false;
        gameStartTime = null;
        isStartingNewGame = false;
        if (countdownTimer) clearInterval(countdownTimer);
        coins = [];
        megaCoin = null;
        for (let i = 0; i < 5; i++) spawnCoin();
      } else if (Object.keys(players).length < 2) {
        // Not enough players, stop the game
        gameActive = false;
        gameStartTime = null;
        isStartingNewGame = false;
        if (countdownTimer) clearInterval(countdownTimer);
        broadcastDelayed({ type: 'status', active: false });
        broadcastDelayed({ type: 'event', text: 'WAITING FOR PLAYERS...' });
      }
    }
  });
});

/* ==========================================================================
   GAME LOOP
   ========================================================================== */
setInterval(() => {
  serverTick++;
  const now = Date.now();
  const playerIds = Object.keys(players);

  // Check victory conditions first
  checkVictoryConditions();

  // 1. MEGA COIN
  if (gameActive && !gameWinner && !isStartingNewGame) {
      if (megaCoin) {
          if (now > megaCoin.expiresAt) {
              megaCoin = null;
              scheduleNextMega();
          }
      } else {
          if (now > nextMegaSpawnTime) {
              spawnMegaCoin();
          }
      }
  }

  // 2. INPUTS & PHYSICS
  for (const id of playerIds) {
    const p = players[id];
    
    // Update stunned state
    if (p.stunned && now > p.stunEndTime) {
      p.stunned = false;
    }
    
    // Update ram cooldown
    if (p.ramCooldownEndTime > 0 && now > p.ramCooldownEndTime) {
      p.ramCooldownEndTime = 0;
    }

    while (p.inputs.length > 0) {
      const input = p.inputs.shift();
      if (!gameActive || p.stunned || gameWinner || isStartingNewGame) { 
        p.lastProcessedInput = input.seq; 
        continue; 
      }

      const hasFuel = p.boostValue > 1.0;
      if (input.dash && hasFuel) {
        p.isBoosting = true;
        p.boostValue = Math.max(0, p.boostValue - p.boostDrain);
      } else {
        p.isBoosting = false;
        if (p.boostValue < MAX_BOOST) p.boostValue = Math.min(MAX_BOOST, p.boostValue + BOOST_REGEN);
      }

      const currentSpeed = p.isBoosting ? p.boostSpeed : p.baseSpeed;
      const mag = Math.hypot(input.x, input.y) || 1;
      
      let mx = 0, my = 0;
      if (mag > 0) {
        mx = (input.x / mag) * currentSpeed;
        my = (input.y / mag) * currentSpeed;
      }

      p.x = Math.max(0, Math.min(MAP_WIDTH - p.playerSize, p.x + mx));
      p.y = Math.max(0, Math.min(MAP_HEIGHT - p.playerSize, p.y + my));
      p.lastProcessedInput = input.seq;
    }
  }

  // 3. COLLISIONS (RAMMING) - Only if game is active and no winner yet
  if (gameActive && !gameWinner && !isStartingNewGame) {
    for (let i = 0; i < playerIds.length; i++) {
      for (let j = i + 1; j < playerIds.length; j++) {
        const p1 = players[playerIds[i]];
        const p2 = players[playerIds[j]];

        if (p1.x < p2.x + p2.playerSize && p1.x + p1.playerSize > p2.x &&
            p1.y < p2.y + p2.playerSize && p1.y + p1.playerSize > p2.y) {
          
          const p1CanRam = (p1.isBoosting || p1.canRamWithoutBoost) && !p1.stunned && p1.ramCooldownEndTime === 0;
          const p2CanRam = (p2.isBoosting || p2.canRamWithoutBoost) && !p2.stunned && p2.ramCooldownEndTime === 0;

          // Only allow ramming if the target is NOT already stunned
          const p1CanBeRammed = !p1.stunned;
          const p2CanBeRammed = !p2.stunned;

          if (p1CanRam && p2CanBeRammed && !p2CanRam) {
            applyStun(p2, p1);
            p1.ramCooldownEndTime = now + RAM_COOLDOWN;
            broadcastDelayed({ 
              type: 'event', 
              text: `CRITICAL: ${p1.name} RAMMED ${p2.name}! ${p2.name} lost 1 point!` 
            });
          }
          else if (p2CanRam && p1CanBeRammed && !p1CanRam) {
            applyStun(p1, p2);
            p2.ramCooldownEndTime = now + RAM_COOLDOWN;
            broadcastDelayed({ 
              type: 'event', 
              text: `CRITICAL: ${p2.name} RAMMED ${p1.name}! ${p1.name} lost 1 point!` 
            });
          }
          else if (p1CanRam && p2CanRam && p1CanBeRammed && p2CanBeRammed) {
            applyStun(p1, p2);
            applyStun(p2, p1);
            p1.ramCooldownEndTime = now + RAM_COOLDOWN;
            p2.ramCooldownEndTime = now + RAM_COOLDOWN;
            broadcastDelayed({ 
              type: 'event', 
              text: `HEAD-ON COLLISION! Both players lost 1 point!` 
            });
          }
        }
      }
    }
  }

  // 4. ITEMS - Only if game is active and no winner yet
  if (gameActive && !gameWinner && !isStartingNewGame) {
    for (const id of playerIds) {
      const p = players[id];
      // Coins
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        if (p.x < c.x + COIN_SIZE && p.x + p.playerSize > c.x &&
            p.y < c.y + COIN_SIZE && p.y + p.playerSize > c.y) {
          
          if (c.type === 'score') {
            const points = (p.character === 'COLLECTOR' && Math.random() < 0.2) ? 2 : 1;
            p.score += points;
          }
          else if (c.type === 'boost') {
              p.boostValue = Math.min(MAX_BOOST, p.boostValue + BOOST_REFILL);
              broadcastDelayed({ type: 'event', text: `NITRO: ${p.name} refueled!` });
          }
          else if (c.type === 'bomb' && p.score > 0) {
              p.score = Math.max(0, p.score - p.mineDamage);
              broadcastDelayed({ type: 'event', text: `DAMAGE: ${p.name} hit a MINE!` });
          }
          coins.splice(i, 1);
          spawnCoin();
        }
      }
      // Mega Coin
      if (megaCoin) {
          if (p.x < megaCoin.x + MEGAC_SIZE && p.x + p.playerSize > megaCoin.x &&
              p.y < megaCoin.y + MEGAC_SIZE && p.y + p.playerSize > megaCoin.y) {
              p.score += 3;
              megaCoin = null;
              scheduleNextMega(); 
              broadcastDelayed({ type: 'event', text: `EPIC: ${p.name} claimed the MEGA COIN!` });
          }
      }
    }
  }

  // 5. SEND STATE
  const publicPlayers = {};
  for (const id in players) {
    const p = players[id];
    publicPlayers[id] = {
      id: p.id,
      x: p.x, y: p.y,
      score: p.score,
      color: p.color,
      name: p.name,
      character: p.character,
      isBoosting: p.isBoosting,
      boostValue: p.boostValue,
      stunned: p.stunned,
      lastProcessedInput: p.lastProcessedInput
    };
  }

  broadcastDelayed({
    type: 'state',
    tick: serverTick,
    serverTime: Date.now(),
    players: publicPlayers,
    coins,
    megaCoin, 
    gameActive: gameActive && !gameWinner && !isStartingNewGame // Send false if game ended or starting
  });
}, 1000 / TICK_RATE);

console.log(`Server running on ws://localhost:${PORT}`);