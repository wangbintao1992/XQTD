package com.xqtd.leaderboard.leaderboard;

public record PlayerStatusResponse(
        boolean found,
        String playerId,
        String name,
        int bestWave,
        Integer rank
) {
    public static PlayerStatusResponse missing(String playerId) {
        return new PlayerStatusResponse(false, playerId, "", 0, null);
    }
}
