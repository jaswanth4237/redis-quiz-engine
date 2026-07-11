const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { subscriber } = require('./redis');

// Load controllers
const sessionController = require('./controllers/sessionController');
const leaderboardController = require('./controllers/leaderboardController');
const gameController = require('./controllers/gameController');
const adminController = require('./controllers/adminController');

dotenv.config();

const app = express();
const port = process.env.API_PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '../public')));

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Session Management Endpoints
app.post('/api/sessions', sessionController.createSession);

// Leaderboard Endpoints
app.post('/api/leaderboard/scores', leaderboardController.submitScore);
app.get('/api/leaderboard/top/:count', leaderboardController.getTopPlayers);
app.get('/api/leaderboard/player/:playerId', leaderboardController.getPlayerRank);

// Game Round Submission Endpoint
app.post('/api/game/submit', gameController.submitAnswer);

// Admin Session Endpoints
app.get('/api/admin/sessions/user/:userId', adminController.getUserSessions);
app.delete('/api/admin/sessions/:sessionId', adminController.deleteSession);
app.post('/api/admin/seed', adminController.seedDb);


// SSE Event Stream Endpoint
const sseClients = new Set();

app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);

    // Keep connection alive with periodic ping comment
    const pingInterval = setInterval(() => {
        res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
        clearInterval(pingInterval);
        sseClients.delete(res);
        res.end();
    });
});

// Subscribe to game channels to broadcast events
subscriber.subscribe('game-events', (err) => {
    if (err) {
        console.error('Failed to subscribe to game-events:', err);
    } else {
        console.log('Subscribed to game-events pub/sub channel successfully');
    }
});

subscriber.on('message', (channel, message) => {
    if (channel === 'game-events') {
        try {
            const parsed = JSON.parse(message);
            const { event, data } = parsed;
            const formattedMessage = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

            sseClients.forEach((client) => {
                client.write(formattedMessage);
            });
        } catch (error) {
            console.error('Error processing event message:', error);
        }
    }
});

// Start Server
app.listen(port, '0.0.0.0', () => {
    console.log(`Quiz Engine API Server running on port ${port}`);
});
