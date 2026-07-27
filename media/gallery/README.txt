Gallery tiles (photo-01.jpg … photo-30.jpg) are generated, not edited by hand.

Source: the couple's picks in ../../selected-photos (full-res DSC_*.JPG).
Build:  npm run build:gallery   (resizes + recompresses via tools/build-gallery.js)

To change which photos show or their order, edit the SELECTED list in
tools/build-gallery.js and re-run the build. sections.js renders one tile per
photo-NN.jpg; missing files dim gracefully via the onerror handler.
