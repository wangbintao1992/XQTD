package com.xqtd.leaderboard.leaderboard;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "leaderboard_entries")
public class LeaderboardEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "player_id", nullable = false, unique = true, length = 64)
    private String playerId;

    @Column(name = "name", nullable = false, length = 16)
    private String name;

    @Column(name = "best_wave", nullable = false)
    private int bestWave;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected LeaderboardEntry() {
    }

    public LeaderboardEntry(String playerId, String name, int bestWave, Instant updatedAt) {
        this.playerId = playerId;
        this.name = name;
        this.bestWave = bestWave;
        this.updatedAt = updatedAt;
    }

    public Long getId() {
        return id;
    }

    public String getPlayerId() {
        return playerId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getBestWave() {
        return bestWave;
    }

    public void setBestWave(int bestWave) {
        this.bestWave = bestWave;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
