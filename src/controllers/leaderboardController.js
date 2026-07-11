const { redis } = require('../redis');

// POST /api/leaderboard/scores
exports.submitScore = async (req, res) => {
    try {
        const { playerId, points } = req.body;

        if (!playerId || typeof points !== 'number') {
            return res.status(400).json({ error: 'playerId and points (number) are required' });
        }

        const newScoreStr = await redis.zincrby('leaderboard:global', points, playerId);
        const newScore = parseFloat(newScoreStr) || 0;

        // Publish update event for SSE
        const message = JSON.stringify({
            event: 'leaderboard_updated',
            data: {
                playerId,
                newScore
            }
        });
        await redis.publish('game-events', message);

        return res.status(200).json({
            playerId,
            newScore
        });
    } catch (error) {
        console.error('Error submitting score:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// GET /api/leaderboard/top/:count
exports.getTopPlayers = async (req, res) => {
    try {
        const count = parseInt(req.params.count, 10);
        if (isNaN(count) || count <= 0) {
            return res.status(400).json({ error: 'Invalid count parameter' });
        }

        const raw = await redis.zrevrange('leaderboard:global', 0, count - 1, 'WITHSCORES');
        const result = [];
        for (let i = 0; i < raw.length; i += 2) {
            result.push({
                rank: (i / 2) + 1,
                playerId: raw[i],
                score: parseFloat(raw[i + 1])
            });
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error getting top players:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// GET /api/leaderboard/player/:playerId
exports.getPlayerRank = async (req, res) => {
    try {
        const { playerId } = req.params;

        const rank0 = await redis.zrevrank('leaderboard:global', playerId);
        if (rank0 === null) {
            return res.status(404).json({ error: 'Player not found on leaderboard' });
        }

        const total = await redis.zcard('leaderboard:global');
        const scoreVal = await redis.zscore('leaderboard:global', playerId);
        const score = parseFloat(scoreVal) || 0;
        const rank = rank0 + 1;

        // Percentile calculation: percentage of players ranked below this player
        // e.g. if rank is 10 (rank0 is 9) out of 200 players, (200 - 9)/200 * 100 = 95.5%
        const percentile = total > 0 ? Number((((total - rank0) / total) * 100).toFixed(1)) : 100.0;

        // Get nearby players (up to 2 above, up to 2 below)
        const startRank = Math.max(0, rank0 - 2);
        const endRank = rank0 + 2;
        const rawRange = await redis.zrevrange('leaderboard:global', startRank, endRank, 'WITHSCORES');

        const players = [];
        for (let i = 0; i < rawRange.length; i += 2) {
            players.push({
                rank: startRank + (i / 2) + 1,
                playerId: rawRange[i],
                score: parseFloat(rawRange[i + 1])
            });
        }

        const above = players.filter(p => p.rank < rank);
        const below = players.filter(p => p.rank > rank);

        return res.status(200).json({
            playerId,
            score,
            rank,
            percentile,
            nearbyPlayers: {
                above,
                below
            }
        });
    } catch (error) {
        console.error('Error getting player rank:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
