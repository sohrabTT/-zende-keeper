const SITES = [
  "https://kalleria.site/",
  "https://kalleria.site/app",
];

export default {
  async scheduled(event, env, ctx) {
    const results = await Promise.allSettled(
      SITES.map(url =>
        fetch(url).then(r => ({
          url,
          status: r.status,
          ok: r.ok,
        }))
      )
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        console.log(`[OK] ${result.value.url} -> ${result.value.status}`);
      } else {
        console.error(`[FAIL] ${result.reason?.message}`);
      }
    }
  },

  async fetch(request, env, ctx) {
    const url = request.nextUrl?.searchParams?.get("url");
    if (url) {
      const res = await fetch(url);
      return new Response(`Pinged: ${url} -> ${res.status}`, { status: 200 });
    }
    return new Response("Render Keep Alive is running!", { status: 200 });
  },
};
