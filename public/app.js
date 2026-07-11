// Frontend App Logic

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const sseStatusDot = document.getElementById('sse-status-dot');
    const sseStatusText = document.getElementById('sse-status-text');
    const seedDbBtn = document.getElementById('seed-db-btn');

    const statTotalPlayers = document.getElementById('stat-total-players');
    const statTotalSessions = document.getElementById('stat-total-sessions');
    const statEventsCount = document.getElementById('stat-events-count');

    const createSessionForm = document.getElementById('create-session-form');
    const inspectUserIdInput = document.getElementById('inspect-user-id');
    const inspectSessionsBtn = document.getElementById('inspect-sessions-btn');
    const inspectorSessionsList = document.getElementById('inspector-sessions-list');
    const sessionsEmptyText = document.getElementById('sessions-empty-text');

    const tabTop10 = document.getElementById('tab-top10');
    const tabLookup = document.getElementById('tab-lookup');
    const tabContentTop10 = document.getElementById('tab-content-top10');
    const tabContentLookup = document.getElementById('tab-content-lookup');

    const leaderboardBody = document.getElementById('leaderboard-body');
    const lookupPlayerId = document.getElementById('lookup-player-id');
    const lookupPlayerBtn = document.getElementById('lookup-player-btn');
    const lookupEmptyText = document.getElementById('lookup-empty-text');
    const playerDetailsCard = document.getElementById('player-details-card');
    const playerDetailsRank = document.getElementById('player-details-rank');
    const playerDetailsScore = document.getElementById('player-details-score');
    const playerDetailsPercentile = document.getElementById('player-details-percentile');
    const playerDetailsAbove = document.getElementById('player-details-above');
    const playerDetailsBelow = document.getElementById('player-details-below');

    const subtabScore = document.getElementById('subtab-score');
    const subtabQuiz = document.getElementById('subtab-quiz');
    const subtabContentScore = document.getElementById('subtab-content-score');
    const subtabContentQuiz = document.getElementById('subtab-content-quiz');

    const scoreSubmitForm = document.getElementById('score-submit-form');
    const quizSubmitForm = document.getElementById('quiz-submit-form');
    const eventsTicker = document.getElementById('events-ticker');

    // Stats Counters
    let eventCounter = 0;

    // Initialize Leaderboard & Status
    fetchTopPlayers();
    connectSSE();

    // Tab Navigation: Leaderboard
    tabTop10.addEventListener('click', () => {
        tabTop10.classList.add('active');
        tabLookup.classList.remove('active');
        tabContentTop10.classList.remove('hidden');
        tabContentLookup.classList.add('hidden');
    });

    tabLookup.addEventListener('click', () => {
        tabLookup.classList.add('active');
        tabTop10.classList.remove('active');
        tabContentLookup.classList.remove('hidden');
        tabContentTop10.classList.add('hidden');
    });

    // Tab Navigation: Simulators
    subtabScore.addEventListener('click', () => {
        subtabScore.classList.add('active');
        subtabQuiz.classList.remove('active');
        subtabContentScore.classList.remove('hidden');
        subtabContentQuiz.classList.add('hidden');
    });

    subtabQuiz.addEventListener('click', () => {
        subtabQuiz.classList.add('active');
        subtabScore.classList.remove('active');
        subtabContentQuiz.classList.remove('hidden');
        subtabContentScore.classList.add('hidden');
    });

    // SSE Connection Management
    function connectSSE() {
        console.log('Connecting to SSE events channel...');
        const eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
            sseStatusDot.classList.add('active');
            sseStatusText.textContent = 'SSE Live';
        };

        eventSource.onerror = (err) => {
            console.warn('SSE disconnected/error:', err);
            sseStatusDot.classList.remove('active');
            sseStatusText.textContent = 'SSE Reconnecting...';
        };

        eventSource.addEventListener('leaderboard_updated', (e) => {
            try {
                const data = JSON.parse(e.data);
                eventCounter++;
                statEventsCount.textContent = eventCounter;

                // Log to Event Ticker
                logEvent('leaderboard_updated', `Player [${data.playerId}] score updated to ${data.newScore}`);

                // Refresh Lists
                fetchTopPlayers();

                // If we are currently inspecting this player, reload their profile too
                const activeLookupPlayer = lookupPlayerId.value.trim();
                if (activeLookupPlayer && activeLookupPlayer === data.playerId) {
                    fetchPlayerDetails(data.playerId);
                }
            } catch (err) {
                console.error('Error parsing SSE event data:', err);
            }
        });
    }

    // Ticker Log
    function logEvent(type, text) {
        const timestamp = new Date().toLocaleTimeString();
        const item = document.createElement('div');
        item.className = `ticker-item ${type}`;
        item.innerHTML = `
      <span class="time">[${timestamp}]</span>
      <span class="badge">${type}</span>
      <span>${text}</span>
    `;
        eventsTicker.prepend(item);

        // Prune ticker items if too many
        if (eventsTicker.children.length > 50) {
            eventsTicker.removeChild(eventsTicker.lastChild);
        }
    }

    // Seed DB button click
    seedDbBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/admin/seed', { method: 'POST' });
            const data = await response.json();
            alert(data.message || 'Database Seeded!');
            fetchTopPlayers();
            logEvent('database_seed', 'Initialized leaderboard with 30 mock player scores.');
        } catch (err) {
            console.error('Seeding error:', err);
            alert('Error seeding database: ' + err.message);
        }
    });

    // Create Session Form submit
    createSessionForm.addEventListener('click', async (e) => {
        // Only intercept form submits
        if (e.target.tagName !== 'BUTTON') return;
    });

    createSessionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('sess-user-id').value.trim();
        const ipAddress = document.getElementById('sess-ip').value.trim();
        const deviceType = document.getElementById('sess-device').value;

        try {
            const response = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, ipAddress, deviceType })
            });
            const data = await response.json();

            if (response.status === 201) {
                logEvent('session_created', `Active session created atomically for ${userId}. ID: ${data.sessionId}`);
                alert(`Session Created!\nSession ID: ${data.sessionId}`);
                inspectUserIdInput.value = userId;
                fetchUserSessions(userId);
            } else {
                alert('Failed to create session: ' + data.error);
            }
        } catch (err) {
            console.error(err);
            alert('Network Error occurred: ' + err.message);
        }
    });

    // Inspect Sessions click
    inspectSessionsBtn.addEventListener('click', () => {
        const userId = inspectUserIdInput.value.trim();
        if (!userId) return alert('Enter a User ID first.');
        fetchUserSessions(userId);
    });

    async function fetchUserSessions(userId) {
        try {
            const response = await fetch(`/api/admin/sessions/user/${userId}`);
            const data = await response.json();

            inspectorSessionsList.innerHTML = '';
            if (data.length === 0) {
                sessionsEmptyText.classList.remove('hidden');
                sessionsEmptyText.textContent = `No active sessions found for "${userId}".`;
                statTotalSessions.textContent = '0';
                return;
            }

            sessionsEmptyText.classList.add('hidden');
            statTotalSessions.textContent = data.length;

            data.forEach((sess) => {
                const div = document.createElement('div');
                div.className = 'session-card';
                div.innerHTML = `
          <div class="session-card-details">
            <h4>${sess.sessionId.substring(0, 18)}...</h4>
            <p><strong>Device:</strong> ${sess.deviceType} | <strong>IP:</strong> ${sess.ipAddress || 'N/A'}</p>
            <p><strong>Last Active:</strong> ${new Date(sess.lastActive).toLocaleTimeString()}</p>
          </div>
          <button class="btn btn-danger btn-delete-sess" data-id="${sess.sessionId}" data-user="${userId}">Delete</button>
        `;
                inspectorSessionsList.appendChild(div);
            });

            // Bind deletes
            document.querySelectorAll('.btn-delete-sess').forEach((btn) => {
                btn.addEventListener('click', async (e) => {
                    const sid = e.target.getAttribute('data-id');
                    const uid = e.target.getAttribute('data-user');
                    if (confirm(`Invalidate session: ${sid}?`)) {
                        await deleteUserSession(sid, uid);
                    }
                });
            });

        } catch (err) {
            console.error(err);
            alert('Error fetching sessions: ' + err.message);
        }
    }

    async function deleteUserSession(sessionId, userId) {
        try {
            const response = await fetch(`/api/admin/sessions/${sessionId}`, { method: 'DELETE' });
            if (response.status === 204) {
                logEvent('session_deleted', `Deleted session ${sessionId}`);
                fetchUserSessions(userId);
            } else {
                alert('Failed to delete session');
            }
        } catch (err) {
            console.error(err);
        }
    }

    // Fetch Top Players
    async function fetchTopPlayers() {
        try {
            const response = await fetch('/api/leaderboard/top/10');
            const data = await response.json();

            leaderboardBody.innerHTML = '';

            if (data.length === 0) {
                leaderboardBody.innerHTML = `
          <tr>
            <td colspan="3" class="text-center placeholder-text">Leaderboard is empty. Click Seed Test Data!</td>
          </tr>
        `;
                statTotalPlayers.textContent = '0';
                return;
            }

            // Query zcard total player stats
            statTotalPlayers.textContent = data.length >= 10 ? '30+' : data.length;

            data.forEach((p) => {
                const tr = document.createElement('tr');

                let rankClass = 'rank-other';
                if (p.rank === 1) rankClass = 'rank-1';
                else if (p.rank === 2) rankClass = 'rank-2';
                else if (p.rank === 3) rankClass = 'rank-3';

                tr.innerHTML = `
          <td><span class="rank-badge ${rankClass}">${p.rank}</span></td>
          <td>${p.playerId}</td>
          <td class="text-right score-cell">${p.score}</td>
        `;
                leaderboardBody.appendChild(tr);
            });
        } catch (err) {
            console.error('Error fetching leaderboard:', err);
        }
    }

    // Player Statistics details lookup
    lookupPlayerBtn.addEventListener('click', () => {
        const val = lookupPlayerId.value.trim();
        if (!val) return alert('Enter a Player ID.');
        fetchPlayerDetails(val);
    });

    async function fetchPlayerDetails(playerId) {
        try {
            const response = await fetch(`/api/leaderboard/player/${playerId}`);
            if (response.status === 404) {
                lookupEmptyText.classList.remove('hidden');
                lookupEmptyText.textContent = `Player "${playerId}" does not exist on the leaderboard.`;
                playerDetailsCard.classList.add('hidden');
                return;
            }

            const p = await response.json();
            lookupEmptyText.classList.add('hidden');
            playerDetailsCard.classList.remove('hidden');

            playerDetailsRank.textContent = p.rank;
            playerDetailsScore.textContent = p.score;
            playerDetailsPercentile.textContent = `${p.percentile}%`;

            // Fill Above players
            playerDetailsAbove.innerHTML = '';
            if (p.nearbyPlayers.above.length === 0) {
                playerDetailsAbove.innerHTML = '<li class="placeholder-text">None</li>';
            } else {
                p.nearbyPlayers.above.forEach((item) => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="other-player">${item.playerId} (#${item.rank})</span> <span>${item.score}</span>`;
                    playerDetailsAbove.appendChild(li);
                });
            }

            // Fill Below players
            playerDetailsBelow.innerHTML = '';
            if (p.nearbyPlayers.below.length === 0) {
                playerDetailsBelow.innerHTML = '<li class="placeholder-text">None</li>';
            } else {
                p.nearbyPlayers.below.forEach((item) => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="other-player">${item.playerId} (#${item.rank})</span> <span>${item.score}</span>`;
                    playerDetailsBelow.appendChild(li);
                });
            }

        } catch (err) {
            console.error(err);
            alert('Error fetching player stats: ' + err.message);
        }
    }

    // Score Submit Form submit
    scoreSubmitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const playerId = document.getElementById('score-player-id').value.trim();
        const points = parseInt(document.getElementById('score-points').value, 10);

        try {
            const response = await fetch('/api/leaderboard/scores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId, points })
            });
            const data = await response.json();

            if (response.status === 200) {
                alert(`Score Updated!\nPlayer: ${data.playerId}\nNew Score: ${data.newScore}`);
                document.getElementById('score-player-id').value = '';
            } else {
                alert('Failed to submit score: ' + data.error);
            }
        } catch (err) {
            console.error(err);
        }
    });

    // Quiz submission form submit
    quizSubmitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const gameId = document.getElementById('quiz-game-id').value.trim();
        const roundId = document.getElementById('quiz-round-id').value;
        const playerId = document.getElementById('quiz-player-id').value.trim();
        const answer = document.getElementById('quiz-answer').value.trim();

        try {
            const response = await fetch('/api/game/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId, roundId, playerId, answer })
            });

            const data = await response.json();

            if (response.status === 200) {
                logEvent('quiz_success', `Active round submission for ${playerId} succeeded. New Score: ${data.newScore}`);
                alert(`Success!\nAnswer submitted.\nNew Score: ${data.newScore}`);
                document.getElementById('quiz-player-id').value = '';
            } else if (response.status === 400 && data.code === 'DUPLICATE_SUBMISSION') {
                logEvent('quiz_error', `Submission duplicate check failed for ${playerId}`);
                alert('Error: Duplicate Submission (User has already answered for this round)');
            } else if (response.status === 403 && data.code === 'ROUND_EXPIRED') {
                logEvent('quiz_error', `Submission window expired checkpoint failed for round: ${roundId}`);
                alert('Error: Round Expired (Submissions closed)');
            } else {
                alert('Error submitting answer: ' + (data.error || data.code));
            }
        } catch (err) {
            console.error(err);
            alert('Verification network err: ' + err.message);
        }
    });
});
