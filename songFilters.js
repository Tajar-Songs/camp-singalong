// lib/songFilters.js
//
// Shared filtering logic for songs, used by: songs.js (browse), room/[code].js
// (queue), admin.js (song admin), tags.js (admin tag management).
//
// Each page loads its own data in whatever shape is natural for it, but all of
// them normalize a song's songbook placement down to the same shape before
// calling into here - an array of { songbook_id, section } pairs - so the
// actual filtering decision only has to be written once.
//
// Deliberately NOT included here: favorite/dislike/known/want-to-learn
// filtering. That's still being decided (see the "Needs Input" doc on
// song-vs-version familiarity) and is left to each page to handle separately
// for now.

/**
 * Given all songbooks and all songbook entries, return only the songbooks
 * that actually have at least one song in them. A songbook with zero songs
 * isn't worth offering as a filter option.
 */
export function getFilterableSongbooks(songbooks, songbookEntries) {
  const idsWithSongs = new Set(songbookEntries.map(e => e.songbook_id));
  return (songbooks || []).filter(sb => idsWithSongs.has(sb.id));
}

/**
 * Given all songbook entries and a list of currently-selected songbook ids,
 * return the sorted, deduplicated list of section codes that actually exist
 * within those songbooks. If no songbooks are selected, returns sections
 * across ALL songbooks (matches "no songbook filter = don't restrict").
 * Returns [] if the relevant songbook(s) have no sections at all - the
 * caller should not show a section filter in that case.
 */
export function getAvailableSections(songbookEntries, selectedSongbookIds) {
  const sections = new Set();
  (songbookEntries || []).forEach(e => {
    if (!e.section) return;
    if (selectedSongbookIds && selectedSongbookIds.length > 0) {
      if (selectedSongbookIds.includes(e.songbook_id)) sections.add(e.section);
    } else {
      sections.add(e.section);
    }
  });
  return Array.from(sections).sort();
}

/**
 * Core filter predicate. Returns true if the song should be shown.
 *
 * @param entries - this song's own placement(s): [{ songbook_id, section }, ...]
 * @param songTagIds - this song's system tag ids (or names - see note below): [id, ...]
 * @param personalTags - this user's personal tags on this song: [text, ...]
 * @param filters - {
 *   songbookIds: [],        // multi-select OR; [] means "any songbook"
 *   sections: [],           // multi-select OR; [] means "any section"
 *   includeTagIds: [],      // tags to include; [] means "no include restriction"
 *   includeMode: 'any',     // 'any' = song needs at least one of includeTagIds (OR)
 *                           // 'all' = song needs every one of includeTagIds (AND)
 *   excludeTagIds: [],      // if song has ANY of these tags, it's filtered out - always OR
 *   personalTagValues: []   // multi-select OR; [] means "no restriction"
 * }
 *
 * Note on tag ids vs names: this function just does array membership checks, so
 * it works fine whether songTagIds/includeTagIds/excludeTagIds are actual ids or
 * tag name strings, as long as both sides use the same representation consistently
 * within a given page. songs.js uses names throughout; room/admin pages can use
 * real ids.
 */
export function songMatchesFilters(entries, songTagIds, personalTags, filters) {
  const {
    songbookIds = [], sections = [],
    includeTagIds = [], includeMode = 'any', excludeTagIds = [],
    personalTagValues = []
  } = filters;

  if (songbookIds.length > 0) {
    const inSelectedBook = entries.some(e => songbookIds.includes(e.songbook_id));
    if (!inSelectedBook) return false;
  }

  if (sections.length > 0) {
    const relevant = songbookIds.length > 0
      ? entries.filter(e => songbookIds.includes(e.songbook_id))
      : entries;
    const inSelectedSection = relevant.some(e => sections.includes(e.section));
    if (!inSelectedSection) return false;
  }

  // Exclude always wins, checked before include, and is always "any" (OR) logic -
  // having even one excluded tag is enough to drop the song.
  if (excludeTagIds.length > 0) {
    const hasExcluded = excludeTagIds.some(id => songTagIds.includes(id));
    if (hasExcluded) return false;
  }

  if (includeTagIds.length > 0) {
    if (includeMode === 'all') {
      const hasAll = includeTagIds.every(id => songTagIds.includes(id));
      if (!hasAll) return false;
    } else {
      const hasAny = includeTagIds.some(id => songTagIds.includes(id));
      if (!hasAny) return false;
    }
  }

  if (personalTagValues.length > 0) {
    const hasAny = personalTagValues.some(t => (personalTags || []).includes(t));
    if (!hasAny) return false;
  }

  return true;
}

/** A fresh, empty filter state - nothing selected on any axis. */
export function emptyFilterState() {
  return { songbookIds: [], sections: [], includeTagIds: [], includeMode: 'any', excludeTagIds: [], personalTagValues: [] };
}

/** Toggle a value in/out of a multi-select array - the standard click handler shape. */
export function toggleInArray(array, value) {
  return array.includes(value) ? array.filter(v => v !== value) : [...array, value];
}
