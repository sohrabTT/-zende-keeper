const SITES = [
  { name: "صفحه اصلی", url: "https://kalleria.site/", path: "/" },
  { name: "برنامه", url: "https://kalleria.site/app", path: "/app" },
];

const HISTORY_SIZE = 20;

export default {
  async scheduled(event, env, ctx) {
    const now = Date.now();
    const batch = [];

    for (const site of SITES) {
      const start = performance.now();
      try {
        const res = await fetch(site.url);
        const ms = Math.round(performance.now() - start);
        batch.push({
          name: site.name,
          url: site.url,
          ok: res.ok,
          status: res.status,
          ms,
          time: now,
        });
      } catch (err) {
        batch.push({
          name: site.name,
          url: site.url,
          ok: false,
          status: 0,
          ms: 0,
          time: now,
          error: err.message,
        });
      }
    }

    for (const entry of batch) {
      const key = `last:${entry.url}`;
      await env.STATUS_KV.put(key, JSON.stringify(entry), { expirationTtl: 86400 });

      const histKey = `hist:${entry.url}`;
      let hist = [];
      const raw = await env.STATUS_KV.get(histKey);
      if (raw) try { hist = JSON.parse(raw); } catch {}
      hist.unshift(entry);
      if (hist.length > HISTORY_SIZE) hist.pop();
      await env.STATUS_KV.put(histKey, JSON.stringify(hist), { expirationTtl: 86400 });
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API endpoint for manual ping
    if (url.searchParams.has("ping")) {
      const target = url.searchParams.get("ping");
      const res = await fetch(target);
      return new Response(`Pinged: ${target} -> ${res.status}`, { status: 200 });
    }

    // Gather status for all sites
    const rows = [];
    for (const site of SITES) {
      const key = `last:${site.url}`;
      const raw = await env.STATUS_KV.get(key);
      rows.push({
        ...site,
        data: raw ? JSON.parse(raw) : null,
      });
    }

    const cards = rows.map((r) => {
      const d = r.data;
      const isUp = d?.ok;
      const color = isUp ? "#22c55e" : "#ef4444";
      const label = isUp ? "فعال ✅" : "مشکل ❌";
      const time = d ? new Date(d.time).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }) : "---";
      const statusText = d ? (d.status || `خطا: ${d.error || "نامشخص"}`) : "---";
      const ms = d ? `${d.ms}ms` : "---";
      return `    <div class="card">
      <div class="card-header">
        <span class="name">${r.name}</span>
        <span class="badge" style="background:${color}">${label}</span>
      </div>
      <div class="card-body">
        <div class="row"><span>آدرس</span><span class="mono">${r.url}</span></div>
        <div class="row"><span>وضعیت</span><span>${statusText}</span></div>
        <div class="row"><span>زمان پاسخ</span><span>${ms}</span></div>
        <div class="row"><span>آخرین بررسی</span><span>${time}</span></div>
      </div>
    </div>`;
    }).join("\n");

    const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>وضعیت Keep Alive</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:40px 20px}
  h1{font-size:1.5rem;font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:10px}
  .sub{color:#888;font-size:.9rem;margin-bottom:32px}
  .container{width:100%;max-width:700px;display:flex;flex-direction:column;gap:16px}
  .card{background:#141414;border:1px solid #222;border-radius:12px;padding:20px;transition:border-color .2s}
  .card:hover{border-color:#333}
  .card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
  .name{font-size:1.1rem;font-weight:500}
  .badge{padding:4px 14px;border-radius:20px;font-size:.8rem;font-weight:500;color:#fff}
  .card-body{display:flex;flex-direction:column;gap:8px}
  .row{display:flex;justify-content:space-between;align-items:center;font-size:.9rem;color:#aaa}
  .row span:first-child{color:#666}
  .mono{font-family:'Cascadia Code','Fira Code',monospace;font-size:.8rem;direction:ltr;display:inline-block}
  .time{color:#555;font-size:.8rem;margin-top:24px;text-align:center}
  .footer{margin-top:32px;display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
  .btn{background:#1a1a1a;border:1px solid #333;color:#ccc;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:.85rem;text-decoration:none;transition:all .2s}
  .btn:hover{background:#222;border-color:#555;color:#fff}
</style>
</head>
<body>
  <h1>⚡ نظارت Keep Alive
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
  </h1>
  <div class="sub">بررسی خودکار هر ۵ دقیقه</div>
  <div class="container">
${cards}
  </div>
  <div class="time">آخرین به‌روزرسانی: ${new Date().toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}</div>
  <div class="footer">
    <a href="/" class="btn">🔄 بروزرسانی</a>
    <a href="https://github.com/sohrabTT/-zende-keeper" class="btn">📦 سورس کد</a>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
