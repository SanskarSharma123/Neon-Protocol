# 🚀 NEON PROTOCOL

**Neon Protocol** is a high-octane, multiplayer top-down arcade game built with **Node.js** and **WebSockets**. Set in a cyberpunk universe, players pilot unique hover-vehicles, competing to collect resources while ramming opponents into submission.

![Status](https://img.shields.io/badge/Status-Active-brightgreen)
![Tech](https://img.shields.io/badge/Tech-NodeJS_|_WebSockets_|_HTML5_Canvas-blue)
![Latency](https://img.shields.io/badge/Simulated_Latency-200ms-red)

---

## 📂 Project Structure

The project is organized into a clean, modular structure:
```text
/neon-protocol
│
├── index.html           # Main entry point (UI & Game Container)
├── server.js            # Node.js Backend (Physics, Logic, Networking)
├── README.md            # Documentation
│
├── css/
│   └── style.css        # Styling (CRT effects, Neon glow, UI layout)
│
├── js/
│   └── game.js          # Client-side logic (Rendering, Audio, Input)
│
└── music/               # Audio Assets
    ├── synthwave_bg.mp3 # Background Loop
    ├── nitro.mp3        # Pickup SFX
    ├── boost.mp3        # Engine Loop
    ├── coin.mp3         # Score SFX
    ├── crash.mp3        # Impact SFX
    └── explosion.mp3    # Damage SFX
```

---

## 🎮 How to Run

### Prerequisites

**Node.js**: Ensure you have Node.js installed on your computer. [Download here](https://nodejs.org/).

### Installation

1. Open your terminal/command prompt in the project folder.

2. Initialize the project (if you haven't already):
```bash
npm init -y
```

3. Install the WebSocket library:
```bash
npm install ws
```

### Starting the Server

Run the server:
```bash
node server.js
```

You should see: `Server running on ws://localhost:8080`

### Playing the Game

1. Open `index.html` in your web browser (Chrome/Firefox recommended).
2. Enter a **Callsign** (Name).
3. Select a **Color** and **Class**.
4. Click **INITIALIZE**.

**Tip:** To test multiplayer locally, open `index.html` in a second browser tab or window.

---

## ⚙️ Game Mechanics

### 1. Classes & Stats

There are 6 unique classes, each with different hitboxes and physics properties:

- 🚀 **SPEEDSTER**: Balanced speed and boost.
- 🛡️ **TANK (Bulldozer)**: Slow but can ram enemies without using boost. Large hitbox.
- 👻 **GHOST (Phantom)**: Tiny hitbox, high evasion, fast.
- 💰 **COLLECTOR (Hoarder)**: Has a chance to gain double points from coins.
- ⚡ **JUGGERNAUT (Titan)**: Massive boost power, consumes fuel quickly.
- 🎭 **TRICKSTER (Deceiver)**: Agile and tricky movement.

### 2. Scoring & Items

- 🟡 **Gold Coin**: +1 Score (+2 for Collector/Hoarder chance).
- 🔵 **Nitro Orb**: Refills your Boost Meter (Fuel).
- 🔴 **Mine (Bomb)**: Damages your hull (-1 Score).
- 🟣 **MEGA COIN**: A rare event item that spawns periodically. Worth +3 Score.

### 3. The Ramming System

Combat is physics-based.

- **How to Ram**: You must be Boosting (holding Space) to ram an enemy. *(Exception: The TANK class can ram without boosting)*.
- **The Result**: If you hit an enemy while attacking, they become **STUNNED** for 5 seconds.
  - Stunned players cannot move or collect items.
  - Stunned players appear grayish with an 'X' over them.
- **Cooldown**: After a successful ram, you enter a 2-second cooldown where you cannot ram again.
- **Scoring**: Ramming yields 0 Points. It is a tactical tool to stop opponents from winning, not a scoring method.

---

## 🧠 Technical Architecture & Evaluation

This project is engineered to withstand degraded network conditions while maintaining gameplay fluidity and security.

### 1. Network Quality Simulation (200ms Latency)

To simulate real-world conditions or poor network connectivity, the server artificially introduces a delay.

- **Implementation**: All outgoing WebSocket messages are delayed by 200ms.
- **Impact**: This ensures the game is not merely functional on localhost, but resilient against lag.

### 2. Smoothness: Entity Interpolation

Since positional data arrives with a significant 200ms delay, raw rendering would cause visible stuttering (teleporting).

- **Solution**: The client implements Linear Interpolation (Lerp).
- **Mechanism**: The client buffers server snapshots. Instead of rendering the player at the latest known position, it renders the player between two past snapshots.
- **Result**: Remote players move smoothly across the screen despite the heavy latency.

### 3. Security: Server Authority

To prevent cheating, the client is "dumb" regarding game state.

- **Input Driven**: Clients send only keystrokes (Inputs), not positions.
- **Validation**: The server runs the physics simulation. It calculates where the player is based on speed, boost, and collisions.
- **Anti-Spoof**: Clients cannot self-report coin pickups. The server detects if a player's hitbox overlaps a coin and broadcasts the score update.

### 4. Spawn Logic: Best Candidate Sampling

To prevent players from spawning on top of each other:

1. The server generates 15 random candidate points on the map.
2. For each candidate, it calculates the distance to the nearest existing player.
3. It selects the candidate where the distance to the nearest player is the largest.

---

## 🛠️ Configuration

You can tweak game balance in `server.js` under the `CONFIG` section:
```javascript
// Network Simulation
const LATENCY_MS = 200;     // Critical Constraint: 200ms simulated lag

// Physics & Logic
const TICK_RATE = 20;       // Server updates per second
const MAX_BOOST = 100;      // Max fuel
const RAM_COOLDOWN = 2000;  // Time before you can ram again
```

---

## 🎯 Assessment Compliance

This project was developed as a submission for the **Krafron Associate Game Developer Test** on Multiplayer State Synchronization.

### Requirements Met

✅ **Part A - Game Requirements**
- Lobby system with multiplayer support
- Player-controlled entities with collision detection
- Resource collection system (coins/items)
- Full server authority over game state

✅ **Part B - Network Quality Simulation**
- 200ms artificial latency implemented on all server communications
- Stress-tested for network resilience

✅ **Part C - Evaluation Criteria**
- **Smoothness**: Linear interpolation ensures fluid remote player movement
- **Security**: Input-only client model with server-side validation and collision detection

### Design Decisions

- **Enhanced Gameplay**: Extended beyond basic requirements with multiple character classes, combat mechanics, and varied collectibles to demonstrate deeper understanding of multiplayer systems
- **Cyberpunk Theme**: Applied cohesive visual and audio design to showcase production quality
- **Modular Architecture**: Clean separation between client rendering, server logic, and networking layers

---

## 📝 License

This project is open source and available for educational purposes.

---

## 🙏 Acknowledgments

Thank you to the **Krafron team** for this challenging and engaging assessment. Building Neon Protocol was an incredible opportunity to demonstrate my understanding of:

- Real-time multiplayer networking architecture
- Client-server authority models and anti-cheat design
- Latency compensation and interpolation techniques
- WebSocket communication protocols
- Game state synchronization under degraded network conditions

This assessment pushed me to think critically about network resilience, server authority, and creating smooth gameplay experiences despite challenging constraints. I'm excited about the possibility of bringing this passion and technical expertise to the Krafron team.

**Thank you for your time and consideration!**

---

**"In the Neon Protocol, only the fastest survive. See you on the grid."** ⚡

---

*Developed with ❤️ and countless hours of debugging WebSocket race conditions.*