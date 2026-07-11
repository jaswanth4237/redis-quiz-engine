# Redis Real-Time Quiz Game Engine

A high-performance, concurrent backend for competitive real-time quiz game applications. Designed to handle intense player volume, this project utilizes **Redis in-memory structures** (Hashes and Sorted Sets) paired with custom **server-side Lua scripting** to prevent race conditions and eliminate database roundtrip latencies. Live event streaming is managed via a lightweight **Server-Sent Events (SSE)** system hooked directly to a **Redis Pub/Sub broker**.

The project also serves an interactive, dark-theme control dashboard enabling admins to inspect user sessions, process scores, test Lua scripts, and monitor system events in real-time.

---

## 🛠️ Tech Stack & Architecture

* **Runtime & Framework:** Node.js, Express
* **Database & Messaging Broker:** Redis 7 (alpine)
* **Redis Client Library:** `ioredis` (handles custom Lua commands compiled on startup)
* **Real-time Pipeline:** Redis Pub/Sub multiplexed to Server-Sent Events (SSE) stream
* **Deployment:** Docker & Docker Compose
* **Client Interface:** Vanilla HTML5, CSS Variables, SSE EventSource listener

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed locally. If you wish to run the database container, make sure [Docker Desktop](https://www.docker.com/products/docker-desktop/) is running.

### Configuration
Create a `.env` file in the root directory (based on `.env.example`):
```bash
REDIS_URL=redis://localhost:6379   # Use redis://redis:6379 inside docker Compose
API_PORT=3000
```

---

## 🏃 Running and Testing the Application

### Option A: Run Local Integration Tests (Instant Verification)
Run the built-in mock integration suite. This mocks the Redis layer in-memory to test the Express handlers, status codes, and Lua scripts under double submission or window-expired conditions:
```bash
node verify-endpoints.js
```

### Option B: Deploy via Docker Compose
Build and run the unified containers (database and backend) in a single command:
```bash
docker-compose up --build
```
The services will configure healthchecks and report a `healthy` state within key seconds. 

### Option C: Try the Dashboards
Once Option B is running, visit:
```http
http://localhost:3000/
```
From here you can:
1. Click **⚡ Seed Test Data** to load 30 mock player scores.
2. Log in users and review session details.
3. Test double submissions (Lua constraints) or expire round timers to trigger failure loops.
4. Watch live leaderboard adjustments and SSE broker logs scroll automatically.

---

## 📡 API Contract Specification

### 1. Session Management
* **POST `/api/sessions`**
  - *Description:* Validates user credentials, invalidates old sessions atomically using Lua scripts, creates a session hash, and registers the session token in the user set.
  - *Response (201 Created):*
    ```json
    { "sessionId": "a5b8f2c3..." }
    ```

* **GET `/api/admin/sessions/user/:userId`**
  - *Description:* Retrieves active session hashes for a user, while automatically clearing expired entries.
  - *Response (200 OK):*
    ```json
    [
      { "sessionId": "...", "ipAddress": "19.8.9.22", "lastActive": "iso-time", "deviceType": "desktop" }
    ]
    ```

* **DELETE `/api/admin/sessions/:sessionId`**
  - *Description:* Terminated sessions are deleted from the database and removed from the active user's tracking set.
  - *Response:* `204 No Content`

---

### 2. Leaderboard Operations
* **POST `/api/leaderboard/scores`**
  - *Description:* Increments a player's points in the global scoreboard via atomic `ZINCRBY` and broadcasts changes.
  - *Response (200 OK):*
    ```json
    { "playerId": "player-alpha", "newScore": 125 }
    ```

* **GET `/api/leaderboard/top/:count`**
  - *Description:* Retrieves the top players, sorted descending by score.
  - *Response (200 OK):*
    ```json
    [
      { "rank": 1, "playerId": "player-alpha", "score": 250 },
      { "rank": 2, "playerId": "player-bravo", "score": 210 }
    ]
    ```

* **GET `/api/leaderboard/player/:playerId`**
  - *Description:* Retrieves a detailed profile for a player. It computes their standing percentile and lists the players ranked directly above and below them.
  - *Response (200 OK):*
    ```json
    {
      "playerId": "player-gamma",
      "score": 140,
      "rank": 15,
      "percentile": 92.5,
      "nearbyPlayers": {
        "above": [{ "rank": 14, "playerId": "player-delta", "score": 145 }],
        "below": [{ "rank": 16, "playerId": "player-epsilon", "score": 135 }]
      }
    }
    ```

---

### 3. Quiz & Game Play
* **POST `/api/game/submit`**
  - *Description:* Evaluates user answers atomically using a Lua script. It checks if the round is expired and verifies that the player hasn't already submitted an answer.
  - *Response (200 OK - Success):*
    ```json
    { "status": "SUCCESS", "newScore": 150 }
    ```
  - *Response (400 Bad Request - Duplicate):*
    ```json
    { "status": "ERROR", "code": "DUPLICATE_SUBMISSION" }
    ```
  - *Response (403 Forbidden - Window Closed):*
    ```json
    { "status": "ERROR", "code": "ROUND_EXPIRED" }
    ```

---

### 4. Real-time Streams
* **GET `/api/events`**
  - *Description:* Establishes a Server-Sent Events (SSE) connection that streams score changes in real-time.
  - *Format:*
    ```http
    event: leaderboard_updated
    data: {"playerId":"player-alpha","newScore":150}
    ```

---

## 📈 Memory Performance Benchmarks (`MEMORY_ANALYSIS.md`)
Review the root [MEMORY_ANALYSIS.md](./MEMORY_ANALYSIS.md) for details on Redis memory optimization:
1. **Hash vs String Storage:** Storing user session data as a Hash (`~184 bytes`) rather than serialized JSON string saves significant memory.
2. **Listpack/Ziplist vs Skiplist Encodings:** Explains the CPU/RAM tradeoffs when config threshold boundaries are exceeded.
