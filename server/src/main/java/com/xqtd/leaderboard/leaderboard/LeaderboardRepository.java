package com.xqtd.leaderboard.leaderboard;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface LeaderboardRepository extends JpaRepository<LeaderboardEntry, Long> {

    Optional<LeaderboardEntry> findByPlayerId(String playerId);

    long countByBestWaveGreaterThan(int wave);

    List<LeaderboardEntry> findAllByOrderByBestWaveDescUpdatedAtAscIdAsc(Pageable pageable);
}
