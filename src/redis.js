const Redis = require('ioredis');
const dotenv = require('dotenv');

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Main client for commands
const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Subscriber client for SSE
const subscriber = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

redis.on('connect', () => {
  console.log('Redis command client connected');
});

redis.on('error', (err) => {
  console.error('Redis command client error:', err);
});

subscriber.on('connect', () => {
  console.log('Redis subscriber client connected');
});

subscriber.on('error', (err) => {
  console.error('Redis subscriber client error:', err);
});

// Define and define commands for Lua scripts
const SESSION_INVALIDATION_SCRIPT = `
  local userId = ARGV[1]
  local sessionId = ARGV[2]
  local ipAddress = ARGV[3]
  local deviceType = ARGV[4]
  local createdAt = ARGV[5]
  local lastActive = ARGV[6]
  local ttl = tonumber(ARGV[7])

  local userKey = "user_sessions:" .. userId
  local oldSessionIds = redis.call("SMEMBERS", userKey)

  for _, oldId in ipairs(oldSessionIds) do
      redis.call("DEL", "session:" .. oldId)
  end

  redis.call("DEL", userKey)
  redis.call("SADD", userKey, sessionId)

  local sessionKey = "session:" .. sessionId
  redis.call("HSET", sessionKey, "userId", userId, "createdAt", createdAt, "lastActive", lastActive, "ipAddress", ipAddress, "deviceType", deviceType)
  redis.call("EXPIRE", sessionKey, ttl)

  return 1
`;

const GAME_SUBMIT_SCRIPT = `
  local gameId = ARGV[1]
  local roundId = ARGV[2]
  local playerId = ARGV[3]
  local answer = ARGV[4]
  local currentTime = tonumber(ARGV[5])
  local pointsToAward = tonumber(ARGV[6]) or 10

  local roundKey = "game_round:" .. gameId .. ":" .. roundId
  local submissionsKey = "submissions:" .. gameId .. ":" .. roundId
  local leaderboardKey = "leaderboard:global"

  -- Check if round exists and is active
  local endTimeStr = redis.call("HGET", roundKey, "endTime")
  if not endTimeStr then
      return "ROUND_EXPIRED"
  end
  local endTime = tonumber(endTimeStr)
  if currentTime >= endTime then
      return "ROUND_EXPIRED"
  end

  -- Check for duplicate submission
  local isMember = redis.call("SISMEMBER", submissionsKey, playerId)
  if isMember == 1 then
      return "DUPLICATE_SUBMISSION"
  end

  -- Add to submissions set
  redis.call("SADD", submissionsKey, playerId)

  -- Read correct answer from round state if present
  local correctAnswer = redis.call("HGET", roundKey, "correctAnswer")
  local pts = pointsToAward
  if correctAnswer and correctAnswer ~= "" then
      if answer ~= correctAnswer then
          pts = 0
      end
  end

  -- Update score
  local newScoreVal = 0
  if pts > 0 then
      newScoreVal = redis.call("ZINCRBY", leaderboardKey, pts, playerId)
  else
      -- If incorrect, return current score or 0 if not ranked
      local score = redis.call("ZSCORE", leaderboardKey, playerId)
      if not score then
          redis.call("ZADD", leaderboardKey, 0, playerId)
          newScoreVal = 0
      else
          newScoreVal = tonumber(score)
      end
  end

  return "SUCCESS:" .. tostring(newScoreVal)
`;

// Register commands
redis.defineCommand('invalidateAndCreateSession', {
  numberOfKeys: 0,
  lua: SESSION_INVALIDATION_SCRIPT
});

redis.defineCommand('submitGameAnswer', {
  numberOfKeys: 0,
  lua: GAME_SUBMIT_SCRIPT
});

module.exports = {
  redis,
  subscriber
};
