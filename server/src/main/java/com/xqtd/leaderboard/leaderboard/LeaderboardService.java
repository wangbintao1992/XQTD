package com.xqtd.leaderboard.leaderboard;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class LeaderboardService {

    public static final String DEFAULT_NAME = "无名棋手";
    public static final int MAX_NAME_LENGTH = 16;

    private final LeaderboardRepository repository;

    public LeaderboardService(LeaderboardRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public SubmitReportResponse submit(SubmitReportRequest request) {
        String playerId = request.playerId();
        String name = sanitizeName(request.name());
        Instant now = Instant.now();

        LeaderboardEntry entry = repository.findByPlayerId(playerId).orElse(null);
        boolean accepted;
        if (entry == null) {
            entry = new LeaderboardEntry(playerId, name, request.wave(), now);
            accepted = true;
        } else {
            accepted = request.wave() > entry.getBestWave();
            if (accepted) {
                entry.setBestWave(request.wave());
                entry.setUpdatedAt(now);
            }
            entry.setName(name);
        }
        repository.save(entry);
        return new SubmitReportResponse(accepted, entry.getBestWave(), rankOf(entry.getBestWave()));
    }

    @Transactional(readOnly = true)
    public TopResponse top(int limit) {
        List<LeaderboardEntry> entries = repository
                .findAllByOrderByBestWaveDescUpdatedAtAscIdAsc(PageRequest.of(0, limit));
        List<LeaderboardEntryView> views = entries.stream()
                .map(entry -> new LeaderboardEntryView(
                        rankOf(entry.getBestWave()),
                        entry.getPlayerId(),
                        entry.getName(),
                        entry.getBestWave(),
                        entry.getUpdatedAt()))
                .toList();
        return new TopResponse(views);
    }

    @Transactional(readOnly = true)
    public PlayerStatusResponse player(String playerId) {
        return repository.findByPlayerId(playerId)
                .map(entry -> new PlayerStatusResponse(
                        true,
                        entry.getPlayerId(),
                        entry.getName(),
                        entry.getBestWave(),
                        rankOf(entry.getBestWave())))
                .orElseGet(() -> PlayerStatusResponse.missing(playerId));
    }

    private int rankOf(int wave) {
        return Math.toIntExact(repository.countByBestWaveGreaterThan(wave) + 1);
    }

    static String sanitizeName(String raw) {
        if (raw == null) {
            return DEFAULT_NAME;
        }
        String cleaned = raw.replaceAll("\\p{Cntrl}", "")
                .strip()
                .replaceAll("\\s+", " ");
        if (cleaned.isEmpty()) {
            return DEFAULT_NAME;
        }
        return cleaned.length() > MAX_NAME_LENGTH
                ? cleaned.substring(0, MAX_NAME_LENGTH)
                : cleaned;
    }
}
