Gallery tiles (photo-01.jpg … photo-25.jpg) are generated, not edited by hand.

Source: the couple's picks, currently the folder
        Desktop/Duye & Grasya Selected Prenup Photos/Website Pictures
        (Website_1.jpg … Website_25.jpg, full-res, ~172 MB).
Build:  node tools/build-gallery.js --from "<that folder>"
        resizes to a 1400px long edge and recompresses; 25 tiles ~3 MB.

The older mode still works: list DSC numbers in SELECTED in tools/build-gallery.js
and run `npm run build:gallery` against ../selected-photos.

sections.js renders one tile per photo-NN.jpg and HARD-CODES how many there are —
change the count there whenever the number of photos changes. photo-01 is pinned as
the opening tile; the rest are shuffled with a fixed seed so the mosaic is mixed but
identical on every visit. Missing files dim gracefully via the onerror handler.
