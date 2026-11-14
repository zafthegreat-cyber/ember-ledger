// Project a verified face quadrilateral onto a flat face of the 3D object.
// This is UV mapping at render time; source photos and saved records stay intact.
export function faceProjection(quad, width, height) {
  if (!Array.isArray(quad) || quad.length !== 4 || !(width > 0 && height > 0) || !quad.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) return null;
  const target = [[0,0],[width,0],[width,height],[0,height]];
  const matrix = [];
  for (let i=0;i<4;i++) {
    const x=quad[i][0]*width,y=quad[i][1]*height,[u,v]=target[i];
    matrix.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);
  }
  for (let col=0;col<8;col++) {
    let pivot=col; for(let r=col+1;r<8;r++) if(Math.abs(matrix[r][col])>Math.abs(matrix[pivot][col]))pivot=r;
    if(Math.abs(matrix[pivot][col])<1e-10)return null;
    [matrix[col],matrix[pivot]]=[matrix[pivot],matrix[col]];
    const divisor=matrix[col][col];for(let c=col;c<=8;c++)matrix[col][c]/=divisor;
    for(let r=0;r<8;r++)if(r!==col){const scale=matrix[r][col];for(let c=col;c<=8;c++)matrix[r][c]-=scale*matrix[col][c];}
  }
  const [a,b,c,d,e,f,g,h]=matrix.map(row=>row[8]);
  return [a,d,0,g,b,e,0,h,0,0,1,0,c,f,0,1];
}

export function inspectionImageUrl(src) {
  try { const url=new URL(src);if(url.hostname==="tcgplayer-cdn.tcgplayer.com"&&/^\/product\/\d+_200w\.jpg$/.test(url.pathname)){url.pathname=url.pathname.replace("_200w.jpg","_in_1000x1000.jpg");return url.href;} } catch { /* Private references and local images use their original source. */ }
  return src;
}
