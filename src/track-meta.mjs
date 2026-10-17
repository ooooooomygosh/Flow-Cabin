// Per-track metadata of a shelf record. Kept free of playback/matching code so the wallpaper,
// widgets and turntable can show a track without bundling the source resolver.
// A playlist's tracks each have their own artist and album; an album's share the record's.
export const trackArtist = (item, index) => item?.trackDetails?.[index]?.artist || (item?.type === 'playlist' ? '' : item?.artist || '');
// The cover to show for the track on the deck: a playlist song's own album
// art (saved with the playlist, else from the recording that matched), else the record's.
export const trackCover = (item, index, matched = '') => item?.trackDetails?.[index]?.cover || (item?.type === 'playlist' ? matched : '') || item?.cover || '';
export const trackAlbum = (item, index) => item?.trackDetails?.[index]?.album || (item?.type === 'song' ? item.albumTitle || '' : item?.type === 'playlist' ? '' : item?.title || '');
