# 周边去哪

给一个出发点，让 skill 推荐值得去的地方，勾选后按**最优顺序**规划路线。

## 跑起来

```bash
npm install
cp .env.example .env.local
npm run models        # 先确认账号能用哪些模型，填进 DEEPSEEK_MODEL
npm run dev
```

## 两部分，各管各的

| | 负责 | 不负责 |
| --- | --- | --- |
| **skill**（DeepSeek + 你的提示词） | 判断哪里值得去、为什么、玩什么 | **不给坐标、不给距离、不给营业状态** |
| **高德** | 坐标核实、直线距离、营业状态、路径规划 | 不参与推荐 |

这个分工是刻意的：skill 的提示词里明写「没接地图 API 时算不准，给一个错的数字比不给更糟」。
所以距离和路线一律由高德算。

**只有高德核实通过的地点才能上图、才能参与路线。** 核实不到的会保留在列表里并标注
「高德未能核实」——它可能只是高德没收录，丢掉等于拿我们的短板惩罚用户。

## 密钥说明

| 变量 | 用途 | 是否进浏览器 |
| --- | --- | --- |
| `AMAP_WEB_SERVICE_KEY` | 服务端调地理编码、周边搜索、路径规划 | 否 |
| `NEXT_PUBLIC_AMAP_JS_KEY` | 浏览器渲染地图 | 是（靠高德控制台域名白名单保护） |
| `AMAP_JS_SECURITY_CODE` | 配合 JS API | 否（走 `/_AMapService` 代理） |
| `DEEPSEEK_API_KEY` | 服务端调 skill | 否 |
| `DEEPSEEK_MODEL` | 模型 ID，**用 `npm run models` 确认后再填** | 否 |

`ROUTE_PROVIDER=mock` 可以在没有高德 Key 时跑通交互。

## 几个必须知道的坑

- **坐标系**：浏览器定位给 WGS-84，高德用 GCJ-02，国内差 100~700 米。
  不转换不是「标记画歪」，而是 **skill 按偏了的位置检索，推荐出一批别处的地方**。
  地图选点的坐标已经是 GCJ-02，**再转一次会转坏**，所以转换严格绑定坐标来源。
- **直线距离不是驾车距离**。列表上标的是直线距离，界面必须写明「直线」；
  真实里程只有规划出路线之后才有。
- **高德按秒限流**（`CUQPS_HAS_EXCEEDED_THE_LIMIT`），与月度配额是两回事。
  连点会造成请求风暴，所以路线请求有 400ms 防抖。
- **高德用 `[]` 表示空字段**，很多字段也不保证是字符串。所有字段读取统一走
  `lib/core/coerce.ts` 的 `asText()`，不要在调用点直接做字符串操作。
- **任何 `catch` 都不许静默吞错**。上一轮正因为 `catch` 吞掉限流错误，
  一个失败被伪装成了「0 分钟 0.0 公里」的路线。

## 提示词

放在 `lib/recommend/prompt.md`。文件头部的注释列了 DeepSeek 的硬要求和输出形状。

注意：**提示词里必须出现 "json" 字样并给出输出样例**，否则 DeepSeek 可能一直生成
空格直到撞上 `max_tokens`，表现就像请求卡死。

## 测试

```bash
npm test
```

14 个文件 113 个用例，覆盖纯逻辑与字段映射：坐标转换、DeepSeek 响应解析、
skill 输出结构校验、amap_url 白名单校验、高德核实映射、
顺序优化、营业状态解析、地址模糊化、地理计算。

不测：DeepSeek 真实调用、高德真实接口、地图渲染 —— 靠手工验收。

## 文档

- 设计：`docs/superpowers/specs/2026-09-19-recommend-layer-design.md`
- 第一版设计（部分被取代）：`docs/superpowers/specs/2026-09-18-xinghuacun-mvp-design.md`
- 实现计划：`docs/superpowers/plans/2026-09-19-recommend-layer.md`
