# 周边去哪

按当前位置或地图选点推荐附近去处，勾选若干个后按勾选顺序在地图上画出路线。

## 跑起来

```bash
npm install
cp .env.example .env.local   # 填不填都能跑，默认走 mock
npm run dev
```

没有密钥时 `POI_PROVIDER=mock` / `ROUTE_PROVIDER=mock`，全链路用确定性假数据跑通。
填入高德密钥后把两个变量改成 `amap`。

## 密钥说明

| 变量 | 用途 | 是否进浏览器 |
| --- | --- | --- |
| `AMAP_WEB_SERVICE_KEY` | 服务端调周边搜索、路径规划 | 否 |
| `NEXT_PUBLIC_AMAP_JS_KEY` | 浏览器渲染地图 | 是（靠域名白名单保护） |
| `AMAP_JS_SECURITY_CODE` | 配合 JS API | 否（走 `/api/amap-service` 代理） |

JS API Key 需要在高德控制台把 `localhost` 加进域名白名单。Key 类型必须是
「Web端(JS API)」，与服务端用的「Web服务」Key 不通用。

## 测试

```bash
npm test
```

7 个文件 56 个用例，只覆盖纯逻辑与字段映射（排序与多样性惩罚、游玩项目推导、
营业状态解析、地址模糊化、地理计算、高德字段映射、mock provider 契约）。
地图渲染与真实路线依赖高德线上数据，靠手工验收。

## 已知近似

「推荐游玩项目」是按 POI 类别规则推导的，不是真实内容。见 `docs/superpowers/specs/`
下的设计文档第 3.4 节。

## 文档

- 设计：`docs/superpowers/specs/2026-09-18-xinghuacun-mvp-design.md`
- 实现计划：`docs/superpowers/plans/2026-09-18-xinghuacun-mvp.md`
