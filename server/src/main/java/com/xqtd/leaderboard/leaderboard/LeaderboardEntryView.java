package com.xqtd.leaderboard.leaderboard;

import java.time.Instant;

public record LeaderboardEntryView(
        int rank,
        String playerId,
        String name,
        int wave,
        Instant updatedAt
) {
}
