// lib/songFilters.js
//
// Shared filtering logic for songs, used by: songs.js (browse), room/[code].js
// (queue), admin.js (song admin), tags.js (admin tag management).
//
// Sections are identified by their real songbook_sections.id (a proper foreign
// key on song_songbook_entries.section_id) - NOT by the old text section code,
// which is now optional and purely cosmetic. Since a section's id is already
// globally unique, there's no need to combine it with songbook_id to avoid
// collisions the way the old code-based approach required.
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
 * Given the raw songbook_sections rows and a list of currently-selected
 * songbook ids, return the section definitions that belong to those
 * songbooks - sorted by display_order. This lists sections that EXIST for a
 * book (from songbook_sections), not just ones a song currently occupies,
 * since section existence is no longer tied to songs having been placed yet.
 *
 * Returns [] if no songbooks are selected - sections aren't meaningful
 * without knowing which book they belong to, so nothing should be shown
 * until a songbook is picked.
 *
 * Each returned section may or may not have a section_code (it's optional
 * now) - always has a section_name and an id.
 */
export function getAvailableSections(songbookSections, selectedSongbookIds) {
  if (!selectedSongbookIds || selectedSongbookIds.length === 0) return [];
  return (songbookSections || [])
    .filter(s => selectedSongbookIds.includes(s.songbook_id))
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
}

/**
 * Core filter predicate. Returns true if the song should be shown.
 *
 * @param entries - this song's own placement(s): [{ songbook_id, section_id }, ...]
 * @param songTagIds - this song's system tag ids (or names - see note below): [id, ...]
 * @param personalTags - this user's personal tags on this song: [text, ...]
 * @param filters - {
 *   songbookIds: [],        // multi-select OR; [] means "any songbook"
 *   sections: [],           // multi-select OR; values are real section_id's
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
    const inSelectedSection = relevant.some(e => sections.includes(e.section_id));
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

/** Display label for a section - code + name if a code exists, otherwise just the name. */
export function sectionLabel(section) {
  if (!section) return '';
  return section.section_code ? `${section.section_code}: ${section.section_name}` : section.section_name;
}
