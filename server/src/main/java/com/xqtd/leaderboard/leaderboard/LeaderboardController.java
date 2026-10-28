package com.xqtd.leaderboard.leaderboard;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/leaderboard")
public class LeaderboardController {

    private final LeaderboardService service;

    public LeaderboardController(LeaderboardService service) {
        this.service = service;
    }

    @PostMapping("/reports")
    public SubmitReportResponse submit(@Valid @RequestBody SubmitReportRequest request) {
        return service.submit(request);
    }

    @GetMapping("/top")
    public TopResponse top(
            @RequestParam(defaultValue = "10")
            @Min(value = 1, message = "limit 至少为 1")
            @Max(value = 100, message = "limit 最多为 100")
            int limit) {
        return service.top(limit);
    }

    @GetMapping("/players/{playerId}")
    public PlayerStatusResponse player(
            @PathVariable
            @Pattern(regexp = "[A-Za-z0-9_-]{8,64}", message = "playerId 格式不正确")
            String playerId) {
        return service.player(playerId);
    }
}
