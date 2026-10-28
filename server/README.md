# XQTD Leaderboard Server

墨守山河无尽模式的真实排行榜后端。独立 Java 项目，不依赖 Godot 工程。

- Java 21 + Spring Boot 3.5
- H2 文件库，默认数据在 `server/data/leaderboard.mv.db`
- REST + CORS，默认监听 `0.0.0.0:8080`，局域网可直接访问
- 每个玩家只保留一条个人最高波数记录

## 运行

需要 **JDK 21**（不是 JRE），仓库自带 Maven Wrapper：

```bash
cd server
./mvnw spring-boot:run
```

或先打包再运行：

```bash
./mvnw -DskipTests package
java -jar target/leaderboard-server-0.1.0.jar
```

环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | HTTP 端口 |
| `BIND_ADDRESS` | `0.0.0.0` | 监听地址；只给本机用可设 `127.0.0.1` |
| `DB_URL` | `jdbc:h2:file:./data/leaderboard;DB_CLOSE_ON_EXIT=FALSE` | JDBC 地址 |
| `DB_USER` | `sa` | 数据库用户 |
| `DB_PASSWORD` | 空 | 数据库密码 |

## API

### 健康检查

```http
GET /api/health
```

```json
{"status":"ok","service":"xqtd-leaderboard","time":"2026-10-28T09:45:17Z"}
```

### 上报成绩

```http
POST /api/leaderboard/reports
Content-Type: application/json

{"playerId":"player-0001","name":"无名棋手","wave":17}
```

`playerId` 由客户端生成并持久化，8–64 位字母/数字/下划线/连字符。`name` 最多 16 字符，会去首尾空白；留空或全空白时存为「无名棋手」。

```json
{"accepted":true,"bestWave":17,"rank":1}
```

- 只有高于个人历史最高波数时才更新记录，`accepted` 为 `true`。
- `rank` 按「严格高于自己的玩家数 + 1」计算；同波数并列。
- 低波数上报不会覆盖历史最高。

### 排行榜

```http
GET /api/leaderboard/top?limit=10
```

`limit` 1–100，默认 10。

```json
{
  "entries": [
    {"rank":1,"playerId":"player-0001","name":"无名棋手","wave":17,"updatedAt":"2026-10-28T09:45:17Z"}
  ]
}
```

### 玩家状态

```http
GET /api/leaderboard/players/{playerId}
```

```json
{"found":true,"playerId":"player-0001","name":"无名棋手","bestWave":17,"rank":1}
```

未上过榜的玩家返回 `found:false`、`bestWave:0`、`rank:null`，HTTP 仍是 200。

## 测试

```bash
cd server
./mvnw test
```

当前覆盖：健康检查、首次上报、同分排名、低波不覆盖、高波刷新、Top 排序/截断、玩家查询、名字清洗、参数校验、CORS 预检。

## 部署说明

- 单机/局域网：直接 `./mvnw spring-boot:run`，Godot 里填 `http://<服务器局域网 IP>:8080`。
- 公网：建议放到反向代理（Nginx/Caddy）后面并启用 HTTPS，只暴露 `/api/**`。
- 换 MySQL/PostgreSQL：改 `DB_URL`/`DB_USER`/`DB_PASSWORD`，并在 `pom.xml` 加对应 JDBC 驱动；当前只内置 H2。
- 备份：停服后复制 `data/leaderboard.mv.db` 即可。

## 已知限制

- `wave` 由客户端上报，服务器只做 0–100000 的范围校验，没有战斗回放校验，存在伪造空间；真实反作弊需要上报 BattleReport 并在服务端复算。
- 没有账号体系，`playerId` 即身份；换设备会变成新玩家。
- 没有请求限流；公网部署前应在反向代理加限流。
