<!--
  这里是 skill 提示词正文的占位。等用户提供后替换掉本文件内容。

  写作时必须满足的 DeepSeek 硬要求（已核实的官方文档）：

  1. 正文里**必须出现 "json" 字样，并给出一份输出样例**。
     官方明确警告：不写的话模型可能一直生成空格直到撞上 max_tokens，
     表现就像请求卡死。

  2. 输出形状必须符合 docs/superpowers/specs/2026-09-19-recommend-layer-design.md
     第 5 节与 lib/recommend/schema.ts 的定义。字段用 snake_case：

       {
         "query": { ... },
         "recommendations": [
           {
             "rank": 1,
             "tier": "首选",
             "name": "集美学村",
             "category": "历史街区 / 风景名胜",
             "address": "厦门市集美区集美学村",
             "fit": [{ "tag": "拍照", "why": "红瓦飞檐与池面倒影是主要机位" }],
             "crowd_level": "low",
             "crowd_note": "本地人生活区，游客极少",
             "indoor_outdoor": "outdoor",
             "best_time": "15:00-18:00",
             "cost": "免费",
             "transit_hint": "地铁 1 号线集美学村站",
             "itinerary": [{ "time": "15:00", "action": "抵达集美学村站" }],
             "pick_if": "想一次拍到建筑和巷弄",
             "trade_off": "咖啡馆 18:00 后陆续打烊",
             "amap_url": "https://uri.amap.com/search?keyword=...",
             "confidence": "high",
             "source": "网页搜索核实（...）"
           }
         ],
         "excluded": [{ "name": "园博苑", "reason": "人流多，3 小时逛不完" }],
         "meta": {
           "assumptions": ["免费优先"],
           "unverified": ["实时人流"],
           "disclaimer": "..."
         }
       }

  3. 平台会做结构校验，以下会被直接判为失败：
     - recommendations 为空
     - 缺 name 或缺 amap_url
     - fit 里同一个 tag 出现多次（skill 的 README 要求合并成一条，证据用「；」连接）
     - **amap_url 不是 amap.com 域名下的 http(s) 链接**（防提示词注入到 XSS）
-->
