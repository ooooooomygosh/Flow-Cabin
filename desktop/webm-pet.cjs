'use strict';
// Read bounded container metadata only. Chromium does the video decode; imported
// files never provide code, URLs, paths or an executable entry point.
function webmInfo(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 32 || bytes.length > 16 * 1024 * 1024) throw Error('WebM 大小无效');
  let entries = 0, scale = 1000000, duration = 0, doc = '', video = null;
  function vint(at, keepMarker = false) {
    if (at >= bytes.length) throw Error('WebM 数据不完整');
    let length = 1, mask = 128; while (length <= 8 && !(bytes[at] & mask)) { length++; mask >>= 1; }
    if (length > 8 || at + length > bytes.length || (keepMarker && length > 4)) throw Error('WebM 元素无效');
    let value = BigInt(keepMarker ? bytes[at] : bytes[at] & (mask - 1));
    for (let i = 1; i < length; i++) value = value * 256n + BigInt(bytes[at + i]);
    const unknown = !keepMarker && value === (1n << BigInt(7 * length)) - 1n;
    if (!unknown && value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('WebM 元素过大');
    return { length, value: unknown ? null : Number(value) };
  }
  const uint = (start, end) => { if (end - start > 6) throw Error('WebM 数值过大'); let v = 0; for (let i = start; i < end; i++) v = v * 256 + bytes[i]; return v; };
  function walk(start, end, depth = 0, track = null) {
    if (depth > 6) throw Error('WebM 层级无效');
    while (start < end) {
      if (++entries > 50000) throw Error('WebM 元素过多');
      const id = vint(start, true); start += id.length; const size = vint(start); start += size.length;
      if (size.value === null && ![0x18538067, 0x1f43b675].includes(id.value)) throw Error('WebM 长度缺失');
      const stop = size.value === null ? end : start + size.value;
      if (stop > end || stop > bytes.length) throw Error('WebM 数据越界');
      if (id.value === 0x4282) doc = bytes.toString('ascii', start, stop);
      else if (id.value === 0x2ad7b1) scale = uint(start, stop);
      else if (id.value === 0x4489) { if (![4,8].includes(stop-start)) throw Error('WebM 时长无效'); duration = stop-start === 4 ? bytes.readFloatBE(start) : bytes.readDoubleBE(start); }
      else if (id.value === 0xae) { const item = {}; walk(start, stop, depth+1, item); if (item.type === 1) { if (video) throw Error('仅接受单路宠物视频'); video = item; } else throw Error('宠物 WebM 不应包含音轨'); }
      else if ([0x1a45dfa3,0x18538067,0x1549a966,0x1654ae6b,0xe0].includes(id.value)) walk(start, stop, depth+1, track);
      else if (id.value === 0x1941a469) throw Error('WebM 不应包含附件');
      else if (track) {
        if (id.value === 0x86) track.codec = bytes.toString('ascii', start, stop);
        else if (id.value === 0x83) track.type = uint(start, stop);
        else if (id.value === 0xb0) track.width = uint(start, stop);
        else if (id.value === 0xba) track.height = uint(start, stop);
        else if (id.value === 0x53c0) track.alpha = uint(start, stop);
      }
      start = stop;
    }
  }
  walk(0, bytes.length);
  const seconds = duration * scale / 1e9;
  if (doc !== 'webm' || !video || !['V_VP8','V_VP9'].includes(video.codec) || video.alpha !== 1 || !(video.width >= 16 && video.width <= 2048 && video.height >= 16 && video.height <= 2048) || !(seconds > 0 && seconds <= 30)) throw Error('需要带透明通道、无声、30 秒以内、尺寸 16–2048 的 VP8/VP9 WebM');
  return { width: video.width, height: video.height, seconds, codec: video.codec };
}
module.exports = { webmInfo };
