// The AR33 sign font table, shared by the converter (mk_outlines.mjs, node) and mirrored in
// src/city/fk/signFonts.js (the browser side, which carries the same keys). Every file is a raw TTF from
// github.com/google/fonts (tools/ar33/signs/fetch_fonts.mjs), licence beside it in public/fonts/ar33/LICENSE-<dir>.txt.
//
// [family key, css family, file, licence dir, axes] ; axes: null for a static face, else { wght: [min, max], ... }
// Weights listed in `w` get pre-converted outlines (the nearest one serves any other weight).
// Variable files are saved under safe names (fetch_fonts.mjs: "Inter[opsz,wght].ttf" -> "Inter-opsz-wght.ttf"): a comma
// in a URL path does not survive every static server (Vite answered its SPA page for it).
export const FAMILIES = [
  // key               file(s)                                                 dir               weights / styles
  { key: 'Inter', file: 'Inter-opsz-wght.ttf', dir: 'inter', v: { wght: [100, 900], opsz: 32 }, w: [400, 500, 600, 700, 800, 900] },
  { key: 'Arimo', file: 'Arimo-wght.ttf', dir: 'arimo', v: { wght: [400, 700] }, w: [400, 700] },
  { key: 'Oswald', file: 'Oswald-wght.ttf', dir: 'oswald', v: { wght: [200, 700] }, w: [400, 500, 600, 700] },
  { key: 'Anton', file: 'Anton-Regular.ttf', dir: 'anton', w: [400] },
  { key: 'BebasNeue', file: 'BebasNeue-Regular.ttf', dir: 'bebasneue', w: [400] },
  { key: 'Barlow', dir: 'barlow', files: { 400: 'Barlow-Regular.ttf', 500: 'Barlow-Medium.ttf', 600: 'Barlow-SemiBold.ttf', 700: 'Barlow-Bold.ttf', 800: 'Barlow-ExtraBold.ttf', 900: 'Barlow-Black.ttf', '700i': 'Barlow-BoldItalic.ttf', '900i': 'Barlow-BlackItalic.ttf' } },
  { key: 'BarlowCondensed', dir: 'barlowcondensed', files: { 500: 'BarlowCondensed-Medium.ttf', 600: 'BarlowCondensed-SemiBold.ttf', 700: 'BarlowCondensed-Bold.ttf', 800: 'BarlowCondensed-ExtraBold.ttf', 900: 'BarlowCondensed-Black.ttf', '700i': 'BarlowCondensed-BoldItalic.ttf', '800i': 'BarlowCondensed-ExtraBoldItalic.ttf', '900i': 'BarlowCondensed-BlackItalic.ttf' } },
  { key: 'Montserrat', file: 'Montserrat-wght.ttf', dir: 'montserrat', v: { wght: [100, 900] }, w: [400, 500, 600, 700, 800, 900] },
  { key: 'Poppins', dir: 'poppins', files: { 400: 'Poppins-Regular.ttf', 500: 'Poppins-Medium.ttf', 600: 'Poppins-SemiBold.ttf', 700: 'Poppins-Bold.ttf', 800: 'Poppins-ExtraBold.ttf', 900: 'Poppins-Black.ttf', '700i': 'Poppins-BoldItalic.ttf' } },
  { key: 'LibreFranklin', file: 'LibreFranklin-wght.ttf', dir: 'librefranklin', v: { wght: [100, 900] }, w: [400, 500, 600, 700, 800, 900] },
  { key: 'Archivo', file: 'Archivo-wdth-wght.ttf', dir: 'archivo', v: { wght: [100, 900], wdth: 100 }, w: [400, 600, 700, 800, 900] },
  { key: 'ArchivoNarrow', file: 'Archivo-wdth-wght.ttf', dir: 'archivo', v: { wght: [100, 900], wdth: 62 }, w: [500, 600, 700, 800, 900] },
  { key: 'ArchivoBlack', file: 'ArchivoBlack-Regular.ttf', dir: 'archivoblack', w: [400] },
  { key: 'Jost', file: 'Jost-wght.ttf', dir: 'jost', v: { wght: [100, 900] }, w: [400, 500, 600, 700, 800, 900] },
  { key: 'WorkSans', file: 'WorkSans-wght.ttf', dir: 'worksans', v: { wght: [100, 900] }, w: [400, 500, 600, 700, 800, 900] },
  { key: 'Lato', dir: 'lato', files: { 400: 'Lato-Regular.ttf', 700: 'Lato-Bold.ttf', 900: 'Lato-Black.ttf', '700i': 'Lato-BoldItalic.ttf' } },
  { key: 'PlayfairDisplay', file: 'PlayfairDisplay-wght.ttf', dir: 'playfairdisplay', v: { wght: [400, 900] }, w: [400, 600, 700, 900] },
  { key: 'LibreBaskerville', file: 'LibreBaskerville-wght.ttf', dir: 'librebaskerville', v: { wght: [400, 700] }, w: [400, 700], italic: 'LibreBaskerville-Italic-wght.ttf' },
  { key: 'Cinzel', file: 'Cinzel-wght.ttf', dir: 'cinzel', v: { wght: [400, 900] }, w: [400, 600, 700, 900] },
  { key: 'DMSerifDisplay', file: 'DMSerifDisplay-Regular.ttf', dir: 'dmserifdisplay', w: [400] },
  { key: 'AlfaSlabOne', file: 'AlfaSlabOne-Regular.ttf', dir: 'alfaslabone', w: [400] },
  { key: 'RobotoSlab', file: 'RobotoSlab-wght.ttf', dir: 'robotoslab', v: { wght: [100, 900] }, w: [400, 500, 700, 800, 900] },
  { key: 'Rye', file: 'Rye-Regular.ttf', dir: 'rye', w: [400] },
  { key: 'Pacifico', file: 'Pacifico-Regular.ttf', dir: 'pacifico', w: [400] },
  { key: 'Lobster', file: 'Lobster-Regular.ttf', dir: 'lobster', w: [400] },
  { key: 'KaushanScript', file: 'KaushanScript-Regular.ttf', dir: 'kaushanscript', w: [400] },
  { key: 'GreatVibes', file: 'GreatVibes-Regular.ttf', dir: 'greatvibes', w: [400] },
  { key: 'DancingScript', file: 'DancingScript-wght.ttf', dir: 'dancingscript', v: { wght: [400, 700] }, w: [400, 700] },
  { key: 'Sacramento', file: 'Sacramento-Regular.ttf', dir: 'sacramento', w: [400] },
  { key: 'Yellowtail', file: 'Yellowtail-Regular.ttf', dir: 'yellowtail', w: [400] },
  { key: 'TiltNeon', file: 'TiltNeon-XROT-YROT.ttf', dir: 'tiltneon', v: { XROT: 0, YROT: 0 }, w: [400] },
  { key: 'Monoton', file: 'Monoton-Regular.ttf', dir: 'monoton', w: [400] },
  { key: 'Bungee', file: 'Bungee-Regular.ttf', dir: 'bungee', w: [400] },
  { key: 'Righteous', file: 'Righteous-Regular.ttf', dir: 'righteous', w: [400] },
  { key: 'FjallaOne', file: 'FjallaOne-Regular.ttf', dir: 'fjallaone', w: [400] },
  { key: 'LeagueSpartan', file: 'LeagueSpartan-wght.ttf', dir: 'leaguespartan', v: { wght: [100, 900] }, w: [400, 500, 600, 700, 800, 900] },
  // AR34 wave 2: heavy rounded faces for the 125th Street fascias (Popeyes' wordmark role; Arial Rounded role)
  { key: 'Baloo2', file: 'Baloo2-wght.ttf', dir: 'baloo2', v: { wght: [400, 800] }, w: [600, 700, 800] },
  { key: 'Nunito', file: 'Nunito-wght.ttf', dir: 'nunito', v: { wght: [200, 1000] }, w: [700, 800, 900] },
  // Arabic shop signs (canvas: the browser shapes them; the outlines are unshaped, so Arabic channel letters paint)
  { key: 'NotoNaskhArabic', file: 'NotoNaskhArabic-wght.ttf', dir: 'notonaskharabic', v: { wght: [400, 700] }, w: [400, 700] },
  { key: 'NotoKufiArabic', file: 'NotoKufiArabic-wght.ttf', dir: 'notokufiarabic', v: { wght: [100, 900] }, w: [400, 700, 900] },
];
