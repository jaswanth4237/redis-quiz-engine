const { v4: uuidv4 } = require('uuid');
const { redis } = require('../redis');

exports.createSession = async (req, res) => {
    try {
        const { userId, ipAddress, deviceType } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const sessionId = uuidv4();
        const now = new Date().toISOString();
        const ttl = 1800; // 30 minutes in seconds

        // Call the registered Lua script atomically
        await redis.invalidateAndCreateSession(
            userId,
            sessionId,
            ipAddress || '',
            deviceType || '',
            now,
            now,
            ttl
        );

        return res.status(201).json({ sessionId });
    } catch (error) {
        console.error('Error creating session:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
