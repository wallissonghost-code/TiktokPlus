import http from "node:http";
import { analyzeProfile } from "./services/profile-analysis.js";
import { ENGINE_VERSION, ENGINE_VERSION_LABEL } from "./version.js";
import { inspectPublicTikTokVideo } from "./providers/tiktok-public.js";
import { analyzeVideoBatch } from "./services/video-batch-analysis.js";

const PORT = Number(process.env.PORT || 3000);

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*"
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendHtml(res, html) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

const TEST_PAGE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Teste TikTok Engine</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0b0b0c;color:#f5f5f5;font-family:system-ui,-apple-system,sans-serif;padding:24px}
main{max-width:760px;margin:8vh auto}h1{font-size:28px;margin:0 0 8px}p{color:#999;margin:0 0 24px}.title{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.version{font-size:12px;font-weight:700;color:#999;background:#171719;border:1px solid #2d2d30;border-radius:999px;padding:4px 8px;letter-spacing:.03em}
form{display:grid;gap:10px}.field{display:flex;gap:10px}input{flex:1;min-width:0;background:#151517;border:1px solid #333;border-radius:12px;padding:15px;color:#fff;font-size:16px;outline:none}
button{border:0;border-radius:12px;padding:0 20px;font-weight:700;cursor:pointer}.result{position:relative;margin-top:22px}.copy{position:absolute;top:10px;right:10px;width:40px;height:40px;padding:0;background:#1b1b1e;border:1px solid #343438;color:#ddd;display:grid;place-items:center;z-index:2}.copy svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2}.copy:active{transform:scale(.94)}.copy.copied{background:#22c55e;border-color:#22c55e;color:#07130a}pre{margin:0;background:#111113;border:1px solid #242426;border-radius:12px;padding:58px 16px 16px;overflow:auto;white-space:pre-wrap;word-break:break-word;min-height:100px;color:#ddd}
@media(max-width:520px){.field{flex-direction:column}button{padding:15px}}
</style>
</head>
<body><main>
<div class="title"><h1>TikTok Engine</h1><span class="version">${ENGINE_VERSION_LABEL}</span></div>
<p>Página mínima para testar o motor público.</p>
<form id="form"><div class="field"><input id="username" autocomplete="off" placeholder="@usuario"><button type="button" id="profileBtn">Analisar @</button></div><div class="field"><input id="videoUrl" autocomplete="off" inputmode="url" placeholder="Link do vídeo TikTok"><button type="button" id="videoBtn">Testar vídeo</button></div><div class="field"><input id="batchUrls" autocomplete="off" placeholder="Links curtos separados por espaço"><button type="button" id="batchBtn">Comparar links</button></div><div class="field"><button type="button" id="sampleBtn">Testar Partes 6, 7 e 8</button></div></form>
<div class="result"><button class="copy" id="copy" type="button" aria-label="Copiar resultado"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"></rect><rect x="4" y="4" width="12" height="12" rx="2"></rect></svg></button><pre id="out">Aguardando teste…</pre></div>
<script>
const input=document.getElementById("username"),videoUrl=document.getElementById("videoUrl"),batchUrls=document.getElementById("batchUrls"),profileBtn=document.getElementById("profileBtn"),videoBtn=document.getElementById("videoBtn"),batchBtn=document.getElementById("batchBtn"),sampleBtn=document.getElementById("sampleBtn"),out=document.getElementById("out"),copy=document.getElementById("copy");
let lastTouchEnd=0;document.addEventListener("gesturestart",e=>e.preventDefault(),{passive:false});document.addEventListener("touchend",e=>{const now=Date.now();if(now-lastTouchEnd<=300)e.preventDefault();lastTouchEnd=now},{passive:false});
copy.onclick=async()=>{try{await navigator.clipboard.writeText(out.textContent);copy.classList.add("copied");setTimeout(()=>copy.classList.remove("copied"),1200)}catch(err){console.error("Falha ao copiar",err)}};
async function run(url){out.textContent="Coletando…";try{const r=await fetch(url);const data=await r.json();out.textContent=JSON.stringify(data,null,2)}catch(err){out.textContent="Erro: "+err.message}}
profileBtn.onclick=()=>run("/api/profile?username="+encodeURIComponent(input.value.trim()));
videoBtn.onclick=()=>run("/api/video?url="+encodeURIComponent(videoUrl.value.trim()));
batchBtn.onclick=()=>{const links=batchUrls.value.trim().split(/\\s+/).filter(Boolean);run("/api/videos?urls="+encodeURIComponent(links.join(",")))};\nsampleBtn.onclick=()=>run("/api/videos?urls="+encodeURIComponent(["https://vt.tiktok.com/ZSbYHKsGD/","https://vt.tiktok.com/ZSbY965JN/","https://vt.tiktok.com/ZSbYH3MXe/"].join(",")));
</script>
</main></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/") {
    return sendHtml(res, TEST_PAGE);
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true, service: "tiktok-plus-engine", engineVersion: ENGINE_VERSION });
  }

  if (req.method === "GET" && url.pathname === "/api/video") {
    const videoUrl = url.searchParams.get("url");
    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 15_000);
      const result = await inspectPublicTikTokVideo(videoUrl, { signal: controller.signal });
      return sendJson(res, 200, { schemaVersion: 1, engineVersion: ENGINE_VERSION, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = /invalid|must contain|required/i.test(message) ? 400 : 502;
      return sendJson(res, status, { ok: false, error: status === 400 ? "INVALID_VIDEO_URL" : "COLLECTION_FAILED", message });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/videos") {
    const urls = String(url.searchParams.get("urls") || "").split(",").map((item) => item.trim()).filter(Boolean);
    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 20_000);
      const result = await analyzeVideoBatch(urls, { signal: controller.signal });
      return sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = /required|maximum|invalid/i.test(message) ? 400 : 502;
      return sendJson(res, status, { ok: false, error: status === 400 ? "INVALID_VIDEO_URLS" : "COLLECTION_FAILED", message });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/profile") {
    const username = url.searchParams.get("username");
    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 15_000);
      const result = await analyzeProfile(username, { signal: controller.signal });
      return sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = /username|required|invalid/i.test(message) ? 400 : 502;
      return sendJson(res, status, {
        ok: false,
        error: status === 400 ? "INVALID_USERNAME" : "COLLECTION_FAILED",
        message
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  return sendJson(res, 404, { ok: false, error: "NOT_FOUND" });
});

server.listen(PORT, () => {
  console.log(`TikTok Plus Engine listening on :${PORT}`);
});
