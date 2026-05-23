const sharp = require('sharp');

/**
 * Color analysis for colortry.
 * Input: image file path
 * Output: { themeHue, primary, bg, card, cardContent, textPrimary, textSecondary, accentColor, isDark, palette }
 */
async function analyzeColors(imgPath) {
  // 1. Get raw pixel data
  const { data, info } = await sharp(imgPath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  // 2. Extract all pixels into HSL
  const pixels = [];
  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels] / 255;
    const g = data[i * channels + 1] / 255;
    const b = data[i * channels + 2] / 255;
    const hsl = rgbToHsl(r, g, b);
    pixels.push(hsl);
  }

  // 3. Analyze bottom 100px for dark mode detection
  const bottomY = Math.max(0, height - 100);
  const bottomPixels = [];
  for (let y = bottomY; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx] / 255;
      const g = data[idx + 1] / 255;
      const b = data[idx + 2] / 255;
      bottomPixels.push({ r, g, b, lightness: (Math.max(r, g, b) + Math.min(r, g, b)) / 2 });
    }
  }

  const avgBottomL = bottomPixels.reduce((s, p) => s + p.lightness, 0) / bottomPixels.length;
  const isDark = avgBottomL < 0.5;

  // 4. Filter interference colors & cluster main colors
  // Filter: remove L > 80% (too bright) and S < 30% (gray/white)
  const validPixels = pixels.filter(hsl => {
    const [h, s, l] = hsl;
    return l <= 0.8 && s >= 0.3;
  });

  if (validPixels.length === 0) {
    // Fallback: low saturation image, use default
    return buildFallbackPalette();
  }

  // 5. Bin hues into 5-degree buckets for clustering
  const hueBuckets = new Array(72).fill(0); // 360 / 5 = 72 buckets
  for (const [h] of validPixels) {
    const idx = Math.floor(h / 5);
    hueBuckets[Math.min(idx, 71)]++;
  }

  // 6. Merge adjacent buckets within ±12 degrees (±2 buckets of 5°)
  const merged = mergeHueClusters(hueBuckets, 2); // ±2 buckets = ±12°

  // 7. Find dominant hue (largest cluster)
  let maxCount = 0;
  let dominantHue = 0;
  for (const cluster of merged) {
    if (cluster.count > maxCount) {
      maxCount = cluster.count;
      dominantHue = cluster.center;
    }
  }

  // 8. Calculate average S and L for the dominant hue range
  const dominantRange = getClusterRange(dominantHue, hueBuckets, 2);
  const dominantPixels = validPixels.filter(([h]) => isHueInRange(h, dominantRange));
  const avgS = dominantPixels.reduce((s, [, sv]) => s + sv, 0) / dominantPixels.length;
  const avgL = dominantPixels.reduce((s, [, , lv]) => s + lv, 0) / dominantPixels.length;

  const themeHue = Math.round(dominantHue);

  // 9. Extract accent color for dark mode (non-theme, high saturation, high lightness)
  const accentColor = extractAccentColor(validPixels, themeHue);

  // 10. Build the full palette
  const palette = buildPalette(themeHue, accentColor, isDark);

  return palette;
}

// ============ Helper Functions ============

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return [h * 360, s, l];
}

function mergeHueClusters(buckets, neighborRange) {
  const visited = new Set();
  const clusters = [];

  for (let i = 0; i < buckets.length; i++) {
    if (visited.has(i) || buckets[i] === 0) continue;

    // Find contiguous neighbors (circular)
    let clusterPixels = 0;
    let weightedHue = 0;
    const range = [];

    for (let offset = -neighborRange; offset <= neighborRange; offset++) {
      const j = ((i + offset) % buckets.length + buckets.length) % buckets.length;
      if (buckets[j] > 0) {
        visited.add(j);
        clusterPixels += buckets[j];
        weightedHue += j * 5 * buckets[j];
        range.push(j * 5);
      }
    }

    clusters.push({
      center: weightedHue / clusterPixels,
      count: clusterPixels,
      range: range
    });
  }

  return clusters;
}

function getClusterRange(center, buckets, neighborRange) {
  const minH = ((center - neighborRange * 5) + 360) % 360;
  const maxH = (center + neighborRange * 5) % 360;
  return { min: minH, max: maxH };
}

function isHueInRange(hue, range) {
  if (range.min < range.max) {
    return hue >= range.min && hue <= range.max;
  } else {
    // Wraps around 0°
    return hue >= range.min || hue <= range.max;
  }
}

function extractAccentColor(validPixels, themeHue) {
  // Exclude themeHue ±30°, filter S >= 60%, L >= 60%
  const candidates = validPixels.filter(([h, s, l]) => {
    const hueDiff = Math.abs(h - themeHue);
    const inTheme = hueDiff <= 30 || hueDiff >= 330;
    return !inTheme && s >= 0.6 && l >= 0.6;
  });

  if (candidates.length === 0) {
    // Fallback: use brightest color in theme hue
    const brightTheme = validPixels.filter(([, , l]) => l >= 0.6).sort((a, b) => b[2] - a[2]);
    if (brightTheme.length > 0) {
      const [h, s, l] = brightTheme[0];
      return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
    }
    return { h: themeHue, s: 100, l: 65 };
  }

  // Most prevalent accent color
  const hueBuckets = new Array(72).fill(0);
  for (const [h] of candidates) {
    const idx = Math.floor(h / 5);
    hueBuckets[Math.min(idx, 71)]++;
  }

  let maxIdx = 0;
  for (let i = 1; i < 72; i++) {
    if (hueBuckets[i] > hueBuckets[maxIdx]) maxIdx = i;
  }

  const avgSL = candidates.filter(([h]) => Math.floor(h / 5) === maxIdx);
  const avgS = avgSL.reduce((s, [, sv]) => s + sv, 0) / avgSL.length;
  const avgL = avgSL.reduce((s, [, , lv]) => s + lv, 0) / avgSL.length;

  return { h: Math.round(maxIdx * 5), s: Math.round(avgS * 100), l: Math.round(avgL * 100) };
}

function buildPalette(themeHue, accentColor, isDark) {
  const h = themeHue;

  if (isDark) {
    return {
      themeHue,
      accentColor: `hsl(${accentColor.h}, ${accentColor.s}%, ${accentColor.l}%)`,
      isDark,
      bg: `hsl(${h}, 15%, 18%)`,
      card: `hsla(${h}, 15%, 30%, 0.75)`,
      cardContent: `hsl(${h}, 10%, 40%)`,
      primary: `hsl(${accentColor.h}, ${accentColor.s}%, ${accentColor.l}%)`,
      textPrimary: `hsl(${h}, 15%, 92%)`,
      textSecondary: `hsl(${h}, 10%, 78%)`,
      border: `rgba(255,255,255,0.08)`,
      palette: [
        { label: '主色调', value: `hsl(${h}, 50%, 40%)` },
        { label: '按钮色', value: `hsl(${accentColor.h}, ${accentColor.s}%, ${accentColor.l}%)` },
        { label: '背景色', value: `hsl(${h}, 15%, 18%)` },
        { label: '卡片色', value: `hsla(${h}, 15%, 30%, 0.75)` },
        { label: '强调色', value: `hsl(${accentColor.h}, ${accentColor.s}%, ${accentColor.l}%)` },
        { label: '模式', value: '深色' },
      ]
    };
  }

  // Light mode
  return {
    themeHue,
    accentColor,
    isDark,
    bg: `hsl(${h}, 42%, 93%)`,
    card: `hsl(${h}, 6%, 98%)`,
    cardContent: `hsl(${h}, 10%, 97%)`,
    primary: `hsl(${h}, 100%, 65%)`,
    textPrimary: `hsl(${h}, 40%, 20%)`,
    textSecondary: `hsl(${h}, 25%, 35%)`,
    border: `rgba(0,0,0,0.08)`,
    palette: [
      { label: '主色调', value: `hsl(${h}, 50%, 50%)` },
      { label: '按钮色', value: `hsl(${h}, 100%, 65%)` },
      { label: '背景色', value: `hsl(${h}, 42%, 93%)` },
      { label: '卡片色', value: `hsl(${h}, 6%, 98%)` },
      { label: '内容底色', value: `hsl(${h}, 10%, 97%)` },
      { label: '模式', value: '浅色' },
    ]
  };
}

function buildFallbackPalette() {
  return buildPalette(210, { h: 200, s: 90, l: 60 }, false);
}

// CLI usage: node color-analyze.js <image_path>
if (require.main === module) {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node color-analyze.js <image_path>');
    process.exit(1);
  }
  analyzeColors(path).then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { analyzeColors };
