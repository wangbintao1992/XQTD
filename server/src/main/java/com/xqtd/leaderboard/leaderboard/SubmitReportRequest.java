package com.xqtd.leaderboard.leaderboard;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SubmitReportRequest(
        @NotBlank
        @Pattern(regexp = "[A-Za-z0-9_-]{8,64}", message = "playerId 必须是 8-64 位字母、数字、下划线或连字符")
        String playerId,

        @Size(max = 16, message = "name 最多 16 个字符")
        String name,

        @Min(value = 0, message = "wave 不能为负数")
        @Max(value = 100000, message = "wave 超出合理范围")
        int wave
) {
}
