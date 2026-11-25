import FaceArtwork from "./ProductFaceArtwork.jsx";

// Both sides of the photographed hanging tab sit at the carton's back edge.
// SVG masks describe only the physical cutouts; packaging art stays untouched.
export default function PackagingHeader({ header, title, onReady }) {
  return ["front", "back"].map(face => <div key={face}
    className={`product-inspect__header product-inspect__header--${face}`}
    style={{"--header-width":header.width,"--header-height":header.height,maskImage:`url('${header[face].mask}')`}}>
    <FaceArtwork texture={header[face]} title={title} face={`hanging tab ${face}`} onReady={ready=>onReady(`header-${face}`,ready)}/>
  </div>);
}
