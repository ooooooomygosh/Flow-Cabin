import { createRequire } from 'node:module';
import { scheduleMusicBrainz } from './musicbrainz-scheduler.mjs';

// MusicBrainz 要求 UA 标明应用与版本；版本从 desktop/package.json 读，避免写死过期号。
const { version: APP_VERSION } = createRequire(import.meta.url)('./package.json');

// Album and song search: iTunes Search, with track lists and MusicBrainz /
// Cover Art Archive enrichment. Runs inside the desktop client.
function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[’']/g, '')
    .replace(/遊/g, '游')
    .replace(/臺/g, '台');
}

function searchAliases(value) {
  const text = String(value || '').trim();
  const aliases = new Set([text]);
  if (text.includes('游')) aliases.add(text.replace(/游/g, '遊'));
  if (text.includes('遊')) aliases.add(text.replace(/遊/g, '游'));
  if (/王菲|faye/i.test(text)) aliases.add(text.replace(/王菲/gi, 'Faye Wong'));
  return [...aliases].filter(Boolean);
}

function artwork(url, size = 600) {
  return String(url || '')
    .replace(/\d+x\d+bb\.(jpg|jpeg|png|webp)/i, `${size}x${size}bb.$1`)
    .replace(/\d+x\d+-(75|100)\.(jpg|jpeg|png|webp)/i, `${size}x${size}bb.$2`);
}

function colorHash(seed, shift = 0) {
  const text = String(seed || 'album-circle');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index) + shift) % 360;
  return hash;
}

function paletteFor(item, kind, country) {
  const seed = `${kind}:${item.artistName}:${item.collectionName}:${item.trackName}:${item.primaryGenreName}:${country}`;
  const first = colorHash(seed, 0);
  const second = (first + 42 + colorHash(seed, 97) % 96) % 360;
  const third = (first + 185 + colorHash(seed, 211) % 48) % 360;
  return [
    `hsl(${first} 68% 44%)`,
    `hsl(${second} 64% 58%)`,
    `hsl(${third} 82% 78%)`
  ];
}

function scoreItem(item, term, country, index, kind, hints = {}) {
  const query = normalize(term);
  const titleHint = normalize(hints.title);
  const artistHint = normalize(hints.artist);
  const title = normalize(kind === 'album' ? item.collectionName : item.trackName);
  const artist = normalize(item.artistName);
  const album = normalize(item.collectionName);
  const hasCjk = /[\u3400-\u9fff]/.test(term);

  let score = 62;
  const titleInQuery = Boolean(title && query.includes(title));
  const artistInQuery = Boolean(artist && query.includes(artist));
  if (titleInQuery) score += 34;
  if (artist && query.includes(artist)) score += 28;
  if (titleHint && title === titleHint) score += 18;
  if (titleHint && (title.includes(titleHint) || titleHint.includes(title))) score += 10;
  if (artistHint && artist === artistHint) score += 22;
  if (artistHint && (artist.includes(artistHint) || artistHint.includes(artist))) score += 14;
  if (artistHint && artist && !(artist.includes(artistHint) || artistHint.includes(artist))) score -= 24;
  if (album && query.includes(album)) score += 10;
  if (query && title && title.includes(query)) score += 18;
  if (titleInQuery && artistInQuery) score += 12;
  if (hasCjk && ['CN', 'HK', 'TW'].includes(country)) score += 10;
  if (item.trackExplicitness === 'notExplicit') score += 2;
  if (titleInQuery && !artistInQuery && query.length > title.length + 2) score -= kind === 'album' ? 30 : 22;
  if (titleInQuery && !artistInQuery && artist && /tribute|quartet|piano|karaoke|cover|reimagined/i.test(item.collectionName || item.artistName || '')) score -= 18;
  const capped = Math.max(1, Math.min(99, score - index * 2));
  if (kind === 'song' && !titleInQuery) return Math.min(capped, 90 - Math.min(index, 8));
  if (kind === 'album' && !titleInQuery && album && !query.includes(album)) return Math.min(capped, 88 - Math.min(index, 8));
  return capped;
}

async function itunesSearch(term, country, signal) {
  return itunesSearchByType(term, country, 'song', signal);
}

async function itunesSearchByType(term, country, type, signal) {
  const apiUrl = new URL('https://itunes.apple.com/search');
  apiUrl.searchParams.set('term', term);
  apiUrl.searchParams.set('media', 'music');
  apiUrl.searchParams.set('entity', type === 'album' ? 'album' : 'song');
  apiUrl.searchParams.set('limit', '30');
  apiUrl.searchParams.set('country', country);
  apiUrl.searchParams.set('lang', country === 'CN' ? 'zh_cn' : 'en_us');

  const response = await fetch(apiUrl, { signal });
  if (!response.ok) throw new Error(`iTunes search failed: ${response.status}`);
  const data = await response.json();
  return (data.results || []).map((item, index) => ({ item, country, index, kind: type }));
}

async function albumLookup(collectionIds, country, signal) {
  if (!collectionIds.length) return [];
  const apiUrl = new URL('https://itunes.apple.com/lookup');
  apiUrl.searchParams.set('id', collectionIds.slice(0, 15).join(','));
  apiUrl.searchParams.set('country', country);
  apiUrl.searchParams.set('entity', 'song');

  const response = await fetch(apiUrl, { signal });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.results || [])
    .filter((item) => item.wrapperType === 'collection')
    .map((item, index) => ({ item, country, index, kind: 'album' }));
}

async function tracksForAlbum(collectionId, country, signal) {
  if (!collectionId) return [];
  const apiUrl = new URL('https://itunes.apple.com/lookup');
  apiUrl.searchParams.set('id', collectionId);
  apiUrl.searchParams.set('entity', 'song');
  apiUrl.searchParams.set('country', country);

  const response = await fetch(apiUrl, { signal });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.results || [])
    .filter((item) => item.wrapperType === 'track' && item.trackName)
    .sort((a, b) => (a.discNumber || 1) - (b.discNumber || 1) || (a.trackNumber || 0) - (b.trackNumber || 0))
    .map((item, index) => ({
      title: item.trackName, position: String(index + 1),
      discNumber: Number(item.discNumber || 1), trackNumber: Number(item.trackNumber || index + 1),
      lengthMillis: Number(item.trackTimeMillis || 0), providerId: String(item.trackId || ''),
      source: 'iTunes Search'
    }));
}

function mbHeaders() {
  return {
    'User-Agent': `FlowCabin/${APP_VERSION} (https://github.com/ooooooomygosh/Flow-Cabin)`
  };
}

async function musicBrainzSearchRelease(candidate, signal) {
  const titleQueries = searchAliases(candidate.title || candidate.albumTitle);
  const artistQueries = searchAliases(candidate.artist);
  const queries = titleQueries
    .flatMap((title) => artistQueries.map((artist) => `release:"${title}" AND artist:"${artist}"`))
    .concat(titleQueries.map((title) => `release:"${title}"`));
  let allReleases = [];
  for (const query of [...new Set(queries)].slice(0, 6)) {
    const apiUrl = new URL('https://musicbrainz.org/ws/2/release/');
    apiUrl.searchParams.set('query', query || `release:"${candidate.title}"`);
    apiUrl.searchParams.set('fmt', 'json');
    apiUrl.searchParams.set('limit', '8');
    const response = await scheduleMusicBrainz(() => fetch(apiUrl, { signal, headers: mbHeaders() }), signal);
    if (!response.ok) continue;
    const data = await response.json().catch(() => ({}));
    allReleases = [...allReleases, ...(data.releases || [])];
    if (allReleases.length) break;
  }
  if (!allReleases.length) return null;
  const seen = new Set();
  const titleNorm = normalize(candidate.title);
  const artistNorm = normalize(candidate.artist);
  const year = String(candidate.year || '');
  const releases = allReleases
    .filter((release) => release.id && !seen.has(release.id) && seen.add(release.id))
    .map((release) => {
      const releaseTitle = normalize(release.title);
      const artistCredit = normalize((release['artist-credit'] || []).map((credit) => credit.name).join(' '));
      const mediaCount = (release.media || []).reduce((sum, media) => sum + Number(media['track-count'] || 0), 0);
      let score = Number(release.score || 0);
      if (releaseTitle === titleNorm) score += 25;
      if (releaseTitle.includes(titleNorm) || titleNorm.includes(releaseTitle)) score += 12;
      if (artistCredit.includes(artistNorm) || artistNorm.includes(artistCredit)) score += 18;
      if (year && String(release.date || '').startsWith(year)) score += 10;
      if (release.status === 'Official') score += 10;
      if (release.status === 'Pseudo-Release') score -= 25;
      if (['HK', 'TW', 'CN'].includes(release.country)) score += 5;
      if (candidate.expectedTrackCount && mediaCount === Number(candidate.expectedTrackCount)) score += 24;
      if (candidate.expectedTrackCount && Math.abs(mediaCount - Number(candidate.expectedTrackCount)) > 6) score -= 14;
      if (mediaCount) score += Math.min(mediaCount, 20);
      return { release, score, mediaCount };
    })
    .sort((a, b) => b.score - a.score);
  return releases[0]?.release || null;
}

async function musicBrainzReleaseDetails(releaseId, signal) {
  if (!releaseId) return null;
  const apiUrl = new URL(`https://musicbrainz.org/ws/2/release/${releaseId}`);
  apiUrl.searchParams.set('fmt', 'json');
  apiUrl.searchParams.set('inc', 'recordings+media+artist-credits+labels+release-groups');
  const response = await scheduleMusicBrainz(() => fetch(apiUrl, { signal, headers: mbHeaders() }), signal);
  if (!response.ok) return null;
  return response.json();
}

async function coverArtForReleaseGroup(releaseGroupId, signal) {
  if (!releaseGroupId) return '';
  const response = await fetch(`https://coverartarchive.org/release-group/${releaseGroupId}`, { signal }).catch(() => null);
  if (!response?.ok) return '';
  const data = await response.json().catch(() => ({}));
  const image = (data.images || []).find((item) => item.front) || data.images?.[0];
  return image?.thumbnails?.large || image?.image || '';
}

function tracksFromMusicBrainz(details) {
  const media = details?.media || [];
  const trackDetails = [];
  for (const medium of media) {
    for (const track of medium.tracks || []) {
      trackDetails.push({
        title: track.title || track.recording?.title || '',
        position: track.position || '',
        discNumber: Number(medium.position || 1),
        trackNumber: Number(track.number || track.position || 0),
        lengthMillis: Number(track.length || track.recording?.length || 0),
        source: 'MusicBrainz',
        recordingId: track.recording?.id || ''
      });
    }
  }
  return trackDetails.filter((track) => track.title);
}

async function enrichWithMusicBrainz(candidate, signal) {
  if (candidate.type !== 'album') return candidate;
  const needsTracks = !candidate.tracks?.length || (candidate.expectedTrackCount && candidate.tracks.length < candidate.expectedTrackCount);
  if (!needsTracks) return candidate;
  const release = await musicBrainzSearchRelease(candidate, signal).catch(() => null);
  const details = await musicBrainzReleaseDetails(release?.id, signal).catch(() => null);
  const trackDetails = tracksFromMusicBrainz(details);
  if (!trackDetails.length) return candidate;
  const releaseGroupId = details?.['release-group']?.id || release?.['release-group']?.id || '';
  const caaCover = candidate.cover ? '' : await coverArtForReleaseGroup(releaseGroupId, signal).catch(() => '');
  return {
    ...candidate,
    cover: candidate.cover || caaCover,
    coverSource: candidate.cover ? 'iTunes Search' : caaCover ? 'Cover Art Archive' : '',
    tracks: trackDetails.map((track) => track.title),
    trackDetails,
    source: 'iTunes Search + MusicBrainz',
    externalIds: {
      ...(candidate.externalIds || {}),
      musicbrainzReleaseId: details?.id || release?.id || '',
      musicbrainzReleaseGroupId: releaseGroupId,
      barcode: details?.barcode || ''
    },
    sources: [
      ...(candidate.sources || []),
      { provider: 'MusicBrainz', id: details?.id || release?.id || '', url: `https://musicbrainz.org/release/${details?.id || release?.id || ''}` },
      ...(caaCover ? [{ provider: 'Cover Art Archive', id: releaseGroupId, url: `https://coverartarchive.org/release-group/${releaseGroupId}` }] : [])
    ].filter((source) => source.id),
    metadataCompleteness: {
      ...(candidate.metadataCompleteness || {}),
      hasTracks: true,
      trackCountMatches: candidate.expectedTrackCount ? trackDetails.length === Number(candidate.expectedTrackCount) : Boolean(trackDetails.length),
      sourcesUsed: [...new Set([...(candidate.metadataCompleteness?.sourcesUsed || []), 'MusicBrainz'])]
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const titleHint = String(req.query.title || '').trim().slice(0, 120);
  const artistHint = String(req.query.artist || '').trim().slice(0, 120);
  const term = String(req.query.term || [artistHint, titleHint].filter(Boolean).join(' ')).trim().slice(0, 160);
  const requestedType = String(req.query.type || 'all').toLowerCase();
  if (!term) return json(res, 400, { error: 'Missing term' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const searchController = new AbortController();
  const searchTimeout = setTimeout(() => searchController.abort(), 9000);
  const searchSignal = AbortSignal.any([controller.signal, searchController.signal]);
  try {

    const countries = /[\u3400-\u9fff]/.test(term) ? ['CN', 'HK', 'TW', 'US'] : ['US', 'CN', 'HK'];
    const types = requestedType === 'song' || requestedType === 'album' ? [requestedType] : ['song', 'album'];
    const batches = await Promise.allSettled(
      countries.flatMap((country) => types.map((type) => itunesSearchByType(term, country, type, searchSignal)))
    );
    let rows = batches.flatMap((batch) => (batch.status === 'fulfilled' ? batch.value : []));

    // Direct album results take priority; only broaden via songs when none exist.
    if (requestedType === 'album' && !rows.length) {
      const songBatches = await Promise.allSettled(countries.map((country) => itunesSearchByType(term, country, 'song', searchSignal)));
      const albumIdsByCountry = new Map();
      for (const { item, country } of songBatches.flatMap((batch) => (batch.status === 'fulfilled' ? batch.value : []))) {
        if (!item.collectionId) continue;
        const existing = albumIdsByCountry.get(country) || [];
        if (!existing.includes(item.collectionId)) existing.push(item.collectionId);
        albumIdsByCountry.set(country, existing);
      }
      const lookupBatches = await Promise.allSettled(
        [...albumIdsByCountry.entries()].map(([country, ids]) => albumLookup(ids, country, searchSignal))
      );
      rows = [...rows, ...lookupBatches.flatMap((batch) => (batch.status === 'fulfilled' ? batch.value : []))];
    }

    clearTimeout(searchTimeout);
    if (!rows.length) throw new Error('iTunes returned no candidates');

    const seen = new Set();
    const baseCandidates = rows
      .filter(({ item, kind }) => {
        const id = kind === 'album' ? item.collectionId : item.trackId;
        return id && !seen.has(`${kind}-${id}`) && seen.add(`${kind}-${id}`);
      })
      .map(({ item, country, index, kind }) => ({
        id: kind === 'album' ? `itunes-album-${item.collectionId}` : `itunes-track-${item.trackId}`,
        albumId: `itunes-album-${item.collectionId}`,
        externalId: String(kind === 'album' ? item.collectionId : item.trackId),
        externalIds: {
          ...(kind === 'album' ? { itunesCollectionId: String(item.collectionId || '') } : { itunesTrackId: String(item.trackId || '') }),
          itunesCollectionId: String(item.collectionId || '')
        },
        collectionId: String(item.collectionId || ''),
        type: kind,
        source: 'iTunes Search',
        title: kind === 'album' ? item.collectionName : item.trackName,
        artist: item.artistName,
        albumTitle: item.collectionName,
        year: item.releaseDate ? String(new Date(item.releaseDate).getFullYear()) : 'unknown',
        label: item.primaryGenreName || 'Apple catalog',
        producer: '',
        cover: artwork(item.artworkUrl100),
        palette: paletteFor(item, kind, country),
        platforms: [`Apple Music / iTunes ${country}`],
        confidence: scoreItem(item, term, country, index, kind, { title: titleHint, artist: artistHint }),
        match: scoreItem(item, term, country, index, kind, { title: titleHint, artist: artistHint }),
        expectedTrackCount: item.trackCount || 0,
        tracks: kind === 'album' ? [] : [item.trackName].filter(Boolean),
        previewUrl: item.previewUrl || '',
        trackTimeMillis: item.trackTimeMillis || null,
        trackViewUrl: item.trackViewUrl || '',
        collectionViewUrl: item.collectionViewUrl || '',
        storefront: country,
        providerLinks: [
          item.trackViewUrl && { provider: 'appleMusic', type: kind === 'album' ? 'album' : 'track', url: item.trackViewUrl, providerId: String(kind === 'album' ? item.collectionId : item.trackId), confidence: 'exact', source: 'itunes' },
          item.collectionViewUrl && { provider: 'appleMusic', type: 'album', url: item.collectionViewUrl, providerId: String(item.collectionId || ''), confidence: 'exact', source: 'itunes' },
          { provider: 'youtubeMusic', type: 'search', url: `https://music.youtube.com/search?q=${encodeURIComponent(`${item.artistName} ${kind === 'album' ? item.collectionName : item.trackName}`)}`, confidence: 'search', source: 'generated' },
          { provider: 'youtube', type: 'search', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${item.artistName} ${kind === 'album' ? item.collectionName : item.trackName} official audio`)}`, confidence: 'search', source: 'generated' },
          { provider: 'qqMusic', type: 'search', url: `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(`${item.artistName} ${kind === 'album' ? item.collectionName : item.trackName}`)}`, confidence: 'search', source: 'generated' },
          { provider: 'netease', type: 'search', url: `https://music.163.com/#/search/m/?s=${encodeURIComponent(`${item.artistName} ${kind === 'album' ? item.collectionName : item.trackName}`)}`, confidence: 'search', source: 'generated' },
          { provider: 'songlink', type: 'search', url: `https://song.link/search?query=${encodeURIComponent(`${item.artistName} ${kind === 'album' ? item.collectionName : item.trackName}`)}`, confidence: 'search', source: 'generated' }
        ].filter(Boolean),
        trackDetails: [],
        metadataCompleteness: {
          hasTracks: kind !== 'album',
          trackCountMatches: kind !== 'album',
          hasCover: Boolean(item.artworkUrl100),
          sourcesUsed: ['iTunes Search']
        },
        sources: [{ provider: 'iTunes Search', id: String(kind === 'album' ? item.collectionId : item.trackId), url: item.collectionViewUrl || item.trackViewUrl || '' }],
        context:
          kind === 'album'
            ? `来自 iTunes ${country} 曲库的专辑候选，可确认封面、艺人、年份和曲目后放上唱片架。`
            : `来自 iTunes ${country} 曲库的歌曲候选，收录在《${item.collectionName || '未知专辑'}》。确认版本后可放上唱片架。`,
        tags: [kind, item.primaryGenreName || 'music', country.toLowerCase()],
        country
      }))
      .sort((a, b) => b.match - a.match)
      .slice(0, 15);

    const enriched = await Promise.all(
      baseCandidates.map(async (candidate, index) => {
        if (candidate.type !== 'album') {
          const { country, ...publicCandidate } = candidate;
          return publicCandidate;
        }
        const trackDetails = await tracksForAlbum(candidate.collectionId, candidate.country, controller.signal).catch(() => []);
        const tracks = trackDetails.map((track) => track.title);
        const { country, ...publicCandidate } = candidate;
        const withTracks = {
          ...publicCandidate,
          tracks,
          trackDetails,
          metadataCompleteness: {
            ...publicCandidate.metadataCompleteness,
            hasTracks: Boolean(tracks.length),
            trackCountMatches: publicCandidate.expectedTrackCount ? tracks.length === Number(publicCandidate.expectedTrackCount) : Boolean(tracks.length)
          },
          context: tracks.length
            ? `来自 iTunes ${country} 曲库的专辑候选，可确认封面、艺人、年份和 ${tracks.length} 首曲目后放上唱片架。`
            : publicCandidate.context
        };
        return enrichWithMusicBrainz(withTracks, controller.signal);
      })
    );

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    const incomplete = enriched.some((candidate) => candidate.type === 'album' && !candidate.metadataCompleteness.trackCountMatches);
    return json(res, 200, { provider: 'iTunes Search', candidates: enriched, warnings: incomplete ? ['部分专辑曲目尚未读取完整，请核对版本或稍后重试。'] : [] });
  } catch (error) {
    const message = error.name === 'AbortError' ? 'iTunes search timed out' : error.message;
    return json(res, 502, { error: message });
  } finally {
    clearTimeout(searchTimeout);
    clearTimeout(timeout);
  }
}

// Calls the handler with plain query parameters and returns a Response.
export async function searchCatalog(searchParams) {
  let status = 200, body = '';
  const res = { status(value) { status = value; return this; }, setHeader() { return this; }, end(value) { body = value; } };
  await handler({ method: 'GET', query: Object.fromEntries(searchParams) }, res);
  return new Response(body, { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
