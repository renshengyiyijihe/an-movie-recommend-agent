# -*- coding: utf-8 -*-
"""Generate UTF-8 SVG diagrams for the README. Run from repo root: python docs/gen_diagrams.py"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def write(name: str, svg: str) -> None:
    path = ROOT / name
    path.write_bytes((svg.strip() + "\n").encode("utf-8"))
    print(f"wrote {path} ({path.stat().st_size} bytes)")


FONT = "ui-sans-serif, system-ui, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"


write(
    "demo-chat.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 720" role="img" aria-label="An-movie Agent demo">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#eef2ff"/>
      <stop offset="55%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#fff7ed"/>
    </linearGradient>
    <linearGradient id="poster1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="poster2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7c2d12"/>
      <stop offset="100%" stop-color="#1c1917"/>
    </linearGradient>
    <filter id="shadow" x="-8%" y="-8%" width="116%" height="124%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#312e81" flood-opacity="0.18"/>
    </filter>
    <clipPath id="win">
      <rect x="48" y="36" width="1024" height="648" rx="22"/>
    </clipPath>
  </defs>
  <rect width="1120" height="720" fill="url(#bg)"/>
  <g filter="url(#shadow)" clip-path="url(#win)">
    <rect x="48" y="36" width="1024" height="648" rx="22" fill="#ffffff"/>
    <rect x="48" y="36" width="1024" height="46" fill="#f1f5f9"/>
    <circle cx="76" cy="59" r="6" fill="#fb7185"/>
    <circle cx="96" cy="59" r="6" fill="#fbbf24"/>
    <circle cx="116" cy="59" r="6" fill="#34d399"/>
    <rect x="368" y="48" width="384" height="22" rx="11" fill="#ffffff"/>
    <text x="560" y="63" text-anchor="middle" font-size="11" fill="#64748b" font-family="{FONT}">localhost · An-movie Agent</text>
    <rect x="48" y="82" width="1024" height="56" fill="#ffffff"/>
    <rect x="48" y="137" width="1024" height="1" fill="#e5e7eb"/>
    <rect x="72" y="96" width="28" height="28" rx="8" fill="#fff7ed"/>
    <ellipse cx="86" cy="116" rx="10" ry="5" fill="#f97316"/>
    <path d="M78 112c2-6 8-8 8-8s6 2 8 8" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
    <text x="110" y="116" font-size="16" font-weight="700" fill="#111827" font-family="{FONT}">An-movie Agent</text>
    <rect x="820" y="98" width="92" height="28" rx="14" fill="#eef2ff"/>
    <text x="866" y="117" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b" font-family="{FONT}">会话</text>
    <rect x="924" y="98" width="120" height="28" rx="14" fill="#eef2ff"/>
    <text x="984" y="117" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b" font-family="{FONT}">已登录</text>
    <rect x="72" y="156" width="976" height="78" rx="12" fill="#ffffff" stroke="#ede9fe"/>
    <text x="92" y="186" font-size="20" font-weight="700" fill="#111827" font-family="{FONT}">为你挑选你喜欢的电影</text>
    <text x="92" y="210" font-size="13" fill="#64748b" font-family="{FONT}">口味、演员或关系 — 编排层选择 Search 或 Relation，再落到 TMDB。</text>
    <rect x="700" y="176" width="158" height="28" rx="14" fill="#eef2ff"/>
    <text x="779" y="195" text-anchor="middle" font-size="11" font-weight="700" fill="#4338ca" font-family="{FONT}">科幻大片 · 2小时内</text>
    <rect x="868" y="176" width="158" height="28" rx="14" fill="#eef2ff"/>
    <text x="947" y="195" text-anchor="middle" font-size="11" font-weight="700" fill="#4338ca" font-family="{FONT}">轻松爱情片</text>
    <rect x="488" y="252" width="560" height="52" rx="14" fill="#ede9fe"/>
    <text x="508" y="274" font-size="11" font-weight="700" fill="#4b5563" font-family="{FONT}">你</text>
    <text x="508" y="292" font-size="14" fill="#1f1f23" font-family="{FONT}">莱昂纳多和汤姆·哈迪共同出演过哪些电影？</text>
    <text x="72" y="268" font-size="11" font-weight="700" fill="#64748b" font-family="{FONT}">SSE stage · 不进消息列表</text>
    <rect x="72" y="278" width="86" height="24" rx="8" fill="#dcfce7"/>
    <text x="115" y="294" text-anchor="middle" font-size="11" font-weight="700" fill="#166534" font-family="{FONT}">intent</text>
    <rect x="166" y="278" width="78" height="24" rx="8" fill="#dbeafe"/>
    <text x="205" y="294" text-anchor="middle" font-size="11" font-weight="700" fill="#1e40af" font-family="{FONT}">plan</text>
    <rect x="252" y="278" width="86" height="24" rx="8" fill="#ffedd5"/>
    <text x="295" y="294" text-anchor="middle" font-size="11" font-weight="700" fill="#9a3412" font-family="{FONT}">tool x2</text>
    <rect x="346" y="278" width="78" height="24" rx="8" fill="#ede9fe"/>
    <text x="385" y="294" text-anchor="middle" font-size="11" font-weight="700" fill="#5b21b6" font-family="{FONT}">agent</text>
    <rect x="72" y="322" width="976" height="248" rx="14" fill="#f0f4f8"/>
    <text x="92" y="348" font-size="11" font-weight="700" fill="#4b5563" font-family="{FONT}">助手</text>
    <text x="92" y="372" font-size="14" fill="#1f2937" font-family="{FONT}">RelationAgent 走 compute：两份作品表求交。空交集也是成功，不会编一部「他们应该合作过」的片子。</text>
    <g transform="translate(92,392)">
      <rect width="220" height="154" rx="16" fill="#ffffff"/>
      <rect width="220" height="88" rx="16" fill="url(#poster1)"/>
      <rect y="72" width="220" height="16" fill="#ffffff"/>
      <text x="14" y="28" font-size="11" fill="#c7d2fe" font-family="{FONT}">2010 · 8.8</text>
      <text x="14" y="52" font-size="16" font-weight="700" fill="#ffffff" font-family="{FONT}">盗梦空间</text>
      <text x="16" y="112" font-size="13" font-weight="700" fill="#0f172a" font-family="{FONT}">Inception</text>
      <text x="16" y="132" font-size="11" fill="#475569" font-family="{FONT}">同片出演 · TMDB credits</text>
    </g>
    <g transform="translate(332,392)">
      <rect width="220" height="154" rx="16" fill="#ffffff"/>
      <rect width="220" height="88" rx="16" fill="url(#poster2)"/>
      <rect y="72" width="220" height="16" fill="#ffffff"/>
      <text x="14" y="28" font-size="11" fill="#fed7aa" font-family="{FONT}">2015 · 8.0</text>
      <text x="14" y="52" font-size="16" font-weight="700" fill="#ffffff" font-family="{FONT}">荒野猎人</text>
      <text x="16" y="112" font-size="13" font-weight="700" fill="#0f172a" font-family="{FONT}">The Revenant</text>
      <text x="16" y="132" font-size="11" fill="#475569" font-family="{FONT}">同片出演 · 可回源</text>
    </g>
    <g transform="translate(572,392)">
      <rect width="220" height="154" rx="16" fill="#ffffff" stroke="#e2e8f0"/>
      <rect x="16" y="20" width="72" height="20" rx="10" fill="#eef2ff"/>
      <text x="52" y="34" text-anchor="middle" font-size="10" font-weight="700" fill="#4338ca" font-family="{FONT}">final</text>
      <text x="16" y="68" font-size="13" font-weight="700" fill="#0f172a" font-family="{FONT}">先 CompleteTurn</text>
      <text x="16" y="90" font-size="13" font-weight="700" fill="#0f172a" font-family="{FONT}">再推 SSE final</text>
      <text x="16" y="118" font-size="12" fill="#64748b" font-family="{FONT}">气泡 = 写入 payload</text>
      <text x="16" y="138" font-size="12" fill="#64748b" font-family="{FONT}">text + 海报卡片</text>
    </g>
    <g transform="translate(812,392)">
      <rect width="212" height="154" rx="16" fill="#111827"/>
      <text x="16" y="36" font-size="11" fill="#94a3b8" font-family="{FONT}">GROUNDING</text>
      <text x="16" y="64" font-size="14" font-weight="700" fill="#ffffff" font-family="{FONT}">不是模型背影单</text>
      <text x="16" y="92" font-size="12" fill="#cbd5e1" font-family="{FONT}">person_search → credits</text>
      <text x="16" y="114" font-size="12" fill="#cbd5e1" font-family="{FONT}">本地交并差 · 0 次额外 LLM</text>
      <text x="16" y="136" font-size="12" fill="#fbbf24" font-family="{FONT}">每张卡片可回源 TMDB</text>
    </g>
    <rect x="72" y="588" width="976" height="72" rx="16" fill="#ffffff" stroke="#e5e7eb"/>
    <text x="92" y="622" font-size="14" fill="#94a3b8" font-family="{FONT}">输入观影偏好、演员或心情…</text>
    <rect x="908" y="606" width="116" height="36" rx="18" fill="#4f46e5"/>
    <text x="966" y="628" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff" font-family="{FONT}">发送</text>
  </g>
</svg>''',
)


write(
    "architecture.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 780" role="img" aria-label="An-movie Agent runtime architecture">
  <defs>
    <linearGradient id="page" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <filter id="glow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect width="1120" height="780" fill="url(#page)"/>
  <text x="56" y="52" font-size="13" letter-spacing="3" fill="#818cf8" font-family="{FONT}">RUNTIME</text>
  <text x="56" y="86" font-size="28" font-weight="700" fill="#f8fafc" font-family="{FONT}">一眼看完的请求路径</text>
  <text x="56" y="116" font-size="14" fill="#94a3b8" font-family="{FONT}">边缘是 HTTP，服务之间是 gRPC。推荐从 TMDB 取回，不从模型权重里「回忆」。</text>
  <text x="56" y="162" font-size="11" letter-spacing="2" fill="#64748b" font-family="{FONT}">EXPERIENCE</text>
  <g filter="url(#glow)">
    <rect x="56" y="176" width="1008" height="88" rx="16" fill="#111827" stroke="#334155"/>
  </g>
  <text x="84" y="214" font-size="18" font-weight="700" fill="#ffffff" font-family="{FONT}">React 18 · Vite · MUI</text>
  <text x="84" y="240" font-size="13" fill="#94a3b8" font-family="{FONT}">streamChat() 读 SSE · stage 只改加载文案 · final 才进气泡</text>
  <rect x="760" y="200" width="132" height="40" rx="10" fill="#312e81"/>
  <text x="826" y="225" text-anchor="middle" font-size="12" font-weight="700" fill="#c7d2fe" font-family="{FONT}">POST /movie/chat</text>
  <rect x="904" y="200" width="132" height="40" rx="10" fill="#1e3a5f"/>
  <text x="970" y="225" text-anchor="middle" font-size="12" font-weight="700" fill="#93c5fd" font-family="{FONT}">Bearer JWT</text>
  <text x="56" y="298" font-size="11" letter-spacing="2" fill="#64748b" font-family="{FONT}">EDGE</text>
  <g filter="url(#glow)">
    <rect x="56" y="312" width="1008" height="64" rx="16" fill="#0f172a" stroke="#334155"/>
  </g>
  <text x="84" y="352" font-size="16" font-weight="700" fill="#e2e8f0" font-family="{FONT}">nginx</text>
  <text x="168" y="352" font-size="13" fill="#94a3b8" font-family="{FONT}">/api/auth :3002    /api/movie :3001    /api/message :3003    chat 关缓冲 · 超时 300s</text>
  <text x="56" y="412" font-size="11" letter-spacing="2" fill="#64748b" font-family="{FONT}">DOMAIN SERVICES · NESTJS 10</text>
  <g filter="url(#glow)">
    <rect x="56" y="426" width="320" height="168" rx="16" fill="#111827" stroke="#f97316"/>
  </g>
  <text x="76" y="458" font-size="12" fill="#fdba74" font-family="{FONT}">AUTH · :3002 / gRPC :50051</text>
  <text x="76" y="488" font-size="20" font-weight="700" fill="#ffffff" font-family="{FONT}">auth-service</text>
  <text x="76" y="518" font-size="13" fill="#cbd5e1" font-family="{FONT}">注册 / 登录 / 签发 JWT</text>
  <text x="76" y="542" font-size="13" fill="#cbd5e1" font-family="{FONT}">ValidateToken 给兄弟服务验票</text>
  <text x="76" y="566" font-size="13" fill="#64748b" font-family="{FONT}">身份不进推荐请求体</text>
  <g filter="url(#glow)">
    <rect x="400" y="426" width="320" height="168" rx="16" fill="#1e1b4b" stroke="#818cf8"/>
  </g>
  <text x="420" y="458" font-size="12" fill="#c7d2fe" font-family="{FONT}">MOVIE · :3001  * 主编排</text>
  <text x="420" y="488" font-size="20" font-weight="700" fill="#ffffff" font-family="{FONT}">movie-service</text>
  <text x="420" y="518" font-size="13" fill="#c7d2fe" font-family="{FONT}">Orchestrator · Search · Relation</text>
  <text x="420" y="542" font-size="13" fill="#c7d2fe" font-family="{FONT}">WorkingSet 本轮内存 · 精简视图进 LLM</text>
  <text x="420" y="566" font-size="13" fill="#818cf8" font-family="{FONT}">开流后只推 SSE，没有 JSON 成功体</text>
  <g filter="url(#glow)">
    <rect x="744" y="426" width="320" height="168" rx="16" fill="#111827" stroke="#22d3ee"/>
  </g>
  <text x="764" y="458" font-size="12" fill="#67e8f9" font-family="{FONT}">MESSAGE · :3003 / gRPC :50052</text>
  <text x="764" y="488" font-size="20" font-weight="700" fill="#ffffff" font-family="{FONT}">message-service</text>
  <text x="764" y="518" font-size="13" fill="#a5f3fc" font-family="{FONT}">会话 / 轮次 / turn_events</text>
  <text x="764" y="542" font-size="13" fill="#a5f3fc" font-family="{FONT}">Milvus 相似摘要检索</text>
  <text x="764" y="566" font-size="13" fill="#64748b" font-family="{FONT}">metadata user-id · 只允许主人</text>
  <text x="400" y="612" font-size="11" fill="#64748b" font-family="{FONT}">gRPC</text>
  <text x="470" y="612" font-size="12" fill="#cbd5e1" font-family="{FONT}">movie &lt;-&gt; auth · movie &lt;-&gt; message · message &lt;-&gt; auth</text>
  <text x="56" y="648" font-size="11" letter-spacing="2" fill="#64748b" font-family="{FONT}">INTELLIGENCE  AND  STATE</text>
  <g filter="url(#glow)">
    <rect x="56" y="662" width="240" height="78" rx="14" fill="#0f172a" stroke="#334155"/>
  </g>
  <text x="76" y="694" font-size="15" font-weight="700" fill="#ffffff" font-family="{FONT}">SiliconFlow</text>
  <text x="76" y="718" font-size="12" fill="#94a3b8" font-family="{FONT}">LLM + Embedding</text>
  <g filter="url(#glow)">
    <rect x="312" y="662" width="240" height="78" rx="14" fill="#0f172a" stroke="#334155"/>
  </g>
  <text x="332" y="694" font-size="15" font-weight="700" fill="#ffffff" font-family="{FONT}">TMDB</text>
  <text x="332" y="718" font-size="12" fill="#94a3b8" font-family="{FONT}">search / discover / credits</text>
  <g filter="url(#glow)">
    <rect x="568" y="662" width="240" height="78" rx="14" fill="#0f172a" stroke="#334155"/>
  </g>
  <text x="588" y="694" font-size="15" font-weight="700" fill="#ffffff" font-family="{FONT}">PostgreSQL</text>
  <text x="588" y="718" font-size="12" fill="#94a3b8" font-family="{FONT}">用户 · 会话 · 气泡 JSONB</text>
  <g filter="url(#glow)">
    <rect x="824" y="662" width="240" height="78" rx="14" fill="#0f172a" stroke="#334155"/>
  </g>
  <text x="844" y="694" font-size="15" font-weight="700" fill="#ffffff" font-family="{FONT}">Milvus</text>
  <text x="844" y="718" font-size="12" fill="#94a3b8" font-family="{FONT}">推荐摘要向量回忆</text>
</svg>''',
)


write(
    "agent-pipeline.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 420" role="img" aria-label="An-movie Agent orchestrator pipeline">
  <defs>
    <linearGradient id="pipe" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#eef2ff"/>
    </linearGradient>
  </defs>
  <rect width="1120" height="420" fill="url(#pipe)"/>
  <text x="40" y="40" font-size="13" letter-spacing="3" fill="#6366f1" font-family="{FONT}">ORCHESTRATOR</text>
  <text x="40" y="72" font-size="24" font-weight="700" fill="#0f172a" font-family="{FONT}">一次提问，一条可观测流水线</text>
  <text x="40" y="100" font-size="14" fill="#64748b" font-family="{FONT}">域外直接拒绝。关系题能算就算。Tool 原文进 WorkingSet，汇总只看证据视图。</text>
  <rect x="40" y="132" width="196" height="120" rx="16" fill="#ffffff" stroke="#c7d2fe"/>
  <text x="56" y="164" font-size="11" font-weight="700" fill="#6366f1" font-family="{FONT}">1 · INTENT</text>
  <text x="56" y="194" font-size="16" font-weight="700" fill="#0f172a" font-family="{FONT}">意图分类</text>
  <text x="56" y="220" font-size="12" fill="#475569" font-family="{FONT}">in_scope / out_of_scope</text>
  <text x="56" y="238" font-size="12" fill="#475569" font-family="{FONT}">unknown 立刻短路</text>
  <path d="M244 192h28" stroke="#818cf8" stroke-width="3" stroke-linecap="round"/>
  <path d="M264 184l12 8-12 8" fill="none" stroke="#818cf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="280" y="132" width="196" height="120" rx="16" fill="#ffffff" stroke="#c7d2fe"/>
  <text x="296" y="164" font-size="11" font-weight="700" fill="#6366f1" font-family="{FONT}">2 · PLAN</text>
  <text x="296" y="194" font-size="16" font-weight="700" fill="#0f172a" font-family="{FONT}">任务规划</text>
  <text x="296" y="220" font-size="12" fill="#475569" font-family="{FONT}">agents + 可选 relation</text>
  <text x="296" y="238" font-size="12" fill="#475569" font-family="{FONT}">非法 relation 收成 search</text>
  <path d="M484 192h28" stroke="#818cf8" stroke-width="3" stroke-linecap="round"/>
  <path d="M504 184l12 8-12 8" fill="none" stroke="#818cf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="520" y="132" width="280" height="120" rx="16" fill="#1e1b4b"/>
  <text x="536" y="164" font-size="11" font-weight="700" fill="#c7d2fe" font-family="{FONT}">3 · EXECUTE</text>
  <text x="536" y="194" font-size="16" font-weight="700" fill="#ffffff" font-family="{FONT}">双路径执行</text>
  <text x="536" y="222" font-size="12" fill="#c7d2fe" font-family="{FONT}">Search：LLM 规划 1–4 个 TMDB 工具</text>
  <text x="536" y="242" font-size="12" fill="#c7d2fe" font-family="{FONT}">Relation：discover / compute，不再调模型</text>
  <path d="M808 192h28" stroke="#818cf8" stroke-width="3" stroke-linecap="round"/>
  <path d="M828 184l12 8-12 8" fill="none" stroke="#818cf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="844" y="132" width="236" height="120" rx="16" fill="#ffffff" stroke="#c7d2fe"/>
  <text x="860" y="164" font-size="11" font-weight="700" fill="#6366f1" font-family="{FONT}">4 · SYNTHESIZE</text>
  <text x="860" y="194" font-size="16" font-weight="700" fill="#0f172a" font-family="{FONT}">视图汇总</text>
  <text x="860" y="220" font-size="12" fill="#475569" font-family="{FONT}">证据视图 → {{ text, movies }}</text>
  <text x="860" y="238" font-size="12" fill="#475569" font-family="{FONT}">先落库再推 final</text>
  <rect x="40" y="276" width="336" height="112" rx="14" fill="#ffffff" stroke="#e2e8f0"/>
  <text x="56" y="308" font-size="13" font-weight="700" fill="#0f172a" font-family="{FONT}">WorkingSet 不是 Prompt</text>
  <text x="56" y="334" font-size="13" fill="#475569" font-family="{FONT}">Tool 完整结果只活在本轮内存。</text>
  <text x="56" y="356" font-size="13" fill="#475569" font-family="{FONT}">raw_result 不准进副本，也不进模型。</text>
  <text x="56" y="378" font-size="13" fill="#475569" font-family="{FONT}">publish 只给精简 AgentEvidenceView。</text>
  <rect x="392" y="276" width="336" height="112" rx="14" fill="#ffffff" stroke="#e2e8f0"/>
  <text x="408" y="308" font-size="13" font-weight="700" fill="#0f172a" font-family="{FONT}">Relation 是集合运算</text>
  <text x="408" y="334" font-size="13" fill="#475569" font-family="{FONT}">discover：一次 movie_discover</text>
  <text x="408" y="356" font-size="13" fill="#475569" font-family="{FONT}">compute：作品表交 / 并 / 差</text>
  <text x="408" y="378" font-size="13" fill="#475569" font-family="{FONT}">失败且本轮没跑 Search → fallback</text>
  <rect x="744" y="276" width="336" height="112" rx="14" fill="#111827"/>
  <text x="760" y="308" font-size="13" font-weight="700" fill="#ffffff" font-family="{FONT}">模型调用次数可控</text>
  <text x="760" y="334" font-size="13" fill="#cbd5e1" font-family="{FONT}">意图 1 + 规划 1 + 汇总 1</text>
  <text x="760" y="356" font-size="13" fill="#cbd5e1" font-family="{FONT}">仅 Search 再加一次选工具</text>
  <text x="760" y="378" font-size="13" fill="#fbbf24" font-family="{FONT}">Relation 成功路径没有第四次 LLM</text>
</svg>''',
)
