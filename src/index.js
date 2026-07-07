const SITES = [
  { name: "صفحه اصلی", url: "https://kalleria.site/", path: "/" },
  { name: "برنامه", url: "https://kalleria.site/app", path: "/app" },
];

const HISTORY_SIZE = 50;

async function ping(url, timeoutMs = 25000) {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const ms = Math.round(performance.now() - start);
    return { ok: res.ok, status: res.status, ms, error: null };
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    return { ok: false, status: 0, ms, error: err.name === "AbortError" ? "تایم‌اوت" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async scheduled(event, env, ctx) {
    const now = Date.now();
    const batch = [];

    for (const site of SITES) {
      const result = await ping(site.url);
      batch.push({ name: site.name, url: site.url, ...result, time: now });
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

    if (url.searchParams.has("ping")) {
      const target = url.searchParams.get("ping");
      const result = await ping(target);
      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
    }

    const rows = [];
    for (const site of SITES) {
      const [lastRaw, histRaw] = await Promise.all([
        env.STATUS_KV.get(`last:${site.url}`),
        env.STATUS_KV.get(`hist:${site.url}`),
      ]);
      let last = null, hist = [];
      if (lastRaw) try { last = JSON.parse(lastRaw); } catch {}
      if (histRaw) try { hist = JSON.parse(histRaw); } catch {}
      const lastUp = hist.find((h) => h.ok);
      rows.push({ ...site, last, hist, lastUp });
    }

    const now = new Date();
    const cards = rows
      .map((r) => {
        const d = r.last;
        const lastUpTime = r.lastUp ? r.lastUp.time : null;
        let isUp = false;
        let label = "";
        let color = "";
        let note = "";

        if (d?.ok) {
          isUp = true;
          label = "فعال ✅";
          color = "#22c55e";
        } else if (d?.error === "تایم‌اوت") {
          label = "در حال بیدار شدن ⏳";
          color = "#f59e0b";
          note = "درخواست بیدارسازی ارسال شد";
        } else if (d && !d.ok && r.hist.length > 1 && r.hist[1]?.ok) {
          label = "در حال بیدار شدن ⏳";
          color = "#f59e0b";
          note = "زمان پاسخ بیشتر از حد مجاز";
        } else {
          label = "مشکل ❌";
          color = "#ef4444";
          note = d?.error || "خطای نامشخص";
        }

        const time = d
          ? new Date(d.time).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })
          : "---";
        const statusText = d?.ok
          ? d.status
          : note;
        const ms = d ? `${d.ms}ms` : "---";
        const lastUpText = lastUpTime
          ? new Date(lastUpTime).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })
          : "---";

        return `
    <div class="card status-${color.slice(1)}">
      <div class="card-header">
        <span class="name">${r.name}</span>
        <span class="badge" style="background:${color}">${label}</span>
      </div>
      <div class="card-body">
        <div class="row"><span>آدرس</span><span class="mono">${r.url}</span></div>
        <div class="row"><span>وضعیت</span><span>${statusText}</span></div>
        <div class="row"><span>زمان پاسخ</span><span>${ms}</span></div>
        <div class="row"><span>آخرین بررسی</span><span>${time}</span></div>
        <div class="row"><span>آخرین وضعیت سالم</span><span>${lastUpText}</span></div>
      </div>
      ${r.hist.length > 0 ? `
      <details class="hist-details">
        <summary>تاریخچه (${r.hist.length} بررسی)</summary>
        <div class="hist-list">
          ${r.hist
            .slice(0, 10)
            .map(
              (h) => `
          <div class="hist-item ${h.ok ? "ok" : "fail"}">
            <span>${new Date(h.time).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}</span>
            <span>${h.ok ? h.status : (h.error || h.status || "✗")}</span>
            <span>${h.ms}ms</span>
          </div>`
            )
            .join("")}
        </div>
      </details>` : ""}
    </div>`;
      })
      .join("\n");

    const upCount = rows.filter((r) => r.last?.ok).length;
    const total = rows.length;

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
  .sub{color:#888;font-size:.9rem;margin-bottom:8px}
  .uptime-bar{display:flex;gap:6px;margin-bottom:28px;width:100%;max-width:700px}
  .uptime-bar .seg{flex:1;height:4px;border-radius:2px}
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
  .hist-details{margin-top:12px;padding-top:12px;border-top:1px solid #222}
  .hist-details summary{cursor:pointer;color:#666;font-size:.85rem;padding:4px 0}
  .hist-details summary:hover{color:#999}
  .hist-list{display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:200px;overflow-y:auto}
  .hist-item{display:flex;justify-content:space-between;font-size:.75rem;padding:4px 8px;border-radius:4px;font-family:'Cascadia Code','Fira Code',monospace;direction:ltr}
  .hist-item.ok{background:#132c1a;color:#4ade80}
  .hist-item.fail{background:#2c1313;color:#f87171}
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
  <div class="sub">${upCount}/${total} سایت فعال • بررسی هر ۵ دقیقه</div>
  <div class="container">
${cards}
  </div>
  <div class="time">بروزرسانی: ${now.toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}</div>
  <div class="footer">
    <a href="/" class="btn">🔄 بروزرسانی صفحه</a>
    <a href="https://github.com/sohrabTT/-zende-keeper" class="btn">📦 سورس کد</a>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
