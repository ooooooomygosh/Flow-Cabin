var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// music-upstream.ts
var music_upstream_exports = {};
__export(music_upstream_exports, {
  audioProxyHeadersFor: () => audioProxyHeadersFor,
  call: () => call,
  getNeteaseLoginInfo: () => getNeteaseLoginInfo,
  getQQLoginInfo: () => getQQLoginInfo,
  getQQMediaMid: () => getQQMediaMid,
  handleQQPlaylistTracks: () => handleQQPlaylistTracks,
  handleQQSearch: () => handleQQSearch,
  handleQQSongUrl: () => handleQQSongUrl,
  handleQQUserPlaylists: () => handleQQUserPlaylists,
  handleSearch: () => handleSearch,
  handleSongUrl: () => handleSongUrl,
  mapQQSearchSong: () => mapQQSearchSong,
  neteasePlaylistTracks: () => neteasePlaylistTracks,
  neteaseUserPlaylists: () => neteaseUserPlaylists,
  normalizeLoginInfo: () => normalizeLoginInfo,
  parseCookieString: () => parseCookieString,
  qqCookieMusicKey: () => qqCookieMusicKey,
  qqCookieUin: () => qqCookieUin,
  qqSearchShapes: () => qqSearchShapes,
  resetQQSearchPreference: () => resetQQSearchPreference,
  searchQQSongs: () => searchQQSongs,
  trackCover: () => trackCover
});
module.exports = __toCommonJS(music_upstream_exports);

// vendor/simple-music/server/lib/qq-client.ts
var rec = (v) => typeof v === "object" && v !== null ? v : {};
var str = (v) => v === null || v === void 0 ? "" : String(v);
var numOf = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
var arr = (v) => Array.isArray(v) ? v : [];
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var QQ_MUSICU_URL = "https://u.y.qq.com/cgi-bin/musicu.fcg";
var QQ_HEADERS = {
  Referer: "https://y.qq.com/",
  "User-Agent": UA
};
var QQ_QUALITY_CANDIDATE_TEMPLATES = [
  { prefix: "RS01", ext: ".flac", level: "hires", label: "Hi-Res FLAC" },
  { prefix: "F000", ext: ".flac", level: "lossless", label: "\u65E0\u635F FLAC" },
  { prefix: "M800", ext: ".mp3", level: "exhigh", label: "320k MP3" },
  { prefix: "M500", ext: ".mp3", level: "standard", label: "128k MP3" },
  { prefix: "C400", ext: ".m4a", level: "aac", label: "AAC/M4A" }
];
async function requestText(targetUrl, opts = {}, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timeout")), 1e4);
  try {
    const response = await fetch(targetUrl, {
      method: opts.method || "GET",
      headers: opts.headers || {},
      body,
      signal: controller.signal
    });
    const text = await response.text();
    if (response.status >= 400) {
      const err = new Error("HTTP " + response.status);
      err.statusCode = response.status;
      err.body = text;
      throw err;
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}
function parseJSONText(text) {
  const raw = String(text || "").trim();
  const json = raw.replace(/^callback\(([\s\S]*)\);?$/, "$1");
  return JSON.parse(json);
}
function parseCookieString(cookieText) {
  const out = {};
  String(cookieText || "").split(";").forEach((part) => {
    const raw = String(part || "").trim();
    if (!raw) return;
    const idx = raw.indexOf("=");
    if (idx <= 0) return;
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}
function normalizeQQUin(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}
function qqCookieUin(obj) {
  const raw = Number(obj.login_type) === 2 ? obj.wxuin || obj.uin || obj.p_uin : obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin;
  return normalizeQQUin(raw);
}
function qqCookieMusicKey(obj) {
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey || obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token || obj.wxskey || "";
}
function qqCookiePlaybackKey(obj) {
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || "";
}
function qqAuthComm(cookie) {
  const cookieObj = parseCookieString(cookie);
  const uin = qqCookieUin(cookieObj) || "0";
  const musicKey = qqCookieMusicKey(cookieObj);
  const comm = {
    uin,
    format: "json",
    ct: musicKey ? 19 : 24,
    cv: 0
  };
  if (musicKey) comm.authst = musicKey;
  return comm;
}
function decodeQQCookieValue(value) {
  try {
    return decodeURIComponent(String(value || "").replace(/\+/g, "%20")).trim();
  } catch {
    return String(value || "").trim();
  }
}
function qqCookieNickname(obj, uinInput) {
  const uin = normalizeQQUin(uinInput || qqCookieUin(obj));
  const padded = uin ? "0" + uin : "";
  const keys = [
    uin && "ptnick_" + uin,
    padded && "ptnick_" + padded
  ].filter(Boolean);
  for (const key of keys) {
    if (obj[key]) {
      const nick = decodeQQCookieValue(obj[key]);
      if (nick) return nick;
    }
  }
  return "";
}
function qqCookieAvatar(obj, uinInput) {
  const direct = obj.qqmusic_avatar || obj.avatar || obj.avatarUrl || obj.headpic || "";
  if (direct) return decodeQQCookieValue(direct);
  const uin = normalizeQQUin(uinInput || qqCookieUin(obj));
  return uin ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=100` : "";
}
function playbackRestriction(provider, category, message, action, extra) {
  return {
    provider,
    category,
    action: action || "",
    message,
    ...extra || {}
  };
}
function classifyQQPlaybackRestriction(info, session, feeHint) {
  const sessionObj = typeof session === "object" ? session : { hasSession: !!session, hasPlaybackKey: !!session };
  const hasSession = !!sessionObj.hasSession;
  const hasPlaybackKey = typeof session === "object" ? !!sessionObj.hasPlaybackKey : hasSession;
  const infoRec = rec(info);
  const rawMsg = String(
    infoRec.msg || infoRec.tips || infoRec.errmsg || infoRec.message || ""
  ).trim();
  const code = Number(infoRec.result || infoRec.code || infoRec.errtype || 0);
  const lower = rawMsg.toLowerCase();
  if (!hasSession) {
    return playbackRestriction("qq", "login_required", "QQ \u97F3\u4E50\u9700\u8981\u767B\u5F55\u6216\u6388\u6743\u540E\u624D\u80FD\u83B7\u53D6\u64AD\u653E\u5730\u5740", "login", {
      code,
      rawMessage: rawMsg
    });
  }
  if (!hasPlaybackKey && code === 104003) {
    return playbackRestriction(
      "qq",
      "login_required",
      "QQ \u97F3\u4E50\u5F53\u524D\u53EA\u62FF\u5230\u4E86\u7F51\u9875\u767B\u5F55\u72B6\u6001\uFF0C\u8FD8\u7F3A\u5C11\u64AD\u653E\u6388\u6743\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u5B98\u65B9 QQ \u97F3\u4E50\u767B\u5F55\u7A97\u53E3\u5B8C\u6210\u6388\u6743",
      "login",
      { code, rawMessage: rawMsg, missingPlaybackKey: true }
    );
  }
  if (code === 104003 && feeHint) {
    return playbackRestriction(
      "qq",
      "paid_required",
      "QQ \u97F3\u4E50\u663E\u793A\u8FD9\u9996\u6B4C\u662F\u4ED8\u8D39/\u4F1A\u5458\u66F2\u76EE\uFF0C\u9700\u8981\u5F00\u901A\u4F1A\u5458\u6216\u8D2D\u4E70\u540E\u624D\u80FD\u64AD\u653E\uFF0C\u4E5F\u53EF\u4EE5\u6362\u4E00\u9996\u6216\u5207\u5230\u7F51\u6613\u4E91\u6E90",
      "upgrade",
      { code, rawMessage: rawMsg }
    );
  }
  if (code === 104003) {
    return playbackRestriction(
      "qq",
      "copyright_unavailable",
      "QQ \u97F3\u4E50\u6CA1\u6709\u7ED9\u5F53\u524D\u7248\u672C\u8FD4\u56DE\u64AD\u653E\u5730\u5740\uFF0C\u901A\u5E38\u662F\u7248\u6743\u3001\u4F1A\u5458\u6216\u5B98\u65B9\u7248\u672C\u9650\u5236\uFF0C\u53EF\u4EE5\u6362\u4E00\u4E2A\u641C\u7D22\u7ED3\u679C\u6216\u5207\u5230\u7F51\u6613\u4E91\u6E90",
      "switch_source",
      { code, rawMessage: rawMsg }
    );
  }
  if (/vip|会员|付费|购买|数字专辑|专辑|pay/.test(lower + rawMsg)) {
    return playbackRestriction("qq", "paid_required", "QQ \u97F3\u4E50\u6B4C\u66F2\u9700\u8981\u4F1A\u5458\u3001\u8D2D\u4E70\u6216\u6570\u5B57\u4E13\u8F91\u6743\u9650", "upgrade", {
      code,
      rawMessage: rawMsg
    });
  }
  if (code && code !== 0) {
    return playbackRestriction(
      "qq",
      "copyright_unavailable",
      rawMsg || "QQ \u97F3\u4E50\u7248\u6743\u6682\u4E0D\u53EF\u64AD\u6216\u4EC5\u5B98\u65B9\u5BA2\u6237\u7AEF\u53EF\u64AD",
      "switch_source",
      { code, rawMessage: rawMsg }
    );
  }
  return playbackRestriction(
    "qq",
    "url_unavailable",
    "QQ \u97F3\u4E50\u6CA1\u6709\u8FD4\u56DE\u64AD\u653E\u5730\u5740\uFF0C\u53EF\u80FD\u53D7\u7248\u6743\u3001\u4F1A\u5458\u6216\u5B98\u65B9\u5BA2\u6237\u7AEF\u9650\u5236",
    "switch_source",
    { code, rawMessage: rawMsg }
  );
}
function normalizeQualityPreference(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (["max", "best", "highest", "auto"].includes(raw)) return "max";
  if (["jymaster", "master", "studio", "svip"].includes(raw)) return "jymaster";
  if (["hires", "hi-res", "highres", "zhenyin", "spatial"].includes(raw)) return "hires";
  if (["lossless", "flac", "sq"].includes(raw)) return "lossless";
  if (["exhigh", "high", "higher", "medium", "192", "192k", "320", "320k", "hq"].includes(raw)) return "exhigh";
  if (["standard", "normal", "128", "128k", "std"].includes(raw)) return "standard";
  if (["aac", "m4a", "c400"].includes(raw)) return "aac";
  return "hires";
}
function qualityCandidatesFrom(target, candidates) {
  const t = normalizeQualityPreference(target);
  let start = candidates.findIndex((item) => item.level === t);
  if (start < 0) start = 0;
  return candidates.slice(start);
}
var QQ_LIKED_PLAYLIST_ID = "qq-liked:201";
var QQ_TOPLIST_PREFIX = "qq-toplist:";
function isQQLikedPlaylistReference(value) {
  return String(value || "").trim() === QQ_LIKED_PLAYLIST_ID;
}
function qqAuthErrorStatus(error) {
  const statusCode = Number(rec(error).statusCode);
  if (statusCode === 401 || statusCode === 403) return statusCode;
  const message = error instanceof Error ? error.message : str(error);
  if (message === "AUTH_REQUIRED") return 401;
  if (message === "AUTH_EXPIRED") return 403;
  return null;
}
function isQQNumericPlaylistId(value) {
  const id = String(value ?? "").trim();
  return /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
}
function qqPlaylistReference(value) {
  const id = String(value || "").trim();
  if (isQQLikedPlaylistReference(id)) return { kind: "liked", id: "201" };
  if (id.startsWith(QQ_TOPLIST_PREFIX)) {
    return { kind: "toplist", id: id.slice(QQ_TOPLIST_PREFIX.length) };
  }
  return { kind: "playlist", id };
}
function isQQFavoritePlaylist(raw) {
  return String(raw.dirid ?? raw.dirId ?? "").trim() === "201";
}
function isQzoneBackgroundPlaylist(pl) {
  const text = String((pl && pl.name || "") + " " + (pl && pl.creator || "")).toLowerCase();
  return /qzone|空间|背景音乐/i.test(text);
}
function qqAlbumCover(albumMid, size) {
  if (!albumMid) return "";
  const px = size || 300;
  return "https://y.qq.com/music/photo_new/T002R" + px + "x" + px + "M000" + albumMid + ".jpg?max_age=2592000";
}
function pickQQImageUrl(...values) {
  for (const value of values) {
    const raw = str(value).trim();
    if (!raw) continue;
    const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return normalized;
    } catch {
    }
  }
  return "";
}
function pickQQPlaylistCover(detail, tracks) {
  const playlist = rec(detail);
  return pickQQImageUrl(
    playlist.logo,
    playlist.diss_cover,
    playlist.cover,
    ...tracks.map((track) => rec(track).cover)
  );
}
function mapQQArtists(raw) {
  return arr(raw).map((a) => {
    const o = rec(a);
    const mid = str(o.mid || o.singerMid || o.singermid);
    return {
      id: mid || null,
      mid,
      qqArtistId: o.id || o.singerId || o.singerID || "",
      name: str(o.name || o.title || o.singerName)
    };
  }).filter((a) => a.name);
}
function mapQQTrack(track, fallback) {
  const t = rec(track);
  const fb = rec(fallback);
  const album = rec(t.album);
  const rawArtists = t.singer || [];
  const artists = mapQQArtists(rawArtists);
  const displayArtists = artists.length ? artists : mapQQArtists(fb.artists);
  const linkedArtist = displayArtists.find((artist) => artist.mid);
  const mid = str(t.mid || fb.mid || fb.songmid);
  const albumMid = str(album.mid || album.pmid);
  const pay = rec(t.pay);
  return {
    provider: "qq",
    source: "qq",
    type: "qq",
    id: mid,
    qqId: t.id || fb.qqId || fb.id || "",
    mid,
    songmid: mid,
    mediaMid: rec(t.file).media_mid,
    name: str(t.name || t.title || fb.name),
    artist: artists.map((a) => a.name).join(" / ") || str(fb.artist) || displayArtists.map((a) => a.name).join(" / "),
    artists: displayArtists,
    artistId: linkedArtist?.id,
    artistMid: linkedArtist?.mid,
    album: str(album.name || album.title || fb.album),
    albumMid,
    cover: qqAlbumCover(albumMid, 300) || str(fb.cover),
    duration: numOf(t.interval) * 1e3,
    fee: pay && numOf(pay.pay_play) ? 1 : 0,
    playable: false
  };
}
function mapQQPlaylist(raw, kind) {
  const pl = rec(raw);
  const upstreamId = pl.dissid || pl.tid || pl.dirid || pl.id || pl.diss_id;
  const playlist = {
    provider: "qq",
    source: "qq",
    id: upstreamId ? String(upstreamId) : "",
    name: str(pl.diss_name || pl.name || pl.title),
    cover: pickQQImageUrl(pl.diss_cover, pl.logo, pl.picurl, pl.cover),
    trackCount: numOf(pl.song_cnt || pl.songnum || pl.total_song_num || pl.song_count),
    playCount: numOf(pl.listen_num || pl.visitnum || pl.play_count),
    creator: str(pl.hostname || pl.nick || pl.creator) || "QQ \u97F3\u4E50",
    subscribed: kind === "collect",
    specialType: 0
  };
  if (isQQFavoritePlaylist(pl)) {
    playlist.id = QQ_LIKED_PLAYLIST_ID;
  }
  return playlist;
}
function mapQQPlaylistTrack(raw) {
  const r = rec(raw);
  const track = r.songid || r.songmid || r.mid || r.name ? r : rec(r.track_info || r.songInfo || r.songinfo || r.song);
  const album = rec(track.album);
  const artists = mapQQArtists(track.singer || track.singers || []);
  const linkedArtist = artists.find((artist) => artist.mid);
  const mid = str(track.mid || track.songmid || r.mid || r.songmid);
  const albumMid = str(album.mid || track.albummid || r.albummid);
  const pay = rec(track.pay);
  return {
    provider: "qq",
    source: "qq",
    type: "qq",
    id: mid,
    qqId: track.id || track.songid || r.id || r.songid || "",
    mid,
    songmid: mid,
    mediaMid: str(rec(track.file).media_mid || track.strMediaMid || track.media_mid || r.strMediaMid),
    name: str(track.name || track.songname || r.songname),
    artist: artists.map((a) => a.name).join(" / ") || str(track.singername || r.singername),
    artists,
    artistId: linkedArtist?.id,
    artistMid: linkedArtist?.mid,
    album: str(album.name || album.title || track.albumname || r.albumname),
    albumMid,
    cover: qqAlbumCover(albumMid, 300),
    duration: numOf(track.interval || r.interval) * 1e3,
    fee: pay && numOf(pay.pay_play) ? 1 : 0,
    playable: false
  };
}
async function qqMusicRequest(cookie, payload, opts = {}) {
  const body = JSON.stringify(payload);
  const headers = {
    ...QQ_HEADERS,
    "Content-Type": "application/json;charset=UTF-8",
    "Content-Length": String(Buffer.byteLength(body))
  };
  if (opts.cookie && cookie) headers.Cookie = cookie;
  const text = await requestText(QQ_MUSICU_URL, { method: "POST", headers }, body);
  return parseJSONText(text);
}
async function qqGetJSON(cookie, targetUrl, params = {}, opts = {}) {
  const u = new URL(targetUrl);
  Object.keys(params).forEach((k) => {
    if (params[k] != null) u.searchParams.set(k, String(params[k]));
  });
  const headers = { ...QQ_HEADERS, ...opts.headers || {} };
  if (opts.cookie !== false && cookie) headers.Cookie = cookie;
  const text = await requestText(u.toString(), { headers });
  return parseJSONText(text);
}
function normalizeQQProfile(cookie, body, cookieObj) {
  const uin = qqCookieUin(cookieObj);
  const b = rec(body);
  const data = rec(b.data || b.profile || b.creator || b.result);
  const creator = rec(data.creator || data.user || data.profile || data);
  const vipInfo = rec(data.vipInfo || data.vipinfo || data.vip || creator.vipInfo || creator.vipinfo);
  const profileNick = str(
    creator.nick || creator.nickname || creator.name || creator.hostname || creator.title
  );
  const profileAvatar = str(creator.headpic || creator.avatar || creator.avatarUrl || creator.logo);
  const cookieNick = qqCookieNickname(cookieObj, uin);
  const nick = profileNick || cookieNick || "";
  const avatar = profileAvatar || qqCookieAvatar(cookieObj, uin);
  let vipType = Number(
    cookieObj.vipType || cookieObj.vip_type || data.vipType || data.vip_type || data.viptype || data.music_vip_level || data.green_vip_level || data.luxury_vip_level || creator.vipType || creator.vip_type || creator.music_vip_level || creator.green_vip_level || creator.luxury_vip_level || vipInfo.vipType || vipInfo.vip_type || vipInfo.music_vip_level || vipInfo.green_vip_level || vipInfo.luxury_vip_level || 0
  ) || 0;
  if (!vipType) {
    const vipFlag = data.isVip || data.is_vip || data.vipFlag || data.vipflag || creator.isVip || creator.is_vip || vipInfo.isVip || vipInfo.is_vip || vipInfo.vipFlag;
    if (vipFlag === true || Number(vipFlag) > 0 || String(vipFlag || "").toLowerCase() === "true") {
      vipType = 1;
    }
  }
  return {
    provider: "qq",
    loggedIn: !!(uin && qqCookieMusicKey(cookieObj)),
    preview: false,
    userId: uin,
    nickname: nick,
    avatar,
    vipType,
    hasCookie: !!cookie,
    playbackKeyReady: !!qqCookiePlaybackKey(cookieObj),
    profileSource: profileNick || profileAvatar ? "qq-profile" : cookieNick || avatar ? "cookie" : "fallback"
  };
}
async function getQQLoginInfo(cookie) {
  const cookieObj = parseCookieString(cookie);
  const uin = qqCookieUin(cookieObj);
  const musicKey = qqCookieMusicKey(cookieObj);
  if (!uin || !musicKey) return { provider: "qq", loggedIn: false, hasCookie: !!cookie };
  const fallback = normalizeQQProfile(cookie, null, cookieObj);
  try {
    const u = new URL("https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg");
    u.searchParams.set("cid", "205360838");
    u.searchParams.set("userid", uin);
    u.searchParams.set("reqfrom", "1");
    u.searchParams.set("g_tk", "5381");
    u.searchParams.set("loginUin", uin);
    u.searchParams.set("hostUin", "0");
    u.searchParams.set("format", "json");
    u.searchParams.set("inCharset", "utf8");
    u.searchParams.set("outCharset", "utf-8");
    u.searchParams.set("notice", "0");
    u.searchParams.set("platform", "yqq.json");
    u.searchParams.set("needNewCode", "0");
    const text = await requestText(u.toString(), {
      headers: { ...QQ_HEADERS, Cookie: cookie }
    });
    const body = rec(parseJSONText(text));
    const info = normalizeQQProfile(cookie, body, cookieObj);
    if (body && (body.code === 1e3 || body.result === 301)) {
      return { ...fallback, loggedIn: false, profileUnavailable: true };
    }
    return info;
  } catch (e) {
    return { ...fallback, profileUnavailable: true };
  }
}
async function handleQQUserPlaylists(cookie) {
  const info = await getQQLoginInfo(cookie);
  if (!info.loggedIn || !info.userId) return { loggedIn: false, provider: "qq", playlists: [] };
  const uin = info.userId;
  const createdReq = qqGetJSON(
    cookie,
    "https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss",
    {
      hostUin: 0,
      hostuin: uin,
      sin: 0,
      size: 200,
      g_tk: 5381,
      loginUin: uin,
      format: "json",
      inCharset: "utf8",
      outCharset: "utf-8",
      notice: 0,
      platform: "yqq.json",
      needNewCode: 0
    },
    { headers: { Referer: "https://y.qq.com/portal/profile.html" } }
  );
  const collectReq = qqGetJSON(
    cookie,
    "https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg",
    { ct: 20, cid: 205360956, userid: uin, reqtype: 3, sin: 0, ein: 80 },
    { headers: { Referer: "https://y.qq.com/portal/profile.html" } }
  );
  const [createdRaw, collectRaw] = await Promise.allSettled([createdReq, collectReq]);
  const warnings = [];
  let confirmed = 0;
  const readList = (result, key, label) => {
    const body = result.status === "fulfilled" ? rec(result.value) : {}, data = rec(body.data);
    if (result.status !== "fulfilled" || body.code != null && Number(body.code) !== 0 || body.result != null && Number(body.result) !== 0 || !Array.isArray(data[key])) {
      warnings.push(`${label}\u672A\u80FD\u8BFB\u53D6`);
      return [];
    }
    confirmed++;
    return data[key];
  };
  const created = readList(createdRaw, "disslist", "\u81EA\u5EFA\u6B4C\u5355").map((pl) => mapQQPlaylist(pl, "created"));
  const collected = readList(collectRaw, "cdlist", "\u6536\u85CF\u6B4C\u5355").map((pl) => mapQQPlaylist(pl, "collect"));
  if (!created.concat(collected).some((pl) => pl.id === QQ_LIKED_PLAYLIST_ID)) {
    try {
      const liked = await handleQQLikedPlaylist(cookie);
      if (liked.loggedIn !== true || !liked.playlist) return { loggedIn: false, provider: "qq", playlists: [] };
      created.unshift({ ...rec(liked.playlist), kind: "liked" });
      confirmed++;
    } catch (error) {
      if (qqAuthErrorStatus(error)) return { loggedIn: false, provider: "qq", playlists: [] };
      warnings.push("\u6211\u559C\u6B22\u7684\u97F3\u4E50\u672A\u80FD\u8BFB\u53D6");
    }
  }
  if (!confirmed) throw new Error("QQ \u97F3\u4E50\u6B4C\u5355\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u6216\u91CD\u65B0\u767B\u5F55\u3002");
  const seen = /* @__PURE__ */ new Set();
  const playlists = created.concat(collected).filter((pl) => {
    if (!pl.id || !pl.name || seen.has(pl.id)) return false;
    if (isQzoneBackgroundPlaylist(pl)) return false;
    seen.add(pl.id);
    return true;
  }).sort((a, b) => Number(b.id === QQ_LIKED_PLAYLIST_ID) - Number(a.id === QQ_LIKED_PLAYLIST_ID));
  return { loggedIn: true, provider: "qq", userId: uin, playlists, warning: warnings.length ? `${warnings.join("\uFF1B")}\u3002\u5DF2\u8BFB\u53D6\u7684\u6B4C\u5355\u4FDD\u7559\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\u3002` : "" };
}
var QQ_PLAYLIST_PAGE_SIZE = 100;
var QQ_PLAYLIST_MAX_PAGES = 100;
function qqHasLoginCookie(cookie) {
  const cookieObj = parseCookieString(cookie);
  return !!(qqCookieUin(cookieObj) && qqCookieMusicKey(cookieObj));
}
function qqPlaylistTotal(data, detail) {
  return numOf(
    data.total_song_num || data.songlist_size || data.totalNum || detail.total_song_num || detail.songlist_size || detail.totalNum
  );
}
function qqPageHasMore(data, offset, rawCount, total) {
  const marker = data.hasmore ?? data.hasMore;
  if (marker !== void 0) return marker === true || Number(marker) > 0;
  if (total > 0) return offset + rawCount < total;
  return rawCount >= QQ_PLAYLIST_PAGE_SIZE;
}
async function fetchQQDissPage(cookie, ref, offset, num = QQ_PLAYLIST_PAGE_SIZE) {
  const liked = ref.kind === "liked";
  if (!liked && !isQQNumericPlaylistId(ref.id)) throw new Error("Invalid QQ playlist id");
  const json = rec(
    await qqMusicRequest(
      cookie,
      {
        comm: qqAuthComm(cookie),
        playlist: {
          module: "music.srfDissInfo.DissInfo",
          method: "CgiGetDiss",
          param: {
            disstid: liked ? 0 : Number(ref.id),
            dirid: liked ? 201 : 0,
            tag: true,
            song_begin: offset,
            song_num: num,
            userinfo: true,
            orderlist: true,
            onlysonglist: false
          }
        }
      },
      { cookie: true }
    )
  );
  const block = rec(json.playlist);
  if (json.code != null && Number(json.code) !== 0) throw new Error("QQ_PLAYLIST_DETAIL_FAILED");
  if (!json.playlist || Number(block.code || 0) !== 0) {
    const code = Number(block.code || block.result || 0);
    const message = str(block.message || block.msg);
    if (liked && qqHasLoginCookie(cookie) && ([301, 1e3, 2e3].includes(code) || /auth|cookie|login|登录|未登陆|过期|失效|票据/i.test(message))) {
      const error = new Error("AUTH_EXPIRED");
      error.statusCode = 403;
      throw error;
    }
    throw new Error(message || "QQ_PLAYLIST_DETAIL_FAILED");
  }
  const data = rec(block.data);
  if (!Array.isArray(data.songlist) || !data.dirinfo || typeof data.dirinfo !== "object" || Array.isArray(data.dirinfo)) throw new Error("QQ_PLAYLIST_DETAIL_INVALID");
  return { data, detail: rec(data.dirinfo), rawTracks: arr(data.songlist) };
}
async function fetchQQToplistPage(cookie, topId, offset, num = QQ_PLAYLIST_PAGE_SIZE) {
  if (!/^\d+$/.test(topId)) throw new Error("Invalid QQ toplist id");
  const json = rec(
    await qqMusicRequest(
      cookie,
      {
        comm: qqAuthComm(cookie),
        toplist: {
          module: "music.musicToplist.Toplist",
          method: "GetDetail",
          param: { topId: Number(topId), offset, num, withTags: true }
        }
      },
      { cookie: true }
    )
  );
  const block = rec(json.toplist);
  if (!json.toplist || Number(block.code || 0) !== 0) {
    throw new Error(str(block.message || block.msg) || "QQ_TOPLIST_DETAIL_FAILED");
  }
  const data = rec(block.data);
  return { data, detail: rec(data.data), rawTracks: arr(data.songInfoList) };
}
async function handleQQLikedPlaylist(cookie) {
  if (!qqHasLoginCookie(cookie)) {
    return { loggedIn: false, provider: "qq", playlist: null };
  }
  const result = await fetchQQDissPage(cookie, { kind: "liked", id: "201" }, 0, 1);
  const identity = result.detail.dirid ?? result.detail.dirId;
  const title = str(result.detail.title || result.detail.name || result.detail.dissname || result.detail.diss_name).trim();
  if (identity != null && String(identity) !== "201" || !title && String(identity ?? "") !== "201") {
    throw new Error("QQ_LIKED_PLAYLIST_IDENTITY_INVALID");
  }
  const tracks = result.rawTracks.map(mapQQPlaylistTrack).filter((track) => track.name && track.mid);
  const detail = result.detail;
  return {
    loggedIn: true,
    provider: "qq",
    playlist: {
      provider: "qq",
      source: "qq",
      type: "playlist",
      id: QQ_LIKED_PLAYLIST_ID,
      name: str(detail.title || detail.name || detail.dissname || detail.diss_name) || "\u6211\u559C\u6B22\u7684\u97F3\u4E50",
      cover: pickQQPlaylistCover(detail, tracks),
      trackCount: qqPlaylistTotal(result.data, detail),
      playCount: numOf(detail.listen_num || detail.visitnum || detail.play_count),
      creator: str(detail.nick || detail.hostname || detail.creator) || "QQ \u97F3\u4E50",
      tag: "\u6536\u85CF"
    }
  };
}
async function handleQQPlaylistTracks(cookie, id) {
  const ref = qqPlaylistReference(id);
  const loggedIn = qqHasLoginCookie(cookie);
  if (!ref.id) {
    return { loggedIn, provider: "qq", error: "Missing QQ playlist id", trackIds: [], tracks: [] };
  }
  if (ref.kind === "liked" && !loggedIn) {
    return { loggedIn: false, provider: "qq", trackIds: [], tracks: [] };
  }
  const tracks = [];
  let detail = {};
  let total = 0;
  let offset = 0;
  for (let page = 0; page < QQ_PLAYLIST_MAX_PAGES; page++) {
    const result = ref.kind === "toplist" ? await fetchQQToplistPage(cookie, ref.id, offset) : await fetchQQDissPage(cookie, ref, offset);
    if (page === 0) detail = result.detail;
    total = qqPlaylistTotal(result.data, result.detail) || total;
    const mapped = result.rawTracks.map(ref.kind === "toplist" ? (raw) => mapQQTrack(raw, {}) : mapQQPlaylistTrack).filter((track) => track.name && track.mid);
    tracks.push(...mapped);
    const rawCount = result.rawTracks.length;
    if (!rawCount || !qqPageHasMore(result.data, offset, rawCount, total)) break;
    offset += rawCount;
  }
  const playlistId = ref.kind === "liked" ? QQ_LIKED_PLAYLIST_ID : ref.kind === "toplist" ? `${QQ_TOPLIST_PREFIX}${ref.id}` : ref.id;
  const playlist = {
    provider: "qq",
    source: "qq",
    type: ref.kind === "toplist" ? "toplist" : "playlist",
    id: playlistId,
    name: str(detail.title || detail.name || detail.dissname || detail.diss_name) || (ref.kind === "liked" ? "\u6211\u559C\u6B22\u7684\u97F3\u4E50" : ""),
    cover: pickQQPlaylistCover(detail, tracks),
    trackCount: total || tracks.length
  };
  return {
    loggedIn,
    provider: "qq",
    playlist,
    trackIds: tracks.map((track) => track.id),
    tracks
  };
}
async function requestQQSearch(cookie, query, searchType, limit) {
  const module2 = "music.search.SearchCgiService";
  const payload = {
    [module2]: {
      module: module2,
      method: "DoSearchForQQMusicDesktop",
      param: { search_type: searchType, query, page_num: 1, num_per_page: limit }
    }
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const json = rec(await qqMusicRequest(cookie, payload));
    const block = rec(json[module2]);
    const code = Number(json.code || 0) || Number(block.code || 0);
    if (code === 0 && json[module2]) return block;
    if (code === 2001 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }
    throw new Error(code ? `QQ_SEARCH_FAILED (${code})` : "QQ_SEARCH_FAILED");
  }
  throw new Error("QQ_SEARCH_FAILED");
}
async function handleQQSearch(cookie, keywords, limit) {
  const kw = String(keywords || "").trim();
  if (!kw) return [];
  const num = Math.max(1, Math.min(20, parseInt(String(limit || "20"), 10) || 20));
  const block = await requestQQSearch(cookie, kw, 0, num);
  const list = arr(rec(rec(rec(block.data).body).song).list);
  const mapped = list.map((raw) => mapQQTrack(raw, {})).filter((song) => song.name && song.mid);
  const seen = /* @__PURE__ */ new Set();
  return mapped.filter((song) => {
    const mid = str(song.mid);
    if (seen.has(mid)) return false;
    seen.add(mid);
    return true;
  });
}
async function handleQQSongUrl(cookie, mid, mediaMid, qualityPreference, feeHint) {
  const isFeeSong = feeHint === true || feeHint === "1" || Number(feeHint) === 1;
  const songmid = String(mid || "").trim();
  if (!songmid) return { provider: "qq", url: "", error: "MISSING_MID", message: "Missing QQ song mid" };
  const guid = String(1e7 + Math.floor(Math.random() * 9e7));
  const cookieObj = parseCookieString(cookie);
  const uin = qqCookieUin(cookieObj) || "0";
  const musicKey = qqCookieMusicKey(cookieObj);
  const playbackKey = qqCookiePlaybackKey(cookieObj);
  const fileMediaMid = String(mediaMid || "").trim();
  const requestedQuality = normalizeQualityPreference(qualityPreference);
  const mediaIds = [];
  if (fileMediaMid) mediaIds.push(fileMediaMid);
  if (songmid && !mediaIds.includes(songmid)) mediaIds.push(songmid);
  const fileCandidates = mediaIds.flatMap(
    (mediaId) => qualityCandidatesFrom(requestedQuality, QQ_QUALITY_CANDIDATE_TEMPLATES).map((item) => ({
      ...item,
      mediaId,
      filename: item.prefix + mediaId + item.ext
    }))
  );
  const filenames = fileCandidates.map((item) => item.filename);
  const param = {
    guid,
    songmid: filenames.length ? filenames.map(() => songmid) : [songmid],
    songtype: filenames.length ? filenames.map(() => 0) : [0],
    uin,
    loginflag: 1,
    platform: "20"
  };
  if (filenames.length) param.filename = filenames;
  const comm = {
    uin,
    format: "json",
    ct: musicKey ? 19 : 24,
    cv: 0
  };
  if (musicKey) comm.authst = musicKey;
  const json = rec(
    await qqMusicRequest(
      cookie,
      {
        comm,
        req_0: { module: "vkey.GetVkeyServer", method: "CgiGetVkey", param }
      },
      { cookie: true }
    )
  );
  const data = rec(rec(json.req_0).data);
  const infos = arr(data.midurlinfo);
  const playableInfos = infos.map((item) => rec(item)).filter((item) => item.purl).sort((a, b) => {
    const aIndex = fileCandidates.findIndex((candidate) => candidate.filename === a.filename);
    const bIndex = fileCandidates.findIndex((candidate) => candidate.filename === b.filename);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  });
  const info = playableInfos[0] || infos[0];
  const purl = info ? info.purl : void 0;
  if (info && purl) {
    const sips = arr(data.sip).map(str).filter(Boolean);
    if (sips.length === 0) sips.push("https://ws.stream.qqmusic.qq.com/");
    const fileMeta = fileCandidates.find((item) => item.filename === info.filename) || {};
    const seenUrls = /* @__PURE__ */ new Set();
    const candidates = playableInfos.flatMap((playable) => {
      const meta = fileCandidates.find((item) => item.filename === playable.filename) || {};
      return sips.flatMap((sip) => {
        const url = sip + str(playable.purl);
        if (!url || seenUrls.has(url)) return [];
        seenUrls.add(url);
        return [{
          url,
          trial: false,
          level: meta.level || str(playable.filename),
          quality: meta.label || str(playable.filename),
          filename: str(playable.filename)
        }];
      });
    });
    return {
      provider: "qq",
      url: sips[0] + purl,
      trial: false,
      playable: true,
      level: fileMeta.level || info.filename || "",
      quality: fileMeta.label || info.filename || "",
      filename: info.filename || "",
      candidates,
      requestedQuality
    };
  }
  const restriction = classifyQQPlaybackRestriction(
    info,
    {
      hasSession: !!(uin && musicKey),
      hasPlaybackKey: !!(uin && playbackKey)
    },
    isFeeSong
  );
  return {
    provider: "qq",
    url: "",
    playable: false,
    error: "QQ_URL_UNAVAILABLE",
    loggedIn: !!(uin && musicKey),
    playbackKeyReady: !!(uin && playbackKey),
    restriction,
    reason: restriction.category,
    message: restriction.message,
    qqCode: info && (info.result || info.code || info.errtype),
    rawMessage: info && (info.msg || info.tips || info.errmsg || ""),
    tried: fileCandidates.map((item) => item.label + " \xB7 " + item.filename),
    requestedQuality
  };
}

// vendor/simple-music/server/lib/netease-client.ts
var NCM = __toESM(require("NeteaseCloudMusicApi"));
var UA2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var ncmNs = NCM;
var ncmTable = ncmNs.default ?? ncmNs;
function call(name, params) {
  const fn = ncmTable[name];
  if (typeof fn !== "function") throw new Error(`${name} not available`);
  return fn(params);
}
function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function asObj(v) {
  return isObj(v) ? v : {};
}
function asArr(v) {
  return Array.isArray(v) ? v : [];
}
function asStr(v) {
  return v == null ? "" : String(v);
}
function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function mapArtists(raw) {
  return asArr(raw).map((a) => {
    const o = asObj(a);
    return { id: o.id, name: asStr(o.name) };
  }).filter((a) => a.name);
}
function mapSongRecord(song) {
  const s = asObj(song);
  const artists = mapArtists(s.ar ?? s.artists);
  const album = asObj(s.al ?? s.album);
  return {
    provider: "netease",
    source: "netease",
    type: "song",
    id: s.id,
    name: s.name,
    artist: artists.map((a) => a.name).join(" / "),
    artists,
    artistId: artists[0] && artists[0].id,
    album: asStr(album.name),
    cover: asStr(album.picUrl || album.coverUrl),
    duration: asNum(s.dt || s.duration),
    fee: s.fee
  };
}
function isNeteaseSongAvailable(song) {
  const item = asObj(song);
  const privilege = asObj(item.privilege);
  const songStatus = Number(item.st);
  const privilegeStatus = Number(privilege.st);
  if (Number.isFinite(songStatus) && songStatus < 0) return false;
  if (Number.isFinite(privilegeStatus) && privilegeStatus < 0) return false;
  return item.noCopyrightRcmd == null;
}
function audioProxyHeadersFor(audioUrl, range) {
  const headers = { "User-Agent": UA2, Referer: "https://music.163.com/" };
  try {
    const host = new URL(audioUrl).hostname.toLowerCase();
    if (host.includes("qq.com") || host.includes("qpic.cn")) headers.Referer = "https://y.qq.com/";
  } catch {
  }
  if (range) headers.Range = range;
  return headers;
}
function playbackRestriction2(provider, category, message, action, extra) {
  return { provider, category, action: action || "", message, ...extra || {} };
}
function classifyNeteasePlaybackRestriction(lastData, loginInfo) {
  const loggedIn = !!(loginInfo && loginInfo.loggedIn);
  const d = asObj(lastData);
  const fee = Number(d.fee);
  const code = Number(d.code);
  const freeTrial = d.freeTrialInfo;
  if (!loggedIn) {
    return playbackRestriction2("netease", "login_required", "\u7F51\u6613\u4E91\u9700\u8981\u767B\u5F55\u540E\u5C1D\u8BD5\u83B7\u53D6\u5B8C\u6574\u64AD\u653E\u5730\u5740", "login", { code, fee });
  }
  if (freeTrial) {
    return playbackRestriction2("netease", "trial_only", "\u7F51\u6613\u4E91\u4EC5\u8FD4\u56DE\u8BD5\u542C\u7247\u6BB5\uFF0C\u5B8C\u6574\u64AD\u653E\u9700\u8981\u4F1A\u5458\u6216\u8D2D\u4E70", "upgrade", { code, fee });
  }
  if (fee === 1) {
    return playbackRestriction2("netease", "vip_required", "\u7F51\u6613\u4E91\u6B4C\u66F2\u9700\u8981 VIP \u6743\u9650\uFF0C\u5F53\u524D\u65E0\u6CD5\u83B7\u53D6\u5B8C\u6574\u64AD\u653E\u5730\u5740", "upgrade", { code, fee });
  }
  if (fee === 4 || fee === 8) {
    return playbackRestriction2("netease", "paid_required", "\u7F51\u6613\u4E91\u6B4C\u66F2\u9700\u8981\u5355\u66F2\u3001\u4E13\u8F91\u8D2D\u4E70\u6216\u66F4\u9AD8\u6743\u9650", "purchase", { code, fee });
  }
  if (code === 404 || code === 403) {
    return playbackRestriction2("netease", "copyright_unavailable", "\u7F51\u6613\u4E91\u7248\u6743\u6682\u4E0D\u53EF\u64AD\uFF0C\u6362\u6E90\u6216\u7A0D\u540E\u91CD\u8BD5\u4F1A\u66F4\u7A33", "switch_source", { code, fee });
  }
  return playbackRestriction2(
    "netease",
    "url_unavailable",
    "\u7F51\u6613\u4E91\u6CA1\u6709\u8FD4\u56DE\u53EF\u64AD\u653E\u5730\u5740\uFF0C\u53EF\u80FD\u662F\u7248\u6743\u3001\u4F1A\u5458\u6216\u5730\u533A\u9650\u5236",
    loggedIn ? "switch_source" : "login",
    { code, fee }
  );
}
var NETEASE_QUALITY_CANDIDATES = [
  { level: "jymaster", br: 1999e3, label: "\u8D85\u6E05\u6BCD\u5E26", svip: true },
  // sky/jyeffect 是音效变体档(码率高于 hires):无母带的歌请求 jymaster 时上游常降级返回 jyeffect
  { level: "sky", br: 1999e3, label: "\u6C89\u6D78\u73AF\u7ED5\u58F0", svip: true },
  { level: "jyeffect", br: 1999e3, label: "\u9CB8\u4E91\u97F3\u6548" },
  { level: "hires", br: 1999e3, label: "\u9AD8\u6E05\u81FB\u97F3" },
  { level: "lossless", br: 1411e3, label: "\u65E0\u635F" },
  { level: "exhigh", br: 999e3, label: "\u6781\u9AD8" },
  { level: "higher", br: 192e3, label: "\u8F83\u9AD8" },
  { level: "standard", br: 128e3, label: "\u6807\u51C6" }
];
function normalizeQualityPreference2(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (["max", "best", "highest", "auto"].includes(raw)) return "max";
  if (["jymaster", "master", "studio", "svip"].includes(raw)) return "jymaster";
  if (["sky", "surround"].includes(raw)) return "sky";
  if (["jyeffect", "effect"].includes(raw)) return "jyeffect";
  if (["hires", "hi-res", "highres", "zhenyin", "spatial"].includes(raw)) return "hires";
  if (["lossless", "flac", "sq"].includes(raw)) return "lossless";
  if (["exhigh", "high", "320", "320k", "hq"].includes(raw)) return "exhigh";
  if (["higher", "medium", "192", "192k"].includes(raw)) return "higher";
  if (["standard", "normal", "128", "128k", "std", "aac"].includes(raw)) return "standard";
  return "hires";
}
function qualityCandidatesFrom2(target, candidates) {
  const t = normalizeQualityPreference2(target);
  let start = candidates.findIndex((item) => item.level === t);
  if (start < 0) start = 0;
  return candidates.slice(start);
}
function hasNeteaseSvip(loginInfo) {
  return !!(loginInfo && loginInfo.loggedIn && (loginInfo.vipLevel === "svip" || loginInfo.isSvip || Number(loginInfo.vipType || 0) >= 10));
}
function firstPositiveNumberFrom(objects, keys) {
  for (const obj of objects) {
    if (!isObj(obj)) continue;
    for (const key of keys) {
      const value = Number(obj[key]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return 0;
}
function collectStringValues(value, out, depth) {
  if (depth > 4 || value == null) return out;
  if (typeof value === "string") {
    if (value) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, out, depth + 1));
    return out;
  }
  if (typeof value === "object") {
    Object.keys(value).forEach(
      (key) => collectStringValues(value[key], out, depth + 1)
    );
  }
  return out;
}
function collectVipStringValues(value, out, depth) {
  if (depth > 4 || value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((item) => collectVipStringValues(item, out, depth + 1));
    return out;
  }
  if (typeof value !== "object") return out;
  const obj = value;
  Object.keys(obj).forEach((key) => {
    const child = obj[key];
    if (/vip|svip|member|associator|privilege|right|level|package|label|title|type/i.test(key)) {
      collectStringValues(child, out, depth + 1);
    } else if (child && typeof child === "object") {
      collectVipStringValues(child, out, depth + 1);
    }
  });
  return out;
}
function normalizeNeteaseVip(profile, account, extra) {
  const p = asObj(profile);
  const a = asObj(account);
  const e = asObj(extra);
  const vipInfo = asObj(p.vipInfo || p.vipinfo || a.vipInfo || a.vipinfo || e.vipInfo || e.vipinfo);
  const objects = [a, p, vipInfo, e];
  const vipType = firstPositiveNumberFrom(objects, [
    "vipType",
    "vip_type",
    "viptype",
    "musicVipType",
    "music_vip_type",
    "musicVipLevel",
    "music_vip_level",
    "redVipLevel",
    "red_vip_level",
    "blackVipLevel",
    "black_vip_level",
    "luxuryVipLevel",
    "luxury_vip_level",
    "svipType",
    "svip_type"
  ]);
  const text = collectVipStringValues({ account: a, profile: p, vipInfo, extra: e }, [], 0).join(" ").toLowerCase();
  const svipFlag = objects.some(
    (obj) => obj.isSvip === true || obj.is_svip === true || obj.svip === true || Number(obj.isSvip || obj.is_svip || obj.svip || obj.svipType || obj.svip_type || 0) > 0
  ) || /svip|supervip|super_vip|blackvip|black_vip|黑胶svip|超级会员/.test(text);
  const vipFlag = objects.some(
    (obj) => obj.isVip === true || obj.is_vip === true || obj.vip === true || Number(obj.isVip || obj.is_vip || obj.vip || obj.vipFlag || obj.vipflag || 0) > 0
  ) || /vip|黑胶|会员/.test(text);
  const isSvip = svipFlag || vipType >= 10;
  const isVip = isSvip || vipFlag || vipType > 0;
  const vipLevel = isSvip ? "svip" : isVip ? "vip" : "none";
  return {
    vipType,
    vipLevel,
    isVip,
    isSvip,
    vipLabel: vipLevel === "svip" ? "SVIP" : vipLevel === "vip" ? "VIP" : "\u65E0VIP"
  };
}
function normalizeLoginInfo(profile, account, extra) {
  const p = asObj(profile);
  const a = asObj(account);
  const userId = p.userId || p.user_id || p.id || a.userId || a.id || "";
  if (!(userId || userId === 0)) return { loggedIn: false };
  const vip = normalizeNeteaseVip(p, a, extra);
  return {
    loggedIn: true,
    userId,
    nickname: asStr(p.nickname || p.userName) || "\u7F51\u6613\u4E91\u7528\u6237",
    avatar: asStr(p.avatarUrl || p.avatar),
    ...vip
  };
}
async function handleSearch(keywords, limit, cookie) {
  const candidateLimit = Math.min(100, Math.max(limit, limit * 4));
  const result = await call("cloudsearch", { keywords, limit: candidateLimit, cookie });
  const songs = asArr(asObj(asObj(result.body).result).songs).filter(isNeteaseSongAvailable).slice(0, limit);
  let mapped = songs.map((s) => mapSongRecord(s));
  const missing = mapped.filter((s) => !s.cover).map((s) => s.id);
  if (missing.length) {
    try {
      const dd = await call("song_detail", { ids: missing.join(","), cookie });
      const songsArr = asArr(asObj(dd.body).songs);
      const idToPic = {};
      songsArr.forEach((raw) => {
        const s = asObj(raw);
        const pic = asStr(asObj(s.al).picUrl || asObj(s.album).picUrl);
        if (pic) idToPic[String(s.id)] = pic;
      });
      mapped = mapped.map((s) => s.cover ? s : { ...s, cover: idToPic[String(s.id)] || "" });
    } catch (e) {
    }
  }
  return mapped;
}
async function handleSongUrl(id, loginInfo, qualityPreference, cookie) {
  const requestedQuality = normalizeQualityPreference2(qualityPreference);
  const svipReady = hasNeteaseSvip(loginInfo);
  const qualities = qualityCandidatesFrom2(requestedQuality, NETEASE_QUALITY_CANDIDATES).filter(
    (q) => !q.svip || svipReady
  );
  let trialFallback = null;
  let lastData = null;
  let lastError = null;
  for (const q of qualities) {
    try {
      let result;
      try {
        result = await call("song_url_v1", { id, level: q.level, cookie });
      } catch {
        result = await call("song_url", { id, br: q.br, cookie });
      }
      const d = asObj(asArr(asObj(result.body).data)[0]);
      if (Object.keys(d).length) lastData = d;
      const url = d.url;
      const freeTrial = d.freeTrialInfo;
      const actualLevel = asStr(d.level) || q.level;
      const actualMeta = NETEASE_QUALITY_CANDIDATES.find((c) => c.level === actualLevel);
      if (url && !freeTrial) {
        return {
          url: asStr(url),
          trial: false,
          playable: true,
          level: actualLevel,
          quality: actualMeta?.label ?? q.label,
          br: d.br,
          requestedQuality
        };
      }
      if (url && freeTrial && !trialFallback) {
        trialFallback = {
          url: asStr(url),
          trial: true,
          playable: true,
          level: actualLevel,
          quality: actualMeta?.label ?? q.label,
          br: d.br,
          requestedQuality,
          trialInfo: freeTrial,
          restriction: classifyNeteasePlaybackRestriction(d, loginInfo)
        };
      }
    } catch (err) {
      lastError = err;
    }
  }
  if (trialFallback) return trialFallback;
  const restriction = classifyNeteasePlaybackRestriction(lastData, loginInfo);
  return {
    url: null,
    trial: false,
    playable: false,
    reason: restriction.category,
    message: restriction.message,
    restriction,
    lastCode: lastData && lastData.code,
    fee: lastData && lastData.fee,
    error: lastError ? lastError.message : void 0,
    requestedQuality
  };
}

// music-upstream.ts
var import_node_crypto = require("node:crypto");
async function getNeteaseLoginInfo(cookie) {
  if (!cookie) return { loggedIn: false };
  for (const endpoint of ["login_status", "user_account"]) {
    try {
      const response = await call(endpoint, { cookie, timestamp: Date.now() });
      const body = asObj(response.body), data = asObj(body.data || body);
      if (response.status >= 400 || data.code != null && Number(data.code) !== 200 || body.code != null && Number(body.code) !== 200) continue;
      const info = normalizeLoginInfo(data.profile || body.profile, data.account || body.account, data);
      if (info.loggedIn) return info;
    } catch {
    }
  }
  return { loggedIn: false };
}
var NCM_PLAYLIST_LIMIT = 5e3;
var NCM_PAGE = 500;
var ok = (response) => response.status < 400 && (response.body?.code == null || Number(response.body.code) === 200);
var httpsCover = (value) => asStr(value).replace(/^http:\/\//, "https://");
async function neteaseUserPlaylists(cookie) {
  const info = await getNeteaseLoginInfo(cookie);
  const uid = asStr(info.userId);
  if (!info.loggedIn || !uid) return { loggedIn: false, provider: "netease", playlists: [] };
  const playlists = [];
  for (let offset = 0; offset < 600; offset += 100) {
    const response = await call("user_playlist", { uid, limit: 100, offset, cookie, timestamp: Date.now() });
    if (!ok(response)) throw new Error("\u7F51\u6613\u4E91\u6B4C\u5355\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u540E\u518D\u8BD5\u3002");
    const page = asArr(response.body.playlist);
    for (const raw of page) {
      const pl = asObj(raw), creator = asObj(pl.creator);
      playlists.push({
        provider: "netease",
        id: asStr(pl.id),
        name: asStr(pl.name),
        cover: httpsCover(pl.coverImgUrl),
        trackCount: asNum(pl.trackCount),
        creator: asStr(creator.nickname),
        kind: Number(pl.specialType) === 5 ? "liked" : pl.subscribed || asStr(creator.userId) !== uid ? "collect" : "created"
      });
    }
    if (!response.body.more || page.length < 100) break;
  }
  return { loggedIn: true, provider: "netease", user: asStr(info.nickname), playlists: playlists.filter((pl) => pl.id && pl.name) };
}
async function neteasePlaylistTracks(cookie, id, options = {}) {
  if (!/^\d{1,20}$/.test(id)) throw new Error("\u7F51\u6613\u4E91\u6B4C\u5355 ID \u65E0\u6548\u3002");
  const offset = options.offset ?? 0, request = options.request || call;
  if (!Number.isInteger(offset) || offset < 0 || offset >= NCM_PLAYLIST_LIMIT) throw new Error("\u6B4C\u5355\u9875\u7801\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u6B4C\u5355\u3002");
  const detail = await request("playlist_detail", { id, s: 0, cookie, timestamp: Date.now() });
  if (!ok(detail)) throw new Error(Number(detail.body?.code) === 404 ? "\u627E\u4E0D\u5230\u8FD9\u4E2A\u7F51\u6613\u4E91\u6B4C\u5355\uFF0C\u53EF\u80FD\u5DF2\u5220\u9664\u6216\u8BBE\u4E3A\u79C1\u5BC6\u3002" : "\u7F51\u6613\u4E91\u6B4C\u5355\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002");
  const pl = asObj(detail.body.playlist), creator = asObj(pl.creator), ids = asArr(pl.trackIds).map((raw) => asStr(asObj(raw).id));
  const total = asNum(pl.trackCount) || ids.length, limit = Math.min(NCM_PAGE, NCM_PLAYLIST_LIMIT - offset);
  const snapshot = (0, import_node_crypto.createHash)("sha256").update(JSON.stringify([pl.updateTime, total, ids.slice(0, NCM_PLAYLIST_LIMIT)])).digest("hex");
  const tracks = [];
  if (total > offset) {
    const response = await request("playlist_track_all", { id, limit, offset, cookie, timestamp: Date.now() });
    if (!ok(response)) throw new Error("\u8FD9\u4E00\u6279\u6B4C\u66F2\u8BFB\u53D6\u5931\u8D25\uFF0C\u5DF2\u8BFB\u53D6\u7684\u5185\u5BB9\u4ECD\u4FDD\u7559\uFF0C\u53EF\u4EE5\u91CD\u8BD5\u3002");
    const privileges = new Map(asArr(response.body.privileges).map((p) => [asStr(asObj(p).id), asObj(p)]));
    const rawSongs = asArr(response.body.songs).map(asObj), order = ids.slice(offset, offset + limit);
    const byId = new Map(rawSongs.map((song) => [asStr(song.id), song]));
    const songs = order.length ? order.map((key) => byId.get(key)).filter((song) => Boolean(song)) : rawSongs;
    if (!songs.length) throw new Error("\u8FD9\u4E00\u6279\u6CA1\u6709\u8FD4\u56DE\u53EF\u8BFB\u53D6\u7684\u6B4C\u66F2\uFF0C\u8BF7\u68C0\u67E5\u5E73\u53F0\u6743\u9650\u6216\u7A0D\u540E\u91CD\u8BD5\u3002");
    for (const [index, song] of songs.entries()) {
      const mapped = mapSongRecord(song), privilege = privileges.get(asStr(song.id));
      tracks.push({
        id: asStr(mapped.id),
        name: asStr(mapped.name),
        artist: mapped.artist,
        album: mapped.album,
        cover: httpsCover(mapped.cover),
        duration: mapped.duration,
        fee: mapped.fee,
        playlistIndex: order.length ? offset + order.indexOf(asStr(song.id)) : offset + index,
        playable: isNeteaseSongAvailable({ ...song, privilege })
      });
    }
  }
  const returnedIds = new Set(tracks.filter((track) => track.name).map((track) => track.id));
  const missingIds = ids.slice(offset, offset + limit).filter((key) => !returnedIds.has(key));
  const end = Math.min(total, offset + limit), nextOffset = end < Math.min(total, NCM_PLAYLIST_LIMIT) ? end : null;
  return {
    provider: "netease",
    playlist: { provider: "netease", id, name: asStr(pl.name), cover: httpsCover(pl.coverImgUrl), trackCount: total, creator: asStr(creator.nickname), description: asStr(pl.description).slice(0, 600) },
    tracks,
    page: { offset, nextOffset, snapshot, total, missingPages: missingIds.length ? [{ offset, ids: missingIds }] : [], limit: NCM_PLAYLIST_LIMIT, capped: total > NCM_PLAYLIST_LIMIT && nextOffset === null }
  };
}
async function getQQMediaMid(cookie, mid) {
  if (!/^[a-z\d]{14}$/i.test(mid)) return "";
  const json = asObj(await qqMusicRequest(cookie, {
    comm: { ct: 24, cv: 0 },
    songinfo: { module: "music.pf_song_detail_svr", method: "get_song_detail_yqq", param: { song_mid: mid } }
  }, { cookie: true }));
  const result = asObj(json.songinfo), track = asObj(asObj(result.data).track_info);
  if (Number(json.code || 0) !== 0 || Number(result.code || 0) !== 0 || asStr(track.mid) !== mid) return "";
  const mediaMid = asStr(asObj(track.file).media_mid);
  return /^[a-z\d]{14}$/i.test(mediaMid) ? mediaMid : "";
}
var QQ_SEARCH_MODULE = "music.search.SearchCgiService";
var preferredQQShape = 0;
var nextQQSearchAt = 0;
var QQ_SEARCH_GAP_MS = 300;
var QQ_SEARCH_COOLDOWN_MS = 1200;
function mapQQSearchSong(raw) {
  const song = asObj(raw), album = asObj(song.album), file = asObj(song.file), pay = asObj(song.pay);
  const singers = asArr(song.singer).map((value) => ({ name: asStr(asObj(value).name) })).filter((artist) => artist.name);
  const mediaMid = asStr(file.media_mid || song.strMediaMid || song.media_mid);
  return {
    mid: asStr(song.mid || song.songmid),
    name: asStr(song.name || song.title || song.songname),
    artists: singers,
    artist: singers.map((artist) => artist.name).join(" / "),
    album: asStr(album.name || album.title || song.albumname),
    mediaMid: /^[a-z\d]{14}$/i.test(mediaMid) ? mediaMid : "",
    cover: /^[a-z\d]{14}$/i.test(asStr(album.mid || album.pmid)) ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${asStr(album.mid || album.pmid)}.jpg` : "",
    duration: asNum(song.interval) * 1e3,
    fee: asNum(pay.pay_play || pay.payplay) ? 1 : 0
  };
}
var QQSearchError = class extends Error {
  code;
  constructor(code) {
    super(`QQ_SEARCH_FAILED (${code})`);
    this.code = code;
  }
};
function qqSearchShapes(options = {}) {
  const fetchText = options.fetchText || requestText;
  const post = async (payload) => {
    const body = JSON.stringify(payload);
    return asObj(parseJSONText(await fetchText(QQ_MUSICU_URL, { method: "POST", headers: { ...QQ_HEADERS, "Content-Type": "application/json;charset=UTF-8" } }, body)));
  };
  const block = (json, key) => {
    const part = asObj(json[key]), code = Number(json.code || 0) || Number(part.code || 0);
    if (code !== 0 || !json[key]) throw new QQSearchError(code || -1);
    return asArr(asObj(asObj(asObj(part.data).body).song).list);
  };
  const get = async (url, params) => {
    const target = new URL(url);
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, String(value));
    return asObj(parseJSONText(await fetchText(target.toString(), { headers: { ...QQ_HEADERS } })));
  };
  return [
    // What y.qq.com's desktop page sends: envelope key = module, no comm.
    { name: "desktop", run: async (query, limit) => block(await post({ [QQ_SEARCH_MODULE]: { module: QQ_SEARCH_MODULE, method: "DoSearchForQQMusicDesktop", param: { search_type: 0, query, page_num: 1, num_per_page: limit } } }), QQ_SEARCH_MODULE) },
    // The PC client's form (Listen1 and others): comm + req, grouped results.
    { name: "client", run: async (query, limit) => block(await post({ comm: { ct: "19", cv: "1859", uin: "0" }, req: { module: QQ_SEARCH_MODULE, method: "DoSearchForQQMusicDesktop", param: { grp: 1, num_per_page: limit, page_num: 1, query, search_type: 0 } } }), "req") },
    // The search box's suggestions: song ids, names and singers. Each is filled
    // in from the song's detail (album, length, media id), which QQ keeps
    // answering while it refuses searches, so the ranking can still check them.
    { name: "smartbox", run: async (query, limit) => {
      const json = await get("https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg", { key: query, format: "json", inCharset: "utf-8", outCharset: "utf-8", platform: "yqq.json", is_xml: 0 });
      const code = Number(json.code || 0);
      if (code !== 0) throw new QQSearchError(code);
      const items = asArr(asObj(asObj(json.data).song).itemlist).slice(0, Math.min(limit, 5)).map(asObj);
      const songs = [];
      for (const item of items) {
        const basic = { mid: item.mid, name: item.name, singer: asStr(item.singer).split(/\s*[/、]\s*/).filter(Boolean).map((name) => ({ name })) };
        try {
          const detail = await post({ comm: { ct: 24, cv: 0 }, songinfo: { module: "music.pf_song_detail_svr", method: "get_song_detail_yqq", param: { song_mid: asStr(item.mid) } } });
          const track = asObj(asObj(asObj(detail.songinfo).data).track_info);
          songs.push(asStr(track.mid) === asStr(item.mid) ? track : basic);
        } catch {
          songs.push(basic);
        }
      }
      return songs;
    } }
  ];
}
async function searchQQSongs(query, limit = 8, options = {}) {
  const keyword = String(query || "").trim();
  if (!keyword) return [];
  const count = Math.max(1, Math.min(20, Math.floor(limit) || 8));
  const shapes = qqSearchShapes(options), wait = options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const full = [preferredQQShape, 1 - preferredQQShape];
  const order = [...full, ...full, shapes.length - 1];
  let lastError = null;
  const now = options.now || Date.now;
  for (const [step, index] of order.entries()) {
    if (step) await wait(step === full.length ? 700 : 250);
    const delay = nextQQSearchAt - now();
    if (delay > 0) await wait(delay);
    nextQQSearchAt = now() + QQ_SEARCH_GAP_MS;
    try {
      const seen = /* @__PURE__ */ new Set();
      const songs = (await shapes[index].run(keyword, count)).map(mapQQSearchSong).filter((song) => /^[a-z\d]{14}$/i.test(song.mid) && song.name && !seen.has(song.mid) && seen.add(song.mid));
      if (index < full.length) preferredQQShape = index;
      return songs;
    } catch (error) {
      lastError = error;
      if (error instanceof QQSearchError && error.code === 2001) nextQQSearchAt = now() + QQ_SEARCH_COOLDOWN_MS;
    }
  }
  const code = lastError instanceof QQSearchError ? lastError.code : 0;
  throw new Error(code > 0 ? `QQ \u97F3\u4E50\u641C\u7D22\u6682\u65F6\u4E0D\u53EF\u7528\uFF08${code}\uFF09\uFF0C\u7A0D\u540E\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002` : "QQ \u97F3\u4E50\u641C\u7D22\u6682\u65F6\u8FDE\u4E0D\u4E0A\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002");
}
function resetQQSearchPreference() {
  preferredQQShape = 0;
  nextQQSearchAt = 0;
}
async function trackCover(provider, id, cookie = "") {
  if (provider === "qq" && /^[a-z\d]{14}$/i.test(id)) {
    const json = asObj(await qqMusicRequest(cookie, { comm: { ct: 24, cv: 0 }, songinfo: { module: "music.pf_song_detail_svr", method: "get_song_detail_yqq", param: { song_mid: id } } }));
    const track = asObj(asObj(asObj(json.songinfo).data).track_info), album = asObj(track.album), mid = asStr(album.mid || album.pmid);
    return asStr(track.mid) === id && /^[a-z\d]{14}$/i.test(mid) ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg` : "";
  }
  if (provider === "netease" && /^\d{1,20}$/.test(id)) {
    const response = await call("song_detail", { ids: id, cookie, timestamp: Date.now() });
    const song = asObj(asArr(asObj(response.body).songs)[0]);
    return asStr(song.id) === id ? httpsCover(asObj(song.al).picUrl) : "";
  }
  return "";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  audioProxyHeadersFor,
  call,
  getNeteaseLoginInfo,
  getQQLoginInfo,
  getQQMediaMid,
  handleQQPlaylistTracks,
  handleQQSearch,
  handleQQSongUrl,
  handleQQUserPlaylists,
  handleSearch,
  handleSongUrl,
  mapQQSearchSong,
  neteasePlaylistTracks,
  neteaseUserPlaylists,
  normalizeLoginInfo,
  parseCookieString,
  qqCookieMusicKey,
  qqCookieUin,
  qqSearchShapes,
  resetQQSearchPreference,
  searchQQSongs,
  trackCover
});
