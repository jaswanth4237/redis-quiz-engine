const { redis } = require('../redis');

exports.submitAnswer = async (req, res) => {
    try {
        const { gameId, roundId, playerId, answer } = req.body;

        if (!gameId || !roundId || !playerId || answer === undefined) {
            return res.status(400).json({ error: 'gameId, roundId, playerId, and answer are required' });
        }

        const currentTime = Date.now();
        // Defaulting to award 10 points
        const pointsToAward = 10;

        const result = await redis.submitGameAnswer(
            gameId,
            roundId,
            playerId,
            answer,
            currentTime,
            pointsToAward
        );

        if (result === 'ROUND_EXPIRED') {
            return res.status(403).json({
                status: 'ERROR',
                code: 'ROUND_EXPIRED'
            });
        }

        if (result === 'DUPLICATE_SUBMISSION') {
            return res.status(400).json({
                status: 'ERROR',
                code: 'DUPLICATE_SUBMISSION'
            });
        }

        if (result.startsWith('SUCCESS:')) {
            const newScore = parseFloat(result.split(':')[1]) || 0;

            // Publish leaderboard update
            const message = JSON.stringify({
                event: 'leaderboard_updated',
                data: {
                    playerId,
                    newScore
                }
            });
            await redis.publish('game-events', message);

            return res.status(200).json({
                status: 'SUCCESS',
                newScore
            });
        }

        return res.status(500).json({ error: 'Unknown response from database script' });
    } catch (error) {
        console.error('Error submitting answer:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
