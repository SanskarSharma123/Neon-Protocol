/* --- CHARACTERS --- */
const CHARACTERS = {
  SPEEDSTER: { name: "SPEEDSTER", icon: "🚀", color: "#00f3ff", desc: "Balanced Speed & Boost", stats: { spd: 0.8, bst: 0.8 }},
  TANK:      { name: "BULLDOZER", icon: "🛡️", color: "#ff0055", desc: "Can Ram Without Boost", stats: { spd: 0.4, bst: 0.5 }},
  GHOST:     { name: "PHANTOM",   icon: "👻", color: "#aa00ff", desc: "Small & Evasive", stats: { spd: 0.7, bst: 0.6 }},
  COLLECTOR: { name: "HOARDER",   icon: "💰", color: "#ffd700", desc: "Bonus Points Chance", stats: { spd: 0.6, bst: 0.7 }},
  JUGGERNAUT:{ name: "TITAN",     icon: "⚡", color: "#00ff66", desc: "Massive Boost Power", stats: { spd: 0.5, bst: 0.9 }},
  TRICKSTER: { name: "DECEIVER",  icon: "🎭", color: "#ff9900", desc: "Agile & Tricky", stats: { spd: 0.9, bst: 0.5 }}
};

/* --- AUDIO MANAGER --- */
const AudioMgr = {
  enabled: { music: true, sfx: true },
  sounds: {},

  init: function() {
    // Prevent re-initialization if already loaded
    if (this.sounds['music']) return;

    // UPDATED PATHS: now pointing to "music/" folder
    this.sounds['music'] = new Audio('music/synthwave_bg.mp3');
    this.sounds['nitro'] = new Audio('music/nitro.mp3');
    this.sounds['boost'] = new Audio('music/boost.mp3');
    this.sounds['coin']  = new Audio('music/coin.mp3');
    this.sounds['crash'] = new Audio('music/crash.mp3');
    this.sounds['explosion'] = new Audio('music/explosion.mp3');

    // Settings
    this.sounds['music'].loop = true;
    this.sounds['music'].volume = 0.4;
    
    this.sounds['boost'].loop = true;
    this.sounds['boost'].volume = 0; // Start silent
  },

  toggleMusic: function() {
    // FIX: Initialize audio immediately if user clicks button before game starts
    if (!this.sounds['music']) this.init();

    this.enabled.music = !this.enabled.music;
    const btn = document.getElementById('btnMusic');
    
    if(this.enabled.music) {
      btn.innerText = "MUSIC: ON"; btn.classList.add('active');
      // Browser requires user interaction to play audio, clicking this button counts!
      this.sounds['music'].play().catch(e=>{ console.log("Audio autoplay blocked", e); });
    } else {
      btn.innerText = "MUSIC: OFF"; btn.classList.remove('active');
      this.sounds['music'].pause();
    }
  },

  toggleSfx: function() {
    // FIX: Initialize audio immediately here too
    if (!this.sounds['music']) this.init();

    this.enabled.sfx = !this.enabled.sfx;
    const btn = document.getElementById('btnSfx');
    if(this.enabled.sfx) {
      btn.innerText = "SFX: ON"; btn.classList.add('active');
    } else {
      btn.innerText = "SFX: OFF"; btn.classList.remove('active');
      this.sounds['boost'].volume = 0;
    }
  },

  play: function(name) {
    if(!this.enabled.sfx || !this.sounds[name]) return;
    this.sounds[name].currentTime = 0;
    this.sounds[name].play().catch(e=>{});
  },

  setBoostVolume: function(targetVol) {
    if(!this.sounds['boost']) return; // Safety check
    if(!this.enabled.sfx) { this.sounds['boost'].volume = 0; return; }
    
    // Smooth fade
    let current = this.sounds['boost'].volume;
    if(Math.abs(current - targetVol) > 0.01) {
      this.sounds['boost'].volume += (targetVol - current) * 0.2;
    }
    
    // Ensure loop is playing if volume > 0
    if(this.sounds['boost'].volume > 0.01 && this.sounds['boost'].paused) {
      this.sounds['boost'].play().catch(e=>{});
    } else if (this.sounds['boost'].volume < 0.01) {
      this.sounds['boost'].pause();
    }
  }
};

const SERVER_URL = 'ws://localhost:8080';
const CONFIG = { RENDER_BUFFER: 100, INPUT_RATE: 50, SPEED: 5, BOOST_SPEED: 12, PLAYER_SIZE: 24, COIN_SIZE: 12, MEGAC_SIZE: 35 };
const COLORS = ['#00f3ff', '#ff0055', '#ffff00', '#00ff66', '#aa00ff', '#ff9900'];

let socket, selectedColor = COLORS[0], selectedCharacter = "SPEEDSTER";
let gameState = { myId: null, active: false, tick: 0, snapshots: [], pendingInputs: [], localPlayer: { x: 0, y: 0, trail: [] }, localBoostEstimate: 100, renderDelay: 200, keys: {}, particles: [], isStunned: false, gameActive: false, stars: [] };

/* --- UI SETUP --- */
// Color Picker
const picker = document.getElementById('colorPicker');
COLORS.forEach((c, i) => {
  const div = document.createElement('div');
  div.className = `color-swatch ${i===0?'selected':''}`;
  div.style.backgroundColor = c;
  div.style.boxShadow = `0 0 10px ${c}`;
  div.onclick = () => {
    document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
    div.classList.add('selected');
    selectedColor = c;
  };
  picker.appendChild(div);
});

function showCharacterSelect() {
  const name = document.getElementById('nickname').value;
  if (!name.trim()) { alert("Please enter a callsign!"); return; }
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('characterModal').classList.remove('hidden');
  renderCharacterGrid();
}

function renderCharacterGrid() {
  const grid = document.getElementById('characterGrid');
  grid.innerHTML = '';
  Object.keys(CHARACTERS).forEach(key => {
    const char = CHARACTERS[key];
    const el = document.createElement('div');
    el.className = `character-card ${key === selectedCharacter ? 'selected' : ''}`;
    el.onclick = () => selectCharacter(key, el);
    const bar = (v) => `<div class="stat-bar"><div class="stat-fill" style="width:${v*100}%"></div></div>`;
    el.innerHTML = `
      <div class="character-icon" style="color:${char.color}">${char.icon}</div>
      <div class="character-name">${char.name}</div>
      <div style="font-size:10px; color:#888;">SPD ${bar(char.stats.spd)} BST ${bar(char.stats.bst)}</div>
    `;
    grid.appendChild(el);
  });
}

function selectCharacter(key, el) {
  selectedCharacter = key;
  document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
  if(el) el.classList.add('selected');
  const char = CHARACTERS[key];
  document.getElementById('previewName').innerText = char.name;
  document.getElementById('previewType').innerText = char.desc;
}

function startGame() {
  const btn = document.querySelector('#characterModal .main-btn');
  btn.innerText = "CONNECTING..."; btn.disabled = true;
  
  // Initialize Audio
  AudioMgr.init();
  if(AudioMgr.enabled.music) AudioMgr.sounds['music'].play().catch(e=>{});
  
  const name = document.getElementById('nickname').value || 'Pilot';
  initNetwork(name, selectedColor, selectedCharacter, btn);
}

/* --- NETWORK --- */
function initNetwork(name, color, character, btn) {
  try { socket = new WebSocket(SERVER_URL); } 
  catch(e) { alert("URL Error"); btn.disabled=false; btn.innerText="INITIALIZE"; return; }

  socket.onopen = () => {
    console.log("WS Open");
    socket.send(JSON.stringify({ type: 'join', name, color, character }));
  };

  socket.onerror = (e) => {
    alert("SERVER NOT FOUND.\n1. Open terminal.\n2. Run 'node server.js'\n3. Refresh.");
    btn.disabled=false; btn.innerText="INITIALIZE";
  };
  
  socket.onclose = () => {
    document.getElementById('waitingOverlay').innerHTML = "DISCONNECTED<br>REFRESH";
    document.getElementById('waitingOverlay').style.opacity = 1;
  };

  socket.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'init') {
      gameState.myId = msg.selfId;
      gameState.localPlayer = { ...msg.spawn, trail: [] };
      gameState.active = true;
      document.getElementById('characterModal').classList.add('hidden'); // HIDE MODAL
      
      // Init Stars
      for(let i=0; i<50; i++) gameState.stars.push({ x: Math.random()*1200, y: Math.random()*800, s: Math.random()*2 });
      
      runGameLoops();
    } 
    else if (msg.type === 'state') handleState(msg);
    else if (msg.type === 'pong') updatePing(msg.clientTime);
    else if (msg.type === 'event') logEvent(msg.text);
    else if (msg.type === 'status') {
       gameState.gameActive = msg.active;
       toggleWaitingOverlay(!msg.active);
    }
    else if (msg.type === 'chat') handleChat(msg);
  };
}

function toggleWaitingOverlay(show) {
  document.getElementById('waitingOverlay').style.opacity = show ? '1' : '0';
}

/* --- CHAT LOGIC --- */
const chatInput = document.getElementById('chatInput');
function sendText() {
  const text = chatInput.value;
  if(text) { sendChat(text); chatInput.value = ''; }
}
function sendChat(text) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'chat', text }));
  }
}
function handleChat(msg) {
  const history = document.getElementById('chatHistory');
  const div = document.createElement('div');
  div.className = 'chat-line';
  div.innerHTML = `<span class="chat-name" style="color:${msg.color}">${msg.name}:</span><span class="chat-text">${msg.text}</span>`;
  history.appendChild(div);
  history.scrollTop = history.scrollHeight;
}
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendText(); });

/* --- INPUT HANDLING --- */
window.addEventListener('keydown', e => {
  if (document.activeElement === chatInput) return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  gameState.keys[e.key] = true;
});
window.addEventListener('keyup', e => gameState.keys[e.key] = false);

function runGameLoops() {
  setInterval(() => {
    if(!gameState.active || gameState.isStunned || !gameState.gameActive) {
      AudioMgr.setBoostVolume(0); 
      return;
    }

    const dx = (gameState.keys['ArrowRight']?1:0) - (gameState.keys['ArrowLeft']?1:0);
    const dy = (gameState.keys['ArrowDown']?1:0) - (gameState.keys['ArrowUp']?1:0);
    const dash = gameState.keys[' ']; 
    
    // BOOST SOUND LOGIC
    if (dash && gameState.localBoostEstimate > 1) {
      AudioMgr.setBoostVolume(0.5);
    } else {
      AudioMgr.setBoostVolume(0);
    }

    if(dx===0 && dy===0 && !dash) return;

    gameState.tick++;
    const input = { seq: gameState.tick, x: dx, y: dy, dash };
    socket.send(JSON.stringify({ type: 'input', payload: input }));
    
    gameState.pendingInputs.push(input);
    applyPhysics(gameState.localPlayer, input);
  }, CONFIG.INPUT_RATE);

  requestAnimationFrame(render);
  
  setInterval(() => {
    if(socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));
  }, 1000);
}

function applyPhysics(entity, input) {
  const cvs = document.getElementById('gameCanvas');
  const width = cvs.width;
  const height = cvs.height;

  const mag = Math.hypot(input.x, input.y) || 1;
  let speed = CONFIG.SPEED;
  if (input.dash && gameState.localBoostEstimate > 1) {
    speed = CONFIG.BOOST_SPEED;
    gameState.localBoostEstimate = Math.max(0, gameState.localBoostEstimate - 3.0); 
  } else {
    gameState.localBoostEstimate = Math.min(100, gameState.localBoostEstimate + 0.15); 
  }
  entity.x += (input.x / mag) * speed;
  entity.y += (input.y / mag) * speed;
  entity.x = Math.max(0, Math.min(width - CONFIG.PLAYER_SIZE, entity.x));
  entity.y = Math.max(0, Math.min(height - CONFIG.PLAYER_SIZE, entity.y));
}

function handleState(msg) {
  gameState.gameActive = msg.gameActive;
  toggleWaitingOverlay(!msg.gameActive);

  gameState.snapshots.push(msg);
  if(gameState.snapshots.length > 60) gameState.snapshots.shift();
  updateUI(msg.players);
  
  if(gameState.myId && msg.players[gameState.myId]) {
    const serverP = msg.players[gameState.myId];
    
    gameState.isStunned = serverP.stunned;

    if (gameState.isStunned) {
      document.body.style.filter = "grayscale(80%) blur(3px) contrast(1.2)";
      document.getElementById('speedIndicator').innerText = "SYSTEM FAILURE";
      document.getElementById('speedIndicator').style.color = "#ff3366";
    } else {
      document.body.style.filter = "none";
    }

    gameState.localBoostEstimate = serverP.boostValue;
    gameState.pendingInputs = gameState.pendingInputs.filter(i => i.seq > serverP.lastProcessedInput);
    
    const cvs = document.getElementById('gameCanvas');
    const width = cvs.width;
    const height = cvs.height;

    const sim = { x: serverP.x, y: serverP.y };
    gameState.pendingInputs.forEach(i => {
       const mag = Math.hypot(i.x, i.y) || 1;
       const speed = (i.dash && serverP.boostValue > 1) ? CONFIG.BOOST_SPEED : CONFIG.SPEED;
       sim.x += (i.x / mag) * speed;
       sim.y += (i.y / mag) * speed;
       sim.x = Math.max(0, Math.min(width - CONFIG.PLAYER_SIZE, sim.x));
       sim.y = Math.max(0, Math.min(height - CONFIG.PLAYER_SIZE, sim.y));
    });
    
    const dist = Math.hypot(gameState.localPlayer.x - sim.x, gameState.localPlayer.y - sim.y);
    if(dist > 5) {
      gameState.localPlayer.x += (sim.x - gameState.localPlayer.x) * 0.1;
      gameState.localPlayer.y += (sim.y - gameState.localPlayer.y) * 0.1;
    }

    // --- SCORE SOUND LOGIC ---
    if (gameState.lastScore !== undefined) {
      const diff = serverP.score - gameState.lastScore;
      
      if (diff === 1) {
        triggerShake();
        spawnParticles(serverP.x, serverP.y, 'gold');
        AudioMgr.play('coin');
      }
      // MEGA COIN or Ram
      else if (diff > 1) {
        triggerShake();
        spawnParticles(serverP.x, serverP.y, 'gold');
        // 'crash' sound or epic sound
      }
      else if (diff < 0) {
        triggerShake();
        spawnParticles(serverP.x, serverP.y, 'red');
      }
    }
    gameState.lastScore = serverP.score;
  }
}

function updatePing(clientTime) {
  const rtt = Date.now() - clientTime;
  document.getElementById('rtt').innerText = rtt;
  document.getElementById('rdelay').innerText = gameState.renderDelay.toFixed(0);
  gameState.renderDelay = (rtt/2) + CONFIG.RENDER_BUFFER;
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function render() {
  requestAnimationFrame(render);
  ctx.clearRect(0,0, canvas.width, canvas.height);
  
  // 1. BACKGROUND
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  gameState.stars.forEach(s => {
    s.x -= 0.2; if(s.x < 0) s.x = canvas.width;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  });

  // 2. GRID
  ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)'; 
  ctx.lineWidth = 1; ctx.beginPath();
  for(let i=0; i<canvas.width; i+=40) { ctx.moveTo(i,0); ctx.lineTo(i,canvas.height); }
  for(let i=0; i<canvas.height; i+=40) { ctx.moveTo(0,i); ctx.lineTo(canvas.width,i); }
  ctx.stroke();

  const state = getInterpolatedState();
  if(!state) return;

  const time = Date.now();

  // 3. ITEMS
  state.coins.forEach(c => {
    if (c.type === 'boost') {
      ctx.shadowBlur = 20; ctx.shadowColor = '#00f3ff';
      ctx.fillStyle = '#00f3ff';
      ctx.beginPath();
      for(let i=0; i<6; i++) {
        const ang = (i*Math.PI/3) + (time/500);
        const rx = c.x + 6 + Math.cos(ang)*8;
        const ry = c.y + 6 + Math.sin(ang)*8;
        if(i===0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
      }
      ctx.closePath(); ctx.fill();
    } 
    else if (c.type === 'bomb') {
      const pulse = 10 + Math.sin(time/200)*5;
      ctx.shadowBlur = pulse; ctx.shadowColor = '#ff0055';
      ctx.fillStyle = '#ff0055';
      ctx.beginPath(); ctx.arc(c.x + 6, c.y + 6, 6, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x+12, c.y+12); ctx.moveTo(c.x+12, c.y); ctx.lineTo(c.x, c.y+12); ctx.stroke();
    }
    else {
      ctx.shadowBlur = 10; ctx.shadowColor = '#ffd700';
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(c.x + 6, c.y + 6, 5, 0, Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur = 0;
  });

  // 4. MEGA COIN RENDER
  if (state.megaCoin) {
      const mc = state.megaCoin;
      const remaining = Math.max(0, Math.ceil((mc.expiresAt - (time + gameState.renderDelay))/1000)); 
      
      const pulse = 20 + Math.sin(time/150)*10;
      const center = CONFIG.MEGAC_SIZE/2;
      
      ctx.shadowBlur = pulse; ctx.shadowColor = '#aa00ff';
      ctx.fillStyle = '#aa00ff';
      ctx.beginPath(); 
      ctx.arc(mc.x + center, mc.y + center, center - 2, 0, Math.PI*2); 
      ctx.fill();

      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); 
      ctx.arc(mc.x + center, mc.y + center, center - 8, 0, Math.PI*2); 
      ctx.stroke();

      ctx.fillStyle = '#fff'; ctx.shadowBlur = 0;
      ctx.font = '700 16px Rajdhani'; ctx.textAlign = 'center';
      ctx.fillText(remaining + "s", mc.x + center, mc.y + center + 6);
      
      ctx.shadowBlur = 0;
  }

  // 5. PLAYERS - UNIQUE SHAPES FOR EACH CHARACTER
  Object.values(state.players).forEach(p => {
    const isMe = p.id === gameState.myId;
    const pos = isMe ? gameState.localPlayer : p;
    
    if (!pos.trail) pos.trail = [];
    if (gameState.tick % 3 === 0 && !p.stunned && gameState.gameActive) { 
      pos.trail.push({x: pos.x, y: pos.y});
      if(pos.trail.length > 20) pos.trail.shift();
    }

    if (!p.stunned) {
      pos.trail.forEach((t, i) => {
        ctx.globalAlpha = (i / 20) * 0.5; ctx.fillStyle = p.color;
        
        // Trail matches character shape - smaller size for trail
        const charType = p.character || 'SPEEDSTER';
        drawCharacterShape(ctx, t.x + 8, t.y + 8, 8, 8, charType, p.color, false);
      });
      ctx.globalAlpha = 1.0;
    }

    if (p.stunned) {
      // Stunned state - X mark over character
      ctx.strokeStyle = '#ff0055'; ctx.lineWidth = 2;
      
      // Draw stunned character shape
      ctx.fillStyle = '#333'; 
      drawCharacterShape(ctx, pos.x, pos.y, CONFIG.PLAYER_SIZE, CONFIG.PLAYER_SIZE, p.character || 'SPEEDSTER', '#333', false);
      
      // X mark
      ctx.beginPath(); 
      ctx.moveTo(pos.x, pos.y); 
      ctx.lineTo(pos.x+24, pos.y+24); 
      ctx.moveTo(pos.x+24, pos.y); 
      ctx.lineTo(pos.x, pos.y+24); 
      ctx.stroke();
    } else {
      ctx.shadowBlur = p.isBoosting ? 30 : 10; 
      ctx.shadowColor = p.color;
      
      // Draw unique character shape
      drawCharacterShape(ctx, pos.x, pos.y, CONFIG.PLAYER_SIZE, CONFIG.PLAYER_SIZE, p.character || 'SPEEDSTER', p.color, p.isBoosting);
      
      ctx.shadowBlur = 0;
    }
    
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
    ctx.font = '600 12px Rajdhani'; ctx.textAlign = 'center';
    ctx.fillText(p.name, pos.x + CONFIG.PLAYER_SIZE/2, pos.y - 10);
  });
  updateParticles();
}

// NEW FUNCTION: Draw unique shapes for each character with proper sizing
function drawCharacterShape(ctx, x, y, width, height, characterType, color, isBoosting) {
  const centerX = x + width/2;
  const centerY = y + height/2;
  const size = Math.min(width, height);
  
  ctx.fillStyle = '#000';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  
  // Scale factors for different characters
  const scaleFactors = {
    'SPEEDSTER': 0.7,
    'TANK': 1.0,
    'GHOST': 0.6,
    'COLLECTOR': 0.8,
    'JUGGERNAUT': 0.9,
    'TRICKSTER': 0.75
  };
  
  const scale = scaleFactors[characterType] || 0.8;
  const scaledSize = size * scale;
  const offsetX = (width - scaledSize) / 2;
  const offsetY = (height - scaledSize) / 2;
  
  const drawX = x + offsetX;
  const drawY = y + offsetY;
  const drawCenterX = drawX + scaledSize/2;
  const drawCenterY = drawY + scaledSize/2;
  
  switch(characterType) {
    case 'SPEEDSTER':
      // 🚀 Rocket shape - smaller triangle
      ctx.beginPath();
      ctx.moveTo(drawCenterX, drawY);
      ctx.lineTo(drawX + scaledSize, drawY + scaledSize);
      ctx.lineTo(drawX, drawY + scaledSize);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Rocket details
      if (!isBoosting) {
        ctx.fillStyle = color;
        ctx.fillRect(drawCenterX - 2, drawY + scaledSize - 6, 4, 3);
      }
      break;
      
    case 'TANK':
      // 🛡️ Shield/Hexagon shape - normal size
      ctx.beginPath();
      for(let i = 0; i < 6; i++) {
        const angle = (i * 2 * Math.PI / 6) - Math.PI/2;
        const px = drawCenterX + Math.cos(angle) * (scaledSize/2 - 2);
        const py = drawCenterY + Math.sin(angle) * (scaledSize/2 - 2);
        if(i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Center dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(drawCenterX, drawCenterY, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'GHOST':
      // 👻 Ghost shape - very small and evasive
      ctx.beginPath();
      ctx.arc(drawCenterX, drawCenterY - 2, scaledSize/2 - 2, 0, Math.PI, true);
      
      // Wavy bottom
      const waveCount = 3;
      const waveWidth = scaledSize / waveCount;
      for(let i = 0; i < waveCount; i++) {
        ctx.quadraticCurveTo(
          drawX + i * waveWidth + waveWidth/2, drawY + scaledSize + 2,
          drawX + (i + 1) * waveWidth, drawY + scaledSize - 2
        );
      }
      ctx.fill();
      ctx.stroke();
      
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(drawCenterX - 3, drawCenterY - 2, 1.5, 0, Math.PI * 2);
      ctx.arc(drawCenterX + 3, drawCenterY - 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'COLLECTOR':
      // 💰 Diamond/coin shape - medium size
      ctx.beginPath();
      ctx.moveTo(drawCenterX, drawY);
      ctx.lineTo(drawX + scaledSize, drawCenterY);
      ctx.lineTo(drawCenterX, drawY + scaledSize);
      ctx.lineTo(drawX, drawCenterY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // $ symbol when not boosting
      if (!isBoosting) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', drawCenterX, drawCenterY);
      }
      break;
      
    case 'JUGGERNAUT':
      // ⚡ Lightning bolt/angular shape - slightly smaller
      ctx.beginPath();
      ctx.moveTo(drawCenterX - 3, drawY);
      ctx.lineTo(drawX + scaledSize - 2, drawCenterY - 3);
      ctx.lineTo(drawCenterX + 2, drawCenterY);
      ctx.lineTo(drawX + scaledSize, drawY + scaledSize);
      ctx.lineTo(drawCenterX + 3, drawCenterY + 3);
      ctx.lineTo(drawX + 2, drawCenterY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
      
    case 'TRICKSTER':
      // 🎭 Diamond with cut corners - small and tricky
      ctx.beginPath();
      ctx.moveTo(drawCenterX, drawY + 2);
      ctx.lineTo(drawX + scaledSize - 2, drawCenterY - 2);
      ctx.lineTo(drawX + scaledSize - 2, drawCenterY + 2);
      ctx.lineTo(drawCenterX, drawY + scaledSize - 2);
      ctx.lineTo(drawX + 2, drawCenterY + 2);
      ctx.lineTo(drawX + 2, drawCenterY - 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Mask-like details
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(drawCenterX - 4, drawCenterY);
      ctx.lineTo(drawCenterX + 4, drawCenterY);
      ctx.stroke();
      break;
      
    default:
      // Default: Rounded rectangle
      ctx.beginPath();
      ctx.roundRect(drawX, drawY, scaledSize, scaledSize, 4);
      ctx.fill();
      ctx.stroke();
      
      // Default center dot
      ctx.fillStyle = '#fff';
      ctx.fillRect(drawX + scaledSize/2 - 4, drawY + scaledSize/2 - 4, 8, 8);
  }
}

function getInterpolatedState() {
  const renderTime = Date.now() - gameState.renderDelay;
  const buffer = gameState.snapshots;
  while(buffer.length >= 2 && buffer[1].serverTime <= renderTime) buffer.shift();
  if(buffer.length >= 2 && buffer[0].serverTime <= renderTime && renderTime <= buffer[1].serverTime) {
    const r = (renderTime - buffer[0].serverTime) / (buffer[1].serverTime - buffer[0].serverTime);
    const players = {};
    Object.keys(buffer[1].players).forEach(id => {
      const p1 = buffer[1].players[id];
      const p0 = buffer[0].players[id] || p1;
      players[id] = { ...p1, x: p0.x + (p1.x - p0.x) * r, y: p0.y + (p1.y - p0.y) * r };
    });
    // Pass megaCoin from the latest snapshot available
    return { players, coins: buffer[1].coins, megaCoin: buffer[1].megaCoin };
  }
  return buffer[0];
}

function spawnParticles(x, y, color) {
  const c = color === 'red' ? '#ff3366' : '#ffd700';
  for(let i=0; i<15; i++) gameState.particles.push({x: x+12, y: y+12, vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10, life: 1.0, color: c});
}

function updateParticles() {
  gameState.particles.forEach((p, i) => {
    p.x += p.vx; p.y += p.vy; p.life -= 0.04;
    if(p.life <= 0) gameState.particles.splice(i, 1);
    else {
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3);
    }
  });
  ctx.globalAlpha = 1;
}

function triggerShake() {
  const c = document.getElementById('gameCanvas');
  c.classList.remove('shake');
  void c.offsetWidth;
  c.classList.add('shake');
}

function updateUI(players) {
  const sorted = Object.values(players).sort((a,b)=>b.score - a.score);
  document.getElementById('scoreboard').innerHTML = sorted.map(p => `
    <div class="player-row ${p.id===gameState.myId?'me':''}">
      <span style="color:${p.color}">${p.name}</span><span>${p.score}</span>
    </div>`).join('');

  if (gameState.myId && players[gameState.myId]) {
    const me = players[gameState.myId];
    const bar = document.getElementById('nitroBar');
    const ind = document.getElementById('speedIndicator');
    bar.style.width = me.boostValue + '%';
    
    if (me.stunned) { bar.style.background = "#555"; bar.style.boxShadow = "none"; }
    else if (me.isBoosting) {
      ind.innerHTML = "BOOSTING"; ind.style.color = "#00f3ff";
      bar.style.background = "linear-gradient(90deg, #0055ff, #00f3ff)";
      bar.style.boxShadow = "0 0 20px #fff";
    } else if (me.boostValue <= 1) {
       ind.innerHTML = "DEPLETED"; ind.style.color = "#ff3366";
    } else {
      ind.innerHTML = "ONLINE"; ind.style.color = "var(--neon-blue)";
      bar.style.boxShadow = "none";
      bar.style.background = "linear-gradient(90deg, #0055ff, #00f3ff)";
    }
  }
}

function logEvent(text) {
  const div = document.createElement('div'); div.className = 'log-msg';
  
  // --- AUDIO TRIGGERS BASED ON SERVER EVENTS ---
  if (text.includes('NITRO')) {
    div.innerHTML = `>> <span style="color:#00f3ff">${text}</span>`;
    if(gameState.localPlayer && text.includes(document.getElementById('nickname').value)) {
       AudioMgr.play('nitro'); 
    }
  }
  else if (text.includes('DAMAGE')) {
     div.innerHTML = `>> <span style="color:#ff3366">${text}</span>`;
     if(gameState.localPlayer && text.includes(document.getElementById('nickname').value)) {
       AudioMgr.play('explosion'); 
    }
  }
  else if (text.includes('EPIC')) {
     div.innerHTML = `>> <span style="color:#aa00ff; font-weight:bold">${text}</span>`;
     // Trigger regular coin sound for now, or crash sound for impact
     if(gameState.localPlayer && text.includes(document.getElementById('nickname').value)) {
       AudioMgr.play('coin'); 
    }
  }
  else if (text.includes('CRITICAL')) {
    div.innerHTML = `>> <span style="color:#ff0055; font-weight:bold; text-shadow:0 0 10px red">${text}</span>`;
    if(gameState.localPlayer && text.includes(document.getElementById('nickname').value)) {
       AudioMgr.play('crash');
    }
  }
  else div.innerHTML = `>> ${text}`;
  
  const log = document.getElementById('eventLog'); log.prepend(div);
  if(log.children.length > 7) log.lastChild.remove();
}