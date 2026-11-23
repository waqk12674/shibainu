// 柴犬（換毛期） の Worker
//   /api/scores → 全国ランキング（D1: env.DB。歴代とデイリーの TOP100）
//   /en/        → 英語版（index.html の head を英語に書き換えて返す）
//   /api/share  → Xでシェアの結果画像を R2（env.SHARES）に保存
//   /s/<id>     → 共有ページ（index.html の OGP をその回の結果画像にして返す）。/s/<id>.jpg は画像（手本は sanma）
//   それ以外    → 静的ファイル（wrangler.jsonc の run_worker_first にないパスは、この Worker を通らない）
// 先頭に /shibainu が付いて届くのは waqk.jp のルートから、付かないのは workers.dev・wrangler dev から。手本は sarumo-kikara
import { checkName } from './name-filter.js'; // 正本は C:\src\shared\name-filter.js（ここでは直さない）

const NAME_MAX = 10;
const TOP_N = 100;
const POST_INTERVAL_MS = 10_000; // 同じ人（IP）からの連投を防ぐ間隔
// ありえない記録を弾く目安。score は毛玉の直径を 0.1cm 単位にした整数（445 = 44.5cm）
const MAX_SCORE = 1400;      // 毛を全部抜いて浮き毛の分を足しても 130cm ほど
const MAX_PLUCKS = 600;
const MIN_SECS_PER = 0.15;   // 1回抜くのにかかる最短の秒数
const MAX_SECS = 900;        // 60秒＋時間ボーナス
const MAX_VOL_PER = 0.09;    // 1回で増える毛玉の体積の上限（m³。大きい浮き毛でも 0.08 ほど）

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// デイリーの始まり（日本時間 0:00）の UTC ミリ秒。端末の時計は使わない
const dayStartOf = (now) => Math.floor((now + 9 * 3600e3) / 86400e3) * 86400e3 - 9 * 3600e3;

// 端末（player）ごとの最高記録で並べる（同じ点なら先に出したほうが上）。since より前の記録は数えない（歴代は 0、デイリーは dayStart）
const top = (env, player, since) => env.DB.prepare(
  `SELECT name, score, (player = ?) AS me FROM (
     SELECT player, name, score, created_at,
            ROW_NUMBER() OVER (PARTITION BY player ORDER BY score DESC, created_at ASC) AS r
     FROM scores WHERE created_at >= ?)
   WHERE r = 1 ORDER BY score DESC, created_at ASC LIMIT ?`,
).bind(player || '', since, TOP_N).all().then((r) => r.results.map((x) => ({ name: x.name, score: x.score, me: !!x.me })));

// 歴代とデイリーを1回で返す（タブの切り替えで API を呼ばないため）
async function board(env, player) {
  const dayStart = dayStartOf(Date.now());
  const [all, daily] = await Promise.all([top(env, player, 0), top(env, player, dayStart)]);
  return { all, daily, dayStart };
}

// IPv6 は /64 で丸める（同じ回線のまま末尾を変えて別人になれないように）
function ipKey(ip) {
  if (!ip.includes(':')) return ip;
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const all = tail === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  return all.slice(0, 4).map((x) => parseInt(x, 16).toString(16)).join(':') + '::/64';
}

async function ipHash(request) {
  const ip = ipKey(request.headers.get('cf-connecting-ip') || '');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('shibainu:' + ip));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 記録がありえる範囲か。だめなら理由を返す
function checkRecord(score, plucks, secs) {
  if (!Number.isInteger(plucks) || plucks < 1 || plucks > MAX_PLUCKS) return 'bad plucks';
  if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return 'bad score';
  const r = score / 2000, vol = (4 / 3) * Math.PI * r * r * r; // 直径（m）の半分から体積
  if (vol > plucks * MAX_VOL_PER) return 'bad score';
  if (!Number.isFinite(secs) || secs < plucks * MIN_SECS_PER || secs > MAX_SECS) return 'bad time';
  return null;
}

const okPlayer = (p) => typeof p === 'string' && /^[A-Za-z0-9-]{8,40}$/.test(p);

async function scores(request, env, url) {
  if (request.method === 'GET') {
    const player = url.searchParams.get('player');
    return json(await board(env, okPlayer(player) ? player : ''));
  }
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  // 名前：制御文字・<> を除き、前後の空白を取って 10 文字まで
  const name = String(body.name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  const score = Number(body.score), plucks = Number(body.plucks), secs = Number(body.secs);
  if (!okPlayer(body.player)) return json({ error: 'bad player' }, 400);
  if (!name || [...name].length > NAME_MAX) return json({ error: 'name must be 1-10 characters' }, 400);
  if (checkName(name) === 'ng') return json({ error: 'ng_name' }, 400); // 登録できない名前（連投制限より前に判定）
  const bad = checkRecord(score, plucks, secs);
  if (bad) return json({ error: bad }, 400);

  const now = Date.now(), ip = await ipHash(request);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?')
    .bind(ip, now - POST_INTERVAL_MS).first('n');
  if (recent > 0) return json({ error: 'too many requests' }, 429);

  await env.DB.prepare('INSERT INTO scores (player, name, score, plucks, secs, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(body.player, name, score, plucks, Math.round(secs * 10) / 10, now, ip).run();
  return json(await board(env, body.player));
}

// 英語版 /en/：SNS のクローラーは JS を動かさないので、head（lang・タイトル・説明・OGP・canonical）を英語に書き換えて返す。
// 素材や api の相対パスは / と同じ場所から読むよう <base href="../"> を足す。画面の文言は <html lang="en"> を見て JS が英語にする
const EN = {
  title: 'Shedding Shiba | Pluck fur, build a giant fur ball – free browser game',
  ogTitle: 'Shedding Shiba',
  desc: "It's shedding season! Pinch and pull fur off a shiba inu without making it angry, and see how big a fur ball you can build in 60 seconds. Free browser game – no install, no sign-up, on phone or PC.",
  ogDesc: 'Pluck fur off a shedding shiba and build a giant fur ball. Make it angry and it\'s over.',
  url: 'https://waqk.jp/shibainu/en/',
};
const setAttr = (name, value) => ({ element: (el) => { el.setAttribute(name, value); } });
const dropLd = (rw) => rw.on('script[type="application/ld+json"]', { element: (el) => { el.remove(); } }); // JSON-LD は日本語版 / だけ
const englishHead = (rw) => rw
    .on('html', setAttr('lang', 'en'))
    .on('title', { element: (el) => { el.setInnerContent(EN.title); } })
    .on('meta[name="description"]', setAttr('content', EN.desc))
    .on('link[rel="canonical"]', setAttr('href', EN.url))
    .on('meta[property="og:title"]', setAttr('content', EN.ogTitle))
    .on('meta[property="og:description"]', setAttr('content', EN.ogDesc))
    .on('meta[property="og:url"]', setAttr('content', EN.url))
    .on('meta[name="twitter:title"]', setAttr('content', EN.ogTitle))
    .on('meta[name="twitter:description"]', setAttr('content', EN.ogDesc));
async function english(request, url, env) {
  const res = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  return englishHead(dropLd(new HTMLRewriter()).on('head', { element: (el) => { el.prepend('<base href="../">', { html: true }); } })).transform(res);
}
// ---------- Xでシェア（結果画像を R2 に置き、共有ページの OGP にする。手本は sanma） ----------
const PUBLIC_BASE = 'https://waqk.jp/shibainu';
const SHARE_W = 1200, SHARE_H = 630, MAX_JPEG = 200 * 1024;
const ID_RE = /^[0-9A-Za-z]{10}$/, ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const shareKey = (id) => `s/${id}.jpg`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// 手元（wrangler dev）と試験用のアドレス（workers.dev）では自分の URL、本番では waqk.jp の URL
const baseOf = (url) => (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.workers.dev') ? url.origin : PUBLIC_BASE);
// 称号（ゲームの TITLE_CM・STR.titles と同じ。直すときは両方）
const TITLE_CM = [20, 40, 60, 80, 100, Infinity];
const TITLES = {
  ja: ['初めての毛づくろい', '毛づくろい見習い', '一般的な毛づくろい', '慣れてきた毛づくろい', 'プロの毛づくろい', '伝説の毛づくろい'],
  en: ['First-time Groomer', 'Groomer in Training', 'Everyday Groomer', 'Seasoned Groomer', 'Pro Groomer', 'Legendary Groomer'],
};
// 共有ページの題と説明は、端末から送られた文字を使わず、直径（score）から作り直す（waqk.jp に任意の文字を載せられないように）
function shareText(score, L) {
  const d = (score / 10).toFixed(1), t = TITLES[L][TITLE_CM.findIndex((c) => score / 10 < c)];
  return L === 'en'
    ? { title: `A ${d} cm fur ball! | Shedding Shiba`, desc: `Title: “${t}”. Pluck fur off a shedding shiba and build a giant fur ball. Make it angry and it's over.` }
    : { title: `直径${d}cmの毛玉ができた！｜柴犬（換毛期）`, desc: `称号「${t}」。換毛期の柴犬から毛を抜いて、大きな毛玉を作ろう。怒らせたら終わり。` };
}
function newId() { return Array.from(crypto.getRandomValues(new Uint8Array(10)), (x) => ALPHABET[x % 62]).join(''); }
// JPEG の幅と高さ（SOF マーカーから読む）。JPEG でなければ null
function jpegSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 8 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}
// フォーム: img（1200×630 の JPEG）、score（直径の 0.1cm 単位）、lang
async function postShare(request, env) {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_JPEG + 4096) return json({ error: 'too large' }, 413);
  // IP ごとに1分5件まで（R2 の書き込み回数・保存量が無料枠を超えないよう、連打や悪用を止める。だし巻き・さんまと同じ）
  const { success } = await env.SHARE_RL.limit({ key: request.headers.get('cf-connecting-ip') ?? 'local' });
  if (!success) return json({ error: 'too many requests' }, 429);
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'bad form' }, 400); }
  const img = form.get('img'), lang = form.get('lang'), score = Number(form.get('score'));
  if (!(img instanceof Blob) || (lang !== 'ja' && lang !== 'en')) return json({ error: 'missing fields' }, 400);
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return json({ error: 'bad score' }, 400);
  if (img.size > MAX_JPEG) return json({ error: 'too large' }, 413);
  const bytes = new Uint8Array(await img.arrayBuffer()), size = jpegSize(bytes);
  if (!size) return json({ error: 'not a jpeg' }, 400);
  if (size.w !== SHARE_W || size.h !== SHARE_H) return json({ error: `must be ${SHARE_W}x${SHARE_H}` }, 400);
  const id = newId();
  await env.SHARES.put(shareKey(id), bytes, { httpMetadata: { contentType: 'image/jpeg' }, customMetadata: { score: String(score), lang, created: new Date().toISOString() } });
  return json({ id }, 201);
}
// 共有ページ：ゲームのトップ（index.html）の OGP を、その回の直径・称号・結果画像にして返す。開いた人はそのまま遊べる。検索には出さない
async function sharePage(request, url, env, id) {
  const base = baseOf(url);
  const obj = ID_RE.test(id) ? await env.SHARES.head(shareKey(id)) : null;
  if (!obj) return Response.redirect(`${base}/`, 302);
  const L = obj.customMetadata.lang === 'en' ? 'en' : 'ja', score = Number(obj.customMetadata.score);
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return Response.redirect(`${base}/`, 302);
  const { title, desc } = shareText(score, L), image = `${base}/s/${id}.jpg`;
  // /s/<id> は1階層深いので、相対パスの素材や api をトップから読ませる
  let rw = dropLd(new HTMLRewriter()).on('head', { element: (el) => { el.prepend(`<base href="${esc(base)}/">`, { html: true }); } });
  if (L === 'en') rw = englishHead(rw); // 英語で作った共有は、/en/ と同じく英語の画面にする
  rw = rw
    .on('meta[property="og:title"]', setAttr('content', title))
    .on('meta[property="og:description"]', setAttr('content', desc))
    .on('meta[property="og:url"]', setAttr('content', `${base}/s/${id}`))
    .on('meta[property="og:image"]', setAttr('content', image))
    .on('meta[name="twitter:title"]', setAttr('content', title))
    .on('meta[name="twitter:description"]', setAttr('content', desc))
    .on('meta[name="twitter:image"]', setAttr('content', image))
    .on('head', { element: (el) => { el.append('<meta name="robots" content="noindex">\n', { html: true }); } });
  const res = rw.transform(await env.ASSETS.fetch(new Request(new URL('/', url), request)));
  return new Response(res.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
}
// 画像：作った後は変わらないので長くキャッシュさせる。2回目からはエッジのキャッシュから返し、R2 を読まない
async function shareImage(request, env, ctx, id) {
  if (!ID_RE.test(id)) return new Response('Not found', { status: 404 });
  const cache = caches.default, key = new Request(request.url);
  const hit = await cache.match(key);
  if (hit) return hit;
  const obj = await env.SHARES.get(shareKey(id));
  if (!obj) return new Response('Not found', { status: 404 });
  const res = new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=2592000, immutable', etag: obj.httpEtag } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/shibainu(?=\/)/, '');
    if (path === '/api/scores') {
      try { return await scores(request, env, url); } catch { return json({ error: 'server error' }, 500); }
    }
    if (path === '/api/share') {
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      try { return await postShare(request, env); } catch { return json({ error: 'server error' }, 500); }
    }
    const s = ['GET', 'HEAD'].includes(request.method) && path.match(/^\/s\/([^/.]+)(\.jpg)?$/);
    if (s) return s[2] ? shareImage(request, env, ctx, s[1]) : sharePage(request, url, env, s[1]);
    // /en → /en/（相対の Location なので、waqk.jp では /shibainu/en/ になる）
    if (path === '/en') return new Response(null, { status: 301, headers: { Location: 'en/' + url.search } });
    if (path === '/en/' && ['GET', 'HEAD'].includes(request.method)) return english(request, url, env);
    return env.ASSETS.fetch(request);
  },
};
