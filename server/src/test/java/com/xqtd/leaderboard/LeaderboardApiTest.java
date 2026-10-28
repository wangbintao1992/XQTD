package com.xqtd.leaderboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xqtd.leaderboard.leaderboard.LeaderboardRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LeaderboardApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private LeaderboardRepository repository;

    @BeforeEach
    void clean() {
        repository.deleteAll();
    }

    @Test
    void healthIsOk() throws Exception {
        mvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void submitCreatesEntryAndRanks() throws Exception {
        submit("player-0001", "Alice", 12)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(true))
                .andExpect(jsonPath("$.bestWave").value(12))
                .andExpect(jsonPath("$.rank").value(1));
    }

    @Test
    void rankCountsPlayersWithHigherWave() throws Exception {
        submit("player-0001", "Alice", 12).andExpect(jsonPath("$.rank").value(1));
        submit("player-0002", "Bob", 20).andExpect(jsonPath("$.rank").value(1));
        submit("player-0001", "Alice", 12)
                .andExpect(jsonPath("$.accepted").value(false))
                .andExpect(jsonPath("$.bestWave").value(12))
                .andExpect(jsonPath("$.rank").value(2));
    }

    @Test
    void lowerWaveNeverReplacesBest() throws Exception {
        submit("player-0001", "Alice", 12).andExpect(jsonPath("$.accepted").value(true));
        submit("player-0001", "Alice", 7)
                .andExpect(jsonPath("$.accepted").value(false))
                .andExpect(jsonPath("$.bestWave").value(12));
        mvc.perform(get("/api/leaderboard/players/player-0001"))
                .andExpect(jsonPath("$.bestWave").value(12));
    }

    @Test
    void higherWaveReplacesBest() throws Exception {
        submit("player-0001", "Alice", 12);
        submit("player-0002", "Bob", 20);
        submit("player-0001", "Alice", 30)
                .andExpect(jsonPath("$.accepted").value(true))
                .andExpect(jsonPath("$.bestWave").value(30))
                .andExpect(jsonPath("$.rank").value(1));
        mvc.perform(get("/api/leaderboard/top?limit=2"))
                .andExpect(jsonPath("$.entries[0].playerId").value("player-0001"))
                .andExpect(jsonPath("$.entries[0].wave").value(30))
                .andExpect(jsonPath("$.entries[1].playerId").value("player-0002"));
    }

    @Test
    void topIsSortedAndLimited() throws Exception {
        submit("player-0001", "A", 5);
        submit("player-0002", "B", 9);
        submit("player-0003", "C", 7);
        mvc.perform(get("/api/leaderboard/top?limit=2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries.length()").value(2))
                .andExpect(jsonPath("$.entries[0].rank").value(1))
                .andExpect(jsonPath("$.entries[0].wave").value(9))
                .andExpect(jsonPath("$.entries[1].rank").value(2))
                .andExpect(jsonPath("$.entries[1].wave").value(7));
    }

    @Test
    void playerLookupReturnsPersonalBestAndRank() throws Exception {
        submit("player-0001", "Alice", 12);
        submit("player-0002", "Bob", 20);
        mvc.perform(get("/api/leaderboard/players/player-0001"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(true))
                .andExpect(jsonPath("$.name").value("Alice"))
                .andExpect(jsonPath("$.bestWave").value(12))
                .andExpect(jsonPath("$.rank").value(2));
    }

    @Test
    void unknownPlayerIsNotFoundButSafe() throws Exception {
        mvc.perform(get("/api/leaderboard/players/unknown-0001"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(false))
                .andExpect(jsonPath("$.bestWave").value(0));
    }

    @Test
    void namesAreTrimmedAndBlankFallsBack() throws Exception {
        submit("player-0001", "  Alice  ", 3);
        mvc.perform(get("/api/leaderboard/players/player-0001"))
                .andExpect(jsonPath("$.name").value("Alice"));

        submit("player-0002", "   ", 4);
        mvc.perform(get("/api/leaderboard/players/player-0002"))
                .andExpect(jsonPath("$.name").value("无名棋手"));
    }

    @Test
    void rejectsInvalidPayloads() throws Exception {
        submit("player-0001", "Alice", -1).andExpect(status().isBadRequest());
        submit("bad id", "Alice", 3).andExpect(status().isBadRequest());
        submit("player-0001", "12345678901234567", 3).andExpect(status().isBadRequest());
    }

    @Test
    void allowsCrossOriginPreflight() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .options("/api/leaderboard/top")
                        .header("Origin", "http://localhost:8080")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "*"));
    }

    private ResultActions submit(String playerId, String name, int wave) throws Exception {
        String body = json.writeValueAsString(Map.of(
                "playerId", playerId,
                "name", name,
                "wave", wave
        ));
        return mvc.perform(post("/api/leaderboard/reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }
}
