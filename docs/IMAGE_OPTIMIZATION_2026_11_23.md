# Approved image release — November 23, 2026

794 local inspection images were reviewed. The active set drops from 254,423,427 to 172,499,041 bytes (32.2%; 78.1 MiB saved). This is measured against original source photos, not the earlier unpublished 1,400-pixel draft. Original pixel density is retained; unused margins outside verified face polygons are removed without resampling. All 41 local card images preserve their visible pixels. Remote catalog card images are unchanged.

The release includes the approved viewer support for real carton headers, photographed galleries, load retries, and hosted image loading in native builds. Inspection rasters remain excluded from the Android/iOS installation bundle. Publishing this web release does not update an already-installed Google Play binary; native changes take effect in the next native build.

Changed images use new, content-versioned paths. Older deployed image URLs and bytes remain available so cached pages and installed clients do not apply their old coordinates to new cropped photos. Thus active-image download/storage savings are 32.2%; total deployment storage also includes legacy compatibility assets. Original research photos are archived outside the published application.

The release starts from production commit bd151a305579fbc097e4f182be751c47adc447cb. It changes no generated catalog or price files, saved records, authentication, database, sync or billing behavior. The independent image manifest records original and output hashes, dimensions, crop rectangles and quality measurements. Photographic conversions are WebP quality 94 or higher, with visible-pixel PSNR >=42 dB; larger or lower-quality conversions retain the original file. This does not invent missing detail in a blurry source.

Validation: source/output hash checks, exact crop-coordinate checks, focused viewer/identity tests, production build, source lint, current CI node suites, and phone/desktop browser inspection. Existing source photos and identity evidence remain attached to each profile.
