# Our Story — timeline photos (generated)

These folders are **built, not edited by hand**. `tools/build-story.js` reads the
couple's source photos, makes a square disc crop + full-size album images for each
milestone, and writes them here as `media/story/<key>/`. It also generates
`js/storyAlbums.js`, the map `story.js` reads. Missing files fall back to the
**J & G** monogram, so the timeline always looks complete.

- Source tree (default): `C:\Users\jurie\Desktop\our_story`
- Build: `npm run build:story` (options: `--src <dir> --disc 600 --full 1400 --quality 82`)

To change which photos appear, their order, or add a new one, edit the `MANIFEST`
in `tools/build-story.js` (first file in a list becomes that milestone's disc) and
re-run the build. The narrative text (years, captions, the red-string structure)
lives in the `STORY` array at the top of `js/story.js`.

Milestone keys: `bike`, `glasses` (childhood matched pairs, his+hers), `2002`,
`2008` (met / Agham), and one per year `2015`–`2025`. Clicking a disc opens that
milestone's album in the shared lightbox.
