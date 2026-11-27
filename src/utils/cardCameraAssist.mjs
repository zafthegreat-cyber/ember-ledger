// Card camera helper (Nov 21 2026): makes the card frame forgiving. The camera
// looks at a margin around the on-screen frame, finds the card's edges itself,
// and tells the person what to fix (closer, upright, glare, focus). The picture
// is cropped to the card it found, so lining it up exactly no longer matters.
// Pure, for tests (scripts/test-card-camera-assist.mjs).
// Nov 26 2026: the camera has its own card finder (findCardInView), which also
// finds a card turned a few degrees. The reader's finder only looks straight on.

export const CAMERA_ASSIST = Object.freeze({
  pad: 0.12, // margin looked at around the frame, as a share of the frame size
  minFill: 0.62, // card height as a share of the padded view before it is "close enough"
  glareCutoff: 248, // brightness counted as glare
  maxGlare: 0.025, // share of the name or number strip allowed to be glare
  maxArtGlare: 0.2, // share of the whole card: holo art shines, which is fine if the text is clear
  captureMargin: 0.03, // margin kept around the found card; the reader trims to the edges itself
  sharpShare: 0.72, // must be at least this share of the sharpest recent view
  minSharp: 3, // below this the view is a blur or blank
  sharpWindow: 12, // recent samples remembered for focus (about 3 seconds)
  // Nov 24 2026 (scanner review):
  cardSharpFloor: 3, // the card itself, not the table around it, must show at least this much detail
  sameBoxTolerance: 0.06, // the found card may shift this much between looks and still count as the same card
  steadyLooks: 8, // a found, close, upright card held still this many looks (about 2 s) is taken despite glare or soft focus
  // Nov 24 2026 (auto-scan too strict in the hand): 2.5K video instead of 4K, and a little hand shake still counts as still.
  handShake: 12, // average brightness change per look (0-255) that still counts as held still; was 6
  minFrameDetail: 24, // brightness spread the frame needs before a no-edges picture is taken (not an empty table)
  // Nov 26 2026 (owner: "keep improving the scanner"):
  burstFrames: 3, // pictures taken in a row each time; the sharpest is kept (a hand moves a little even when held still)
  burstGapMs: 60, // wait between them, about two video frames
  darkLevel: 70, // a soft view where nine tenths of it is darker than this is a dark room, not a focus problem
  blurryLooks: 12, // looks (about 3 s) of soft focus before the tip says what to change
  tooCloseFill: 0.9, // a card taller than this share of the view is closer than most phones can focus
  maxTilt: 10, // degrees either way a card may be turned and still be found
  straightenFrom: 2, // degrees of turn from which the picture is turned upright before it is read
  edgeClear: 2.2, // an edge of the card must stand this far above the average edge strength in the view
});

// Width over height of what is being looked for. The same limits as the reader's own finder.
const VIEW_SHAPES = Object.freeze({
  card: { upright: [0.63, 0.81], sideways: [1.23, 1.6], ideal: 63 / 88 },
  slab: { upright: [0.5, 0.68], sideways: [1.47, 2], ideal: 31 / 53 },
});

// How the finder weighs what it sees.
const FINDER = Object.freeze({
  detail: 4, // a spot must change this much (0-255, across plus down) to count: flat table and camera grain do not
  searchEvery: 2, // while trying turns only every second spot is used; the chosen turn is then read in full
  rim: 0.06, // share of the view at each side taken to be table: what a line shows there is not the card
  sideChoices: 4, // strongest lines kept as possible left and right edges
  endChoices: 4, // and as possible top and bottom edges: the art window and text box make strong lines of their own
  lineFloor: 0.9, // an edge line must also be at least this much of an average line across the whole view (camera grain is not)
  sharpShare: 0.85, // the turn a card is found at must be at least this sharp, against the sharpest turn tried
  boxesChecked: 8, // best card-shaped boxes at the chosen turn that are checked edge by edge
  edgeCover: 0.72, // share of each side of the box that must actually show the edge (fingers and round corners hide some)
  coverReach: 2, // how many lines either side of a side still count as that side
  coverLevel: 0.4, // a place shows the edge when it is this strong, against the side as a whole
  sizeBonus: 1.5, // of the boxes with a card's shape, the outermost wins: this much extra for a box filling the whole view
  shapeExact: 0.02, // a box this close to a card's true shape is simply card-shaped: size decides between such boxes
  shapeSlack: 0.08, // how far from a card's true shape a box may be before the shape counts for nothing
  shapeFloor: 0.25, // share of the score a box keeps when its shape is at the limit
  straightBias: 1.03, // a turned reading must be this much sharper than the straight-on one
  startFloor: 0.35, // the middle of the view must be at least this busy, against an average line, to be a card at all
  startOverTable: 2.5, // and this much busier than the table before "where the card starts" is used
  startLevel: 0.14, // the card has started where a line is this far from table-quiet to card-busy
  nearStart: 0.04, // on a plain table an edge line must be within this share of the view from where the card starts
});

/**
 * Finds the card in one look, also when it is turned a few degrees (Nov 26 2026).
 * A card held in the hand is rarely square to the phone, and a turn of two or
 * three degrees smears each edge across several columns, so a finder that only
 * looks straight on loses the card. This one adds up edge strength along lines
 * turned by each whole degree up to maxTilt and keeps the turn where the four
 * edges stand out most.
 * Returns the card's own rectangle, upright and centred where the card is, in
 * fractions of the view: { x, y, w, h, sideways, tilt } with tilt in degrees
 * (clockwise). null when no card-shaped outline stands out.
 */
export function findCardInView(gray, width, height, { shape = "card", maxTilt = CAMERA_ASSIST.maxTilt } = {}) {
  if (!gray || width < 20 || height < 20) return null;
  const size = width * height;
  // Every spot with real detail: where it is and how strongly it changes across and down.
  // Flat table and flat card border carry none, which keeps the sums below quick and clean.
  const spotX = new Int16Array(size), spotY = new Int16Array(size);
  const spotAcross = new Float32Array(size), spotDown = new Float32Array(size);
  let spots = 0, acrossTotal = 0, downTotal = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const across = Math.abs(gray[i + 1] - gray[i - 1]), down = Math.abs(gray[i + width] - gray[i - width]);
      if (across + down < FINDER.detail) continue;
      spotX[spots] = x; spotY[spots] = y; spotAcross[spots] = across; spotDown[spots] = down;
      spots += 1; acrossTotal += across; downTotal += down;
    }
  }
  if (!spots) return null;
  // What an average line across the whole view shows. An edge of the card must stand well above it.
  const colAverage = acrossTotal / width, rowAverage = downTotal / height;
  const colBusyAverage = (acrossTotal + downTotal) / width, rowBusyAverage = (acrossTotal + downTotal) / height;
  if (!(colAverage > 0) || !(rowAverage > 0)) return null;
  const look = VIEW_SHAPES[shape] || VIEW_SHAPES.card;
  const centreX = width / 2, centreY = height / 2;
  const clear = CAMERA_ASSIST.edgeClear;
  // The rim of the view is table. A line that carries on into the rim (wood grain, a
  // table edge, a stripe on a playmat, an arm) is not an edge of the card, so what a
  // line shows in the rim is taken off what it shows in the middle.
  const rimX = Math.max(2, Math.round(width * FINDER.rim)), rimY = Math.max(2, Math.round(height * FINDER.rim));
  const rowRimWeight = (width - 2 * rimX) / (2 * rimX), colRimWeight = (height - 2 * rimY) / (2 * rimY);
  const leftEnd = Math.floor(width * 0.35), rightStart = Math.ceil(width * 0.65);
  const topEnd = Math.floor(height * 0.35), bottomStart = Math.ceil(height * 0.65);
  // The strongest few lines in a stretch, none closer together than `apart`. Every line that
  // stands clear counts the same: which lines make the card is decided by shape and size, not
  // by which is boldest (the art window is bolder than the card's own edge).
  const candidates = (edges, from, to, average, floor, count, apart = 3) => {
    const found = [];
    while (found.length < count) {
      let best = -1, bestValue = 0;
      for (let i = from; i < to; i += 1) {
        if (edges[i] > bestValue && !found.some((other) => Math.abs(other.index - i) < apart)) { bestValue = edges[i]; best = i; }
      }
      if (best < 0 || !(bestValue > average * clear) || !(bestValue > floor)) break;
      found.push({ index: best, line: true });
    }
    return found;
  };
  const middle = (values) => { const sorted = Array.from(values).sort((a, b) => a - b); return sorted.length ? sorted[sorted.length >> 1] : 0; };
  // Where the blank table stops and the card begins, walking in from one side: a pale card
  // on a pale table shows almost no outer edge, but it is still busier than the table.
  // busy: detail per line, table lines already taken off. from -> to walks inwards. -1 when
  // the table is not blank enough to tell, or something reaches in from the edge of the view.
  const cardStart = (busy, from, to, average) => {
    const length = busy.length, direction = to > from ? 1 : -1;
    const rim = Math.max(3, Math.round(length * 0.05));
    const table = middle(direction > 0 ? busy.subarray(1, 1 + rim) : busy.subarray(length - 1 - rim, length - 1));
    const inside = middle(busy.subarray(Math.floor(length * 0.35), Math.ceil(length * 0.65)));
    if (!(inside > average * FINDER.startFloor) || !(inside > table * FINDER.startOverTable)) return -1;
    const level = table + (inside - table) * FINDER.startLevel;
    for (let i = from; i !== to; i += direction) {
      if (busy[i] >= level) return i < rim || i >= length - rim ? -1 : i;
    }
    return -1;
  };
  // On a plain table the card starts where the table stops being blank, so only edge lines
  // near that place can be the card's edge; lines further in are its border, art window or text box.
  const nearStart = (list, start, span) => {
    if (start < 0) return list;
    const near = Math.max(2, Math.round(span * FINDER.nearStart));
    const kept = list.filter((line) => Math.abs(line.index - start) <= near);
    if (!kept.some((line) => Math.abs(line.index - start) < 2)) kept.push({ index: start, line: false });
    return kept;
  };
  // 1 for a card's shape give or take a little, falling to 0 further off: a box cut short at
  // the art window scores well below the whole card.
  const shapeFit = (aspect, ideal) => Math.max(0, Math.min(1, 1 - (Math.abs(aspect - ideal) - FINDER.shapeExact) / (FINDER.shapeSlack - FINDER.shapeExact)));

  let sharpest = 0;
  // One turn: the card-shaped box whose edges fall on lines turned this many degrees, and how sharp those lines are.
  // every: 2 looks at every second spot, which is enough to tell which turn is sharpest.
  const reading = (degrees, every = 1) => {
    const slope = Math.tan((degrees * Math.PI) / 180);
    const colEdge = new Float64Array(width), rowEdge = new Float64Array(height);
    const colRim = new Float64Array(width), rowRim = new Float64Array(height);
    const colBusy = new Float64Array(width), rowBusy = new Float64Array(height);
    const colBusyRim = new Float64Array(width), rowBusyRim = new Float64Array(height);
    for (let k = 0; k < spots; k += every) {
      const x = spotX[k], y = spotY[k], across = spotAcross[k], down = spotDown[k];
      // A card turned clockwise by this angle has its side edges on x + (y - centre) * slope = constant
      // and its top and bottom edges on y - (x - centre) * slope = constant.
      const column = slope ? Math.round(x + (y - centreY) * slope) : x;
      const row = slope ? Math.round(y - (x - centreX) * slope) : y;
      if (column >= 0 && column < width) {
        if (row < rimY || row >= height - rimY) { colRim[column] += across; colBusyRim[column] += across + down; } else { colEdge[column] += across; colBusy[column] += across + down; }
      }
      if (row >= 0 && row < height) {
        if (column < rimX || column >= width - rimX) { rowRim[row] += down; rowBusyRim[row] += across + down; } else { rowEdge[row] += down; rowBusy[row] += across + down; }
      }
    }
    // At a turn, the rim part of a table line lands a few lines away from its middle part, so
    // for "busier than the table" the busiest rim line within that reach is what gets taken off.
    const rowReach = Math.ceil((width / 2) * Math.abs(slope)) + 2, colReach = Math.ceil((height / 2) * Math.abs(slope)) + 2;
    const nearby = (rimLine, at, reach) => { let most = 0; for (let k = Math.max(0, at - reach); k <= Math.min(rimLine.length - 1, at + reach); k += 1) if (rimLine[k] > most) most = rimLine[k]; return most; };
    let colSum = 0, rowSum = 0, colSquares = 0, rowSquares = 0;
    for (let x = 0; x < width; x += 1) {
      colEdge[x] = Math.max(0, colEdge[x] - colRim[x] * colRimWeight);
      colBusy[x] = Math.max(0, colBusy[x] - nearby(colBusyRim, x, colReach) * colRimWeight);
      colSum += colEdge[x]; colSquares += colEdge[x] * colEdge[x];
    }
    for (let y = 0; y < height; y += 1) {
      rowEdge[y] = Math.max(0, rowEdge[y] - rowRim[y] * rowRimWeight);
      rowBusy[y] = Math.max(0, rowBusy[y] - nearby(rowBusyRim, y, rowReach) * rowRimWeight);
      rowSum += rowEdge[y]; rowSquares += rowEdge[y] * rowEdge[y];
    }
    if (!(colSum > 0) || !(rowSum > 0)) return null;
    // How sharply the lines stand out at this turn. At the card's own turn its edges, and every line of
    // print on it, each fall on a single line here; a degree or two off and they smear across several.
    const sharp = (colSquares * width) / (colSum * colSum) + (rowSquares * height) / (rowSum * rowSum);
    if (sharp > sharpest) sharpest = sharp;
    const colMean = colSum / width, rowMean = rowSum / height;
    const colFloor = (colAverage * FINDER.lineFloor) / every, rowFloor = (rowAverage * FINDER.lineFloor) / every;
    let lefts = candidates(colEdge, 1, leftEnd, colMean, colFloor, FINDER.sideChoices);
    let rights = candidates(colEdge, rightStart, width - 1, colMean, colFloor, FINDER.sideChoices);
    let tops = candidates(rowEdge, 1, topEnd, rowMean, rowFloor, FINDER.endChoices);
    let bottoms = candidates(rowEdge, bottomStart, height - 1, rowMean, rowFloor, FINDER.endChoices);
    let starts = null;
    // An edge line has to be seen on at least one side and one end before "busier than the table" is trusted.
    if (lefts.length + rights.length > 0 && tops.length + bottoms.length > 0) {
      starts = [cardStart(colBusy, 1, leftEnd, colBusyAverage / every), cardStart(colBusy, width - 2, rightStart, colBusyAverage / every), cardStart(rowBusy, 1, topEnd, rowBusyAverage / every), cardStart(rowBusy, height - 2, bottomStart, rowBusyAverage / every)];
      lefts = nearStart(lefts, starts[0], width);
      rights = nearStart(rights, starts[1], width);
      tops = nearStart(tops, starts[2], height);
      bottoms = nearStart(bottoms, starts[3], height);
    }
    const picks = [];
    {
      for (const left of lefts) {
        for (const right of rights) {
          const across = right.index - left.index;
          if (!(across > 0)) continue;
          for (const top of tops) {
            for (const bottom of bottoms) {
              const down = bottom.index - top.index;
              if (!(down > 0)) continue;
              const lines = (left.line ? 1 : 0) + (right.line ? 1 : 0) + (top.line ? 1 : 0) + (bottom.line ? 1 : 0);
              const aspect = across / down;
              const upright = aspect >= look.upright[0] && aspect <= look.upright[1];
              const sideways = aspect >= look.sideways[0] && aspect <= look.sideways[1];
              if (!upright && !sideways) continue;
              const fit = shapeFit(aspect, upright ? look.ideal : 1 / look.ideal);
              // Of the boxes with a card's shape, the outermost is the card; the others are its border or its panels.
              const score = (FINDER.shapeFloor + (1 - FINDER.shapeFloor) * fit) * (1 + FINDER.sizeBonus * ((across * down) / size)) * (0.9 + 0.025 * lines);
              if (picks.length < FINDER.boxesChecked || score > picks[picks.length - 1].score) {
                picks.push({ left: left.index, right: right.index, top: top.index, bottom: bottom.index, sideways, score });
                picks.sort((a, b) => b.score - a.score);
                if (picks.length > FINDER.boxesChecked) picks.length = FINDER.boxesChecked;
              }
            }
          }
        }
      }
    }
    return picks.length ? { picks, starts, slope, tilt: degrees, sharp } : null;
  };
  // Each side of the box has to be real: either the table is blank right up to it (it is where
  // the card starts), or an edge shows along most of its length. Lines that only add up from
  // scattered marks (a patterned mat) or stop part way (a table line meeting a phone) do neither.
  const edgesRunTheLength = (pick, slope, starts) => {
    // The strongest change found on each side's line, place by place along it.
    const leftAt = new Float32Array(height), rightAt = new Float32Array(height), topAt = new Float32Array(width), bottomAt = new Float32Array(width);
    for (let k = 0; k < spots; k += 1) {
      const x = spotX[k], y = spotY[k];
      const column = slope ? Math.round(x + (y - centreY) * slope) : x;
      const row = slope ? Math.round(y - (x - centreX) * slope) : y;
      if (row < 0 || row >= height || column < 0 || column >= width) continue;
      if (row >= pick.top && row <= pick.bottom) {
        if (Math.abs(column - pick.left) <= FINDER.coverReach && spotAcross[k] > leftAt[row]) leftAt[row] = spotAcross[k];
        if (Math.abs(column - pick.right) <= FINDER.coverReach && spotAcross[k] > rightAt[row]) rightAt[row] = spotAcross[k];
      }
      if (column >= pick.left && column <= pick.right) {
        if (Math.abs(row - pick.top) <= FINDER.coverReach && spotDown[k] > topAt[column]) topAt[column] = spotDown[k];
        if (Math.abs(row - pick.bottom) <= FINDER.coverReach && spotDown[k] > bottomAt[column]) bottomAt[column] = spotDown[k];
      }
    }
    // The share of a side that shows the edge about as strongly as the side does on the whole.
    const share = (at, from, to) => {
      const length = Math.max(1, to - from + 1);
      let sum = 0;
      for (let i = from; i <= to; i += 1) sum += at[i];
      const level = Math.max(FINDER.detail, (sum / length) * FINDER.coverLevel);
      let count = 0;
      for (let i = from; i <= to; i += 1) if (at[i] >= level) count += 1;
      return count / length;
    };
    const shares = [share(leftAt, pick.top, pick.bottom), share(rightAt, pick.top, pick.bottom), share(topAt, pick.left, pick.right), share(bottomAt, pick.left, pick.right)];
    const sides = [pick.left, pick.right, pick.top, pick.bottom];
    return sides.every((side, index) => shares[index] >= FINDER.edgeCover || (starts && starts[index] >= 0 && Math.abs(side - starts[index]) <= FINDER.coverReach));
  };
  // The turn is the one where the lines are sharpest. A turned reading must beat straight-on
  // by a little, so an upright card is never turned by noise. Every second degree first, then
  // the degree either side of the best.
  let best = null;
  const tryTurn = (degrees) => {
    if (Math.abs(degrees) > maxTilt) return;
    const found = reading(degrees, FINDER.searchEvery);
    if (!found) return;
    if (best && found.sharp <= best.sharp * (best.tilt === 0 ? FINDER.straightBias : 1)) return;
    best = found;
  };
  tryTurn(0);
  for (let degrees = 2; degrees <= maxTilt; degrees += 2) { tryTurn(degrees); tryTurn(-degrees); }
  if (best && best.tilt !== 0) { const coarse = best.tilt; tryTurn(coarse + 1); tryTurn(coarse - 1); } else { tryTurn(1); tryTurn(-1); }
  // A box that only shows up at a turn where the view is not at its sharpest is made of smeared
  // lines from something that is not a card (a phone, a book).
  if (!best || best.sharp < sharpest * FINDER.sharpShare) return null;
  // The turn is settled; now read it from every spot.
  if (FINDER.searchEvery > 1) best = reading(best.tilt);
  if (!best) return null;
  const pick = best.picks.find((box) => edgesRunTheLength(box, best.slope, best.starts));
  if (!pick) return null;
  // Centre of the card: the point midway between both pairs of turned lines.
  const u = (pick.left + pick.right) / 2 - centreX, v = (pick.top + pick.bottom) / 2 - centreY;
  const along = 1 + best.slope * best.slope;
  const cardX = centreX + (u - best.slope * v) / along, cardY = centreY + (v + best.slope * u) / along;
  const cos = 1 / Math.sqrt(along);
  const w = ((pick.right - pick.left) * cos) / width, h = ((pick.bottom - pick.top) * cos) / height;
  const box = { x: cardX / width - w / 2, y: cardY / height - h / 2, w, h };
  if (box.w < 0.2 || box.h < 0.2) return null;
  if (box.x < 0.03 && box.y < 0.03 && box.w > 0.94 && box.h > 0.94) return null;
  return { ...box, sideways: pick.sideways, tilt: best.tilt };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Grows a rect (video pixels) by `pad` of its size on every side, kept inside the video. */
export function padRect(area, videoWidth, videoHeight, pad = CAMERA_ASSIST.pad) {
  if (!area) return null;
  const dx = area.width * pad, dy = area.height * pad;
  const x = clamp(area.x - dx, 0, videoWidth), y = clamp(area.y - dy, 0, videoHeight);
  return { x, y, width: clamp(area.x + area.width + dx, 0, videoWidth) - x, height: clamp(area.y + area.height + dy, 0, videoHeight) - y };
}

/** RGBA pixels to grayscale (0-255). */
export function toGray(rgba) {
  const gray = new Uint8Array(Math.floor(rgba.length / 4));
  for (let index = 0; index < gray.length; index += 1) gray[index] = (rgba[index * 4] * 3 + rgba[index * 4 + 1] * 6 + rgba[index * 4 + 2]) / 10;
  return gray;
}

/** Share of pixels inside the box (fractions) that are blown-out glare. */
export function glareShare(gray, width, height, box = { x: 0, y: 0, w: 1, h: 1 }, cutoff = CAMERA_ASSIST.glareCutoff) {
  const x0 = Math.floor(box.x * width), x1 = Math.ceil((box.x + box.w) * width);
  const y0 = Math.floor(box.y * height), y1 = Math.ceil((box.y + box.h) * height);
  let bright = 0, total = 0;
  for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
      total += 1;
      if (gray[y * width + x] >= cutoff) bright += 1;
    }
  }
  return total ? bright / total : 0;
}

/** Average local contrast; drops when the camera is out of focus or moving. box (fractions) limits it to part of the view. */
export function edgeSharpness(gray, width, height, box = null) {
  let sum = 0, count = 0;
  const x0 = box ? Math.max(1, Math.floor(box.x * width)) : 1, x1 = box ? Math.min(width - 1, Math.ceil((box.x + box.w) * width)) : width - 1;
  const y0 = box ? Math.max(1, Math.floor(box.y * height)) : 1, y1 = box ? Math.min(height - 1, Math.ceil((box.y + box.h) * height)) : height - 1;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = y * width + x;
      sum += Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width]);
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

/** Remembers recent sharpness so "sharp" means "as sharp as this camera gets here". */
export function createSharpnessGate({ window = CAMERA_ASSIST.sharpWindow, share = CAMERA_ASSIST.sharpShare, min = CAMERA_ASSIST.minSharp } = {}) {
  let recent = [];
  return {
    push(value) {
      recent = [...recent.slice(-(window - 1)), value];
      return value >= min && value >= Math.max(...recent) * share;
    },
    reset() { recent = []; },
  };
}

/**
 * Looks at one grayscale sample of the padded view and says what to fix.
 * Returns { card, tip, ready } where card is the found card box in fractions of
 * the padded view (or null) and tip is short plain text for the person.
 */
// usable (Nov 24 2026): a card of the right shape, upright and close enough;
// only glare or focus stands between it and ready, so holding it still for a
// few seconds takes the picture anyway instead of waiting forever.
export function assessCardView(gray, width, height, { sharp = true, slab = false } = {}) {
  const what = slab ? "slab" : "card";
  const found = findCardInView(gray, width, height, { shape: slab ? "slab" : "card" });
  if (!found) return { card: null, tip: `Line the ${what} up with the frame.`, ready: false, usable: false };
  if (found.sideways) return { card: found, tip: `Turn the ${what} upright, ${slab ? "label" : "name"} at the top.`, ready: false, usable: false };
  if (found.h < CAMERA_ASSIST.minFill) return { card: found, tip: "Move a little closer.", ready: false, usable: false };
  if (textGlare(gray, width, height, found, slab)) return { card: found, glare: true, tip: `Glare on the ${slab ? "label" : "name or number"}. Tilt the ${what} a little or move away from the light.`, ready: false, usable: true };
  // The relative gate alone passes a view that is blurry from the start; the card must also show real detail.
  // Measured inside the outline, so the card's edge against the table does not count as detail.
  const inside = { x: found.x + found.w * 0.1, y: found.y + found.h * 0.1, w: found.w * 0.8, h: found.h * 0.8 };
  // soft: the only thing wrong is focus. dark (Nov 26 2026): and the room is why, so the tip can say so.
  if (!sharp || edgeSharpness(gray, width, height, inside) < CAMERA_ASSIST.cardSharpFloor) return { card: found, soft: true, dark: brightLevel(gray) < CAMERA_ASSIST.darkLevel, tip: "Hold steady while it focuses.", ready: false, usable: true };
  return { card: found, tip: "Hold still…", ready: true, usable: true };
}

/** The brightness that `share` of the view sits at or below (0-255). A lit card lifts it even on a dark table. */
export function brightLevel(gray, share = 0.9) {
  if (!gray?.length) return 0;
  const histogram = new Uint32Array(256);
  for (let index = 0; index < gray.length; index += 1) histogram[gray[index]] += 1;
  const target = gray.length * share;
  let seen = 0;
  for (let level = 0; level < 256; level += 1) {
    seen += histogram[level];
    if (seen >= target) return level;
  }
  return 255;
}

/**
 * Counts how long a found, close, upright card has stayed out of focus. After
 * about three seconds it names what to change: "back" when the card is closer
 * than a phone can focus, otherwise "light". "" until then, and again as soon
 * as the view is anything other than soft.
 */
export function createFocusCoach({ looks = CAMERA_ASSIST.blurryLooks, tooClose = CAMERA_ASSIST.tooCloseFill } = {}) {
  let soft = 0;
  return {
    push(view) {
      soft = view?.soft ? soft + 1 : 0;
      if (soft < looks) return "";
      return view.card?.h >= tooClose ? "back" : "light";
    },
    reset() { soft = 0; },
  };
}

/**
 * The tip shown under the camera, in plain words, and which button it points at
 * ("torch", "zoom" or ""). stuck comes from createFocusCoach.
 */
export function coachTip(view, stuck = "", { torchAvailable = false, torchOn = false, zoomAvailable = false, zoomed = false, slab = false } = {}) {
  const what = slab ? "slab" : "card";
  if (!view) return { tip: "", suggest: "" };
  // With the flashlight on, its own reflection is the usual glare.
  if (view.glare && torchOn) return { tip: `Glare from the flashlight. Turn it off or tilt the ${what} a little.`, suggest: "torch" };
  if (view.soft && view.dark) {
    return torchAvailable && !torchOn
      ? { tip: `It's too dark to read the ${what}. Turn on the flashlight.`, suggest: "torch" }
      : { tip: `It's too dark to read the ${what}. Move to better light.`, suggest: "" };
  }
  if (view.soft && stuck === "back") {
    return zoomAvailable && !zoomed
      ? { tip: "Still blurry. Move back a little, then tap Zoom.", suggest: "zoom" }
      : { tip: "Still blurry. Move back a little so the camera can focus.", suggest: "" };
  }
  if (view.soft && stuck === "light") {
    return torchAvailable && !torchOn
      ? { tip: "Still blurry. Try the flashlight or brighter light.", suggest: "torch" }
      : { tip: "Still blurry. Try brighter light.", suggest: "" };
  }
  return { tip: view.tip || "", suggest: "" };
}

/**
 * Pixel rows of a card picture the reader needs sharp: the name strip and the
 * number strip (a slab: its label). Used to compare pictures taken in a row.
 */
export function textStripRows(height, slab = false) {
  const rows = Math.max(0, Math.floor(height));
  if (rows < 8) return [];
  const strip = (from, share) => {
    const y = Math.min(rows - 3, Math.max(0, Math.floor(rows * from)));
    return { y, h: Math.max(3, Math.min(rows - y, Math.round(rows * share))) };
  };
  return slab ? [strip(0, 0.25)] : [strip(0, 0.16), strip(0.87, 0.13)];
}

/** Which of several pictures is sharpest (index of the highest score; the first wins a tie). -1 for none. */
export function sharpestOf(scores = []) {
  let best = -1;
  for (let index = 0; index < scores.length; index += 1) {
    if (Number.isFinite(scores[index]) && (best < 0 || scores[index] > scores[best])) best = index;
  }
  return best;
}

/**
 * A small brightness picture of just the found card (size x size), so two looks at
 * a card can be compared wherever it sits in the view. Kept a little inside the
 * outline, where the table does not show.
 */
export function cardThumb(gray, width, height, card, size = 16) {
  if (!gray || !card || !(width > 0) || !(height > 0)) return null;
  const left = (card.x + card.w * 0.06) * width, top = (card.y + card.h * 0.06) * height;
  const cellWidth = (card.w * 0.88 * width) / size, cellHeight = (card.h * 0.88 * height) / size;
  if (!(cellWidth > 0) || !(cellHeight > 0)) return null;
  const thumb = new Uint8ClampedArray(size * size);
  if (card.tilt) {
    // A turned card (Nov 26 2026): the same cells, laid out along the card's own sides, so the
    // thumbnail is of the card and not of how it happens to be held.
    const angle = (card.tilt * Math.PI) / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const centreX = (card.x + card.w / 2) * width, centreY = (card.y + card.h / 2) * height;
    const tapsX = Math.min(8, Math.max(2, Math.ceil(cellWidth))), tapsY = Math.min(8, Math.max(2, Math.ceil(cellHeight)));
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        let total = 0, count = 0;
        for (let a = 0; a < tapsY; a += 1) {
          const v = (row + (a + 0.5) / tapsY - size / 2) * cellHeight;
          for (let b = 0; b < tapsX; b += 1) {
            const u = (column + (b + 0.5) / tapsX - size / 2) * cellWidth;
            const x = Math.round(centreX + u * cos - v * sin - 0.5), y = Math.round(centreY + u * sin + v * cos - 0.5);
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            total += gray[y * width + x];
            count += 1;
          }
        }
        thumb[row * size + column] = count ? total / count : 0;
      }
    }
    return thumb;
  }
  for (let row = 0; row < size; row += 1) {
    const y0 = clamp(Math.floor(top + row * cellHeight), 0, height - 1), y1 = clamp(Math.ceil(top + (row + 1) * cellHeight), y0 + 1, height);
    for (let column = 0; column < size; column += 1) {
      const x0 = clamp(Math.floor(left + column * cellWidth), 0, width - 1), x1 = clamp(Math.ceil(left + (column + 1) * cellWidth), x0 + 1, width);
      let total = 0;
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) total += gray[y * width + x];
      thumb[row * size + column] = total / ((y1 - y0) * (x1 - x0));
    }
  }
  return thumb;
}

/** True when two found card boxes (fractions) are the same card in the same place, give or take a little. */
export function sameCardBox(a, b, tolerance = CAMERA_ASSIST.sameBoxTolerance) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance
    && Math.abs(a.x + a.w - (b.x + b.w)) <= tolerance && Math.abs(a.y + a.h - (b.y + b.h)) <= tolerance;
}

/**
 * Glare only blocks a scan where the reader needs the text (Nov 24 2026): the
 * name strip and number strip of a card, or the label of a slab. Shine across
 * holo art is fine unless it covers most of the card.
 */
export function textGlare(gray, width, height, card, slab = false) {
  const strip = (top, share) => ({ x: card.x, y: card.y + card.h * top, w: card.w, h: card.h * share });
  const strips = slab ? [strip(0, 0.25)] : [strip(0, 0.14), strip(0.88, 0.12)];
  return strips.some((box) => glareShare(gray, width, height, box) > CAMERA_ASSIST.maxGlare)
    || glareShare(gray, width, height, card) > CAMERA_ASSIST.maxArtGlare;
}

/**
 * Where to cut the picture (video pixels): the found card plus a hair of margin, else the frame itself.
 * A card turned by straightenFrom degrees or more also gets `tilt`: the rectangle is then the card's own
 * (upright, centred on the card), and the picture is turned by that much so it reaches the reader upright.
 */
export function captureRect({ padded, frame, card }) {
  if (!padded || !card) return frame;
  const margin = CAMERA_ASSIST.captureMargin;
  if (Math.abs(card.tilt || 0) >= CAMERA_ASSIST.straightenFrom) {
    const width = (card.w + 2 * margin) * padded.width, height = (card.h + 2 * margin) * padded.height;
    const centreX = padded.x + (card.x + card.w / 2) * padded.width, centreY = padded.y + (card.y + card.h / 2) * padded.height;
    return { x: centreX - width / 2, y: centreY - height / 2, width, height, tilt: card.tilt };
  }
  const x = padded.x + clamp(card.x - margin, 0, 1) * padded.width;
  const y = padded.y + clamp(card.y - margin, 0, 1) * padded.height;
  const right = padded.x + clamp(card.x + card.w + margin, 0, 1) * padded.width;
  const bottom = padded.y + clamp(card.y + card.h + margin, 0, 1) * padded.height;
  return { x, y, width: right - x, height: bottom - y };
}
