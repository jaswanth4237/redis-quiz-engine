const { redis } = require('../redis');

// GET /api/admin/sessions/user/:userId
exports.getUserSessions = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const setKey = `user_sessions:${userId}`;
        const sessionIds = await redis.smembers(setKey);

        const activeSessions = [];

        for (const sessionId of sessionIds) {
            const sessionKey = `session:${sessionId}`;
            const sessionData = await redis.hgetall(sessionKey);

            // Check if session exists (hgetall returns empty object when key does not exist)
            if (Object.keys(sessionData).length === 0) {
                // Cleanup expired sessions from the user set
                await redis.srem(setKey, sessionId);
            } else {
                activeSessions.push({
                    sessionId,
                    ipAddress: sessionData.ipAddress || '',
                    lastActive: sessionData.lastActive || '',
                    deviceType: sessionData.deviceType || ''
                });
            }
        }

        return res.status(200).json(activeSessions);
    } catch (error) {
        console.error('Error getting user sessions:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// DELETE /api/admin/sessions/:sessionId
exports.deleteSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        const sessionKey = `session:${sessionId}`;
        const userId = await redis.hget(sessionKey, 'userId');

        if (userId) {
            const setKey = `user_sessions:${userId}`;
            // Remove from set and delete the session key
            await Promise.all([
                redis.srem(setKey, sessionId),
                redis.del(sessionKey)
            ]);
        } else {
            // In case session was already expired or partially deleted, make sure to delete key
            await redis.del(sessionKey);
        }

        return res.status(204).send();
    } catch (error) {
        console.error('Error deleting session:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// POST /api/admin/seed
exports.seedDb = async (req, res) => {
    try {
        // 1. Reset Leaderboard
        await redis.del('leaderboard:global');

        // 2. Add 30 mock players
        const pipeline = redis.pipeline();
        const names = [
            'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett',
            'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango',
            'Uniform', 'Victor', 'Whiskey', 'X-Ray', 'Yankee', 'Zulu', 'Apex', 'Vortex', 'Apex_Predator', 'Ghost'
        ];

        for (let i = 0; i < 30; i++) {
            const playerId = `player-${names[i].toLowerCase()}`;
            const score = Math.floor(Math.random() * 500) + 50;
            pipeline.zadd('leaderboard:global', score, playerId);
        }

        // 3. Seed active game round (1 hour expiry)
        const activeRoundKey = 'game_round:g-501:r-3';
        await redis.del(activeRoundKey);
        await redis.del('submissions:g-501:r-3');
        pipeline.hset(activeRoundKey, {
            endTime: Date.now() + 3600000, // 1 hour in future
            correctAnswer: 'redis',
            points: '15'
        });

        // 4. Seed expired game round (expired 1 min ago)
        const expiredRoundKey = 'game_round:g-501:r-expired';
        await redis.del(expiredRoundKey);
        await redis.del('submissions:g-501:r-expired');
        pipeline.hset(expiredRoundKey, {
            endTime: Date.now() - 60000, // 1 minute in past
            correctAnswer: 'sql',
            points: '15'
        });

        await pipeline.exec();

        return res.status(200).json({ message: 'Database seeded successfully with 30 players and 2 test rounds.' });
    } catch (error) {
        console.error('Error seeding database:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
