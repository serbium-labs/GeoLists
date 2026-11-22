# GeoLists

A web application for managing lists of geographic points anywhere in the world. List data is stored in IndexedDB; the map can switch between OpenFreeMap and fully local Protomaps PMTiles archives.

## Development

Node.js 20.19+ or 22.12+ is required.

```bash
npm install
npm run dev
```

Vite mode is convenient for development but does not provide the map update API. To run the full application locally:

```bash
npm run build
npm run serve
# http://127.0.0.1:4173
```

The `HTTP_HOST` environment variable changes the address on which the production server listens. Without it, the server remains accessible only on the safe local address `127.0.0.1`; the container explicitly sets `0.0.0.0`.

## Production deployment with Docker

Docker with the Compose plugin is required. Build and start the application with a single command:

```bash
docker compose up -d --build
```

GeoLists will be available at `http://127.0.0.1:4173`. By default, the port is published only on the host's loopback interface. The same Node.js process serves the API, PMTiles Range requests, and local glyph files. Check its status at `http://127.0.0.1:4173/health` or with `docker compose ps`.

Container management:

```bash
# View logs
docker compose logs -f geolists

# Stop and remove the container while preserving maps
docker compose down

# Pull the updated base image, rebuild the application, and recreate the container
docker compose build --pull
docker compose up -d
```

Maps and `active.json` are stored in the named `maps` volume mounted at `/app/data/maps`. The container runs as the unprivileged `node` user, which has write access to this directory. `docker compose down` preserves the volume; do not use `docker compose down -v` if you want to retain downloaded maps. To find the actual volume name, run `docker volume ls --filter label=com.docker.compose.project=geolists`; include this volume in your Docker volume backups. Rebuilding the image neither embeds nor overwrites the volume data.

## Offline map source for distribution

The script uses the official `pmtiles` CLI and its `extract` command to retrieve only the Saint Petersburg bounding box from a daily [Protomaps Basemap](https://docs.protomaps.com/basemaps/downloads) build. It does not download the entire planet archive. The standard public OpenStreetMap tile servers are not used.

These steps are performed by the distribution maintainer, not by end users:

1. Install the [pmtiles CLI](https://docs.protomaps.com/pmtiles/cli).
2. Find an available build date at [maps.protomaps.com/builds](https://maps.protomaps.com/builds/).
3. Prepare the regional archive:

```bash
BUILD_DATE=20261012 npm run map:prepare
npm run build
npm run serve
```

`map:prepare` extracts the bounding box `29.40,59.63,31.05,60.25` up to zoom level 15 into `data/maps`, runs `pmtiles verify`, calculates SHA-256, and creates the `active.json` pointer used by the server. The bounds can be overridden with `SPB_BOUNDS`. The script also downloads the required local Noto Sans ranges (Latin, Cyrillic, and punctuation) and their license from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets). After preparation, the offline style contains no external URLs: buildings, roads, and labels are loaded exclusively from `127.0.0.1`.

The archives and active pointer are intentionally excluded from Git. A compatible archive can be placed manually at `public/maps/spb.pmtiles`, but this approach has no version metadata and is unsuitable for managed updates.

## Publishing the map and manifest

The initial installation and subsequent updates require a small JSON manifest hosted on an HTTPS endpoint under your control, along with a prepared regional PMTiles archive. Archives and `active.json` are not committed to Git.

Initial publication through GitHub Releases:

1. Create a GitHub Release for the GeoLists repository.
2. Attach `data/maps/spb-<version>.pmtiles` as a release asset and wait for the upload to complete.
3. Open the asset download link in a browser and copy its actual HTTPS URL. Do not construct the URL manually: the owner name, tag, or asset name may differ.
4. Generate the manifest from the same local file:

```bash
npm run map:manifest -- \
  --archive data/maps/spb-20261111.pmtiles \
  --version 20261111 \
  --url "$PUBLISHED_ARCHIVE_URL" \
  --bounds 29.40,59.63,31.05,60.25 \
  --max-zoom 15 \
  --output spb-latest.json
```

The generator validates PMTiles v3, calculates the actual size and SHA-256, and atomically creates the JSON file:

```json
{
  "version": "2026-10-12",
  "url": "<actual HTTPS URL of the release asset>",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "size": 123456789,
  "bounds": [29.4, 59.63, 31.05, 60.25],
  "maxZoom": 15
}
```

Spatial metadata is mandatory for newly generated manifests. Existing GeoLists manifests without these fields remain compatible and use the historical Saint Petersburg bounds and zoom 15 during validation.

5. Attach `spb-latest.json` to the Release as an asset with a stable name. For TASK 005, the expected URL is `https://github.com/serbium-labs/GeoLists/releases/download/map-spb-20261111/spb-latest.json`. Until this URL returns JSON with HTTP 200, the update integration is not considered published.
6. Record the verified manifest URL in the tracked `config/map-updates.json` file:

```json
{
  "manifestUrl": "<actual HTTPS URL of the published spb-latest.json>"
}
```

After distribution, end users do not need to set an environment variable. `MAP_UPDATE_MANIFEST_URL` is retained only as an override for development and test environments and takes precedence over the configuration file.

To update the map, prepare a new regional archive, publish it as a new asset, rerun `map:manifest` with the new version and actual URL, and replace the contents of the manifest at its stable URL. If the hosting service does not allow an asset to be replaced, publish a new manifest and update `config/map-updates.json` in the next application release.

The “Check” action compares the manifest `version` with the active version. “Download map” for initial installation and “Download update” for subsequent updates delegate downloading to the Node.js server rather than the browser. Before opening a network connection, the server validates the declared archive size, bounds, maximum zoom, persistent storage limit, and available disk space. It then streams the data into a separate temporary file and displays actual progress, verifies the declared size, SHA-256, and PMTiles v3 header, and atomically replaces `active.json`. On failure, the temporary file is removed and the previous archive remains active. On success, one recent inactive archive is retained for recovery and older inactive archives are removed. The application automatically selects local mode and opens the new versioned archive URL; neither the server nor the page needs to be restarted.

Protomaps does not publish a ready-made stable URL specifically for the Saint Petersburg extract: the official source is the daily planet build, while the regional artifact is prepared and hosted by the application maintainer.

## First-time installation for end users

In the published distribution, the manifest URL is already provided in `config/map-updates.json`. The user opens GeoLists, waits for the “Map available” status in the “Map source” section, and clicks “Download map”. The interface shows the version, size, percentage, and downloaded bytes, followed by SHA-256 verification. After the “Map installed and ready to use” message, the application automatically switches to the local map. GeoLists then reads the archive from `data/maps` and can use it without internet access; a failed update check does not remove the installed map.

The TASK 005 configuration references the published `spb-latest.json` from Release `map-spb-20261111`. The manifest URL and archive have been verified by an integration test: initial installation, SHA-256 verification, activation, Range requests, and restarting in local mode all work through the GeoLists server.

## Offline and online modes

The selected mode is saved in `localStorage`. When starting in local mode, the application does not request the online style. PMTiles, glyph PBF files, JS, and CSS are served by the local server; PMTiles is read using Range requests. Online mode uses the public [OpenFreeMap Liberty](https://openfreemap.org/) style and requires internet access for the style, tiles, fonts, and sprites.

A local server is required for offline use after installation: opening `index.html` via `file://` does not support the required Range requests and update API correctly.

### Custom offline regions

Open the online map, move and zoom it to the required rectangular area, and select **Use current map view** under **Offline regions**. GeoLists estimates the archive size before allowing the download. The server then extracts the selected area, verifies the resulting PMTiles v3 archive, checks the configured storage limits again, and activates the region atomically. Installed regions remain available in the same panel and can be activated without downloading them again.

The Docker image includes PMTiles CLI 1.31.2. When the server is run outside Docker, install a compatible `pmtiles` executable in `PATH` or set `PMTILES_BIN` to its location. `MAP_REGION_SOURCE_URL` can override the default daily Protomaps archive and must be an HTTPS URL. Size estimates are intentionally conservative; the final archive must still satisfy `MAP_MAX_ARCHIVE_BYTES`, `MAP_MAX_STORED_BYTES`, `MAP_MIN_FREE_BYTES`, `MAP_MAX_REGION_AREA_KM2`, and `MAP_MAX_ZOOM`.

Region downloads can be cancelled while extraction is running. Existing manifest-based archives and `/maps/spb.pmtiles` remain supported.

## User input and `.mapdata` validation

The interface, `.mapdata` import, and IndexedDB repository use the same validation rules. Text is normalized to Unicode NFC, surrounding whitespace is removed, and CRLF/CR line endings are converted to LF. Valid Unicode is preserved. Single-line fields accept printable Unicode without line breaks; comments additionally accept line breaks. Control characters and invalid Unicode sequences are rejected. Lengths are measured in Unicode code points rather than UTF-16 code units.

| Field | Required | Maximum length | Additional rules |
| --- | --- | ---: | --- |
| List name | Yes | 100 | Printable single-line Unicode |
| Point name | Yes | 150 | Printable single-line Unicode |
| Business / organization | No | 200 | Printable single-line Unicode |
| Address | No | 500 | Printable single-line Unicode |
| Business hours | No | 300 | Printable single-line Unicode |
| Website | No | 2,048 | Absolute URL using only HTTP or HTTPS; normalized by the URL parser |
| Comment | No | 3,000 | Printable Unicode and line breaks |
| Latitude | Yes | — | Finite number from −90 through 90 |
| Longitude | Yes | — | Finite number from −180 through 180 |

Imports are limited to 10 MB and 10,000 points. List and point identifiers and timestamps are validated separately as `.mapdata` structural metadata. Imports are committed to IndexedDB in one transaction, so a failed import does not leave partial data. Export file names are normalized, limited to 180 Unicode code points, and have file-system control and reserved characters replaced.

The SHA-256 checksum in a `.mapdata` document detects accidental corruption or modification of its contents. It does not authenticate the author or establish that a document comes from a trusted source.

## Optional reverse geocoding

Address lookup is disabled by default. Configure a Nominatim-compatible HTTPS reverse endpoint on the server to enable the **Find address from coordinates** action:

```bash
REVERSE_GEOCODING_URL=https://your-nominatim.example/reverse npm run serve
```

GeoLists never sends point coordinates to a geocoding service automatically. A request is made only after the user selects the lookup action in the point form. The returned address is shown as a suggestion with OpenStreetMap attribution and does not replace manual input until the user selects **Use this address**. Manual entry and saving continue to work when the service is not configured, offline, unavailable, or returns no result.

The server hides the configured endpoint from the browser, identifies GeoLists through its User-Agent, limits upstream traffic to one request per second, and keeps a bounded in-memory cache for repeated coordinates. Operators using the public OpenStreetMap Nominatim instance must review and continue to comply with its [usage policy](https://operations.osmfoundation.org/policies/nominatim/), including its capacity, attribution, caching, and privacy requirements. Do not send personal data or confidential locations to a third-party geocoding service. A self-hosted Nominatim-compatible endpoint is recommended for larger or privacy-sensitive deployments.

## Storage, data sources, and licenses

- The large PMTiles archive is stored in the file system rather than IndexedDB/Cache API: browser storage quotas vary and cached data may be automatically evicted.
- Protomaps Basemap is based on OpenStreetMap and is distributed as a Produced Work under the ODbL; the local map displays attribution to Protomaps and © OpenStreetMap contributors.
- Noto Sans glyphs are distributed under the SIL Open Font License; the script downloads the license alongside the files.
- A zoom-15 archive should not be expected to contain details available only at zoom 16+. Its size depends on the build date and bounding box.
- The server listens only on `127.0.0.1`. Shared access requires TLS, authentication, and a reverse proxy.
- Map update and reverse-geocoding POST endpoints require the `X-GeoLists-CSRF: 1` header. Direct loopback access is allowed without a bearer token. The Docker Compose configuration explicitly enables local-only access because its published port is bound to `127.0.0.1`.
- An externally accessible deployment must set `MAP_UPDATE_API_TOKEN`, remove `MAP_UPDATE_API_LOCAL_ONLY`, and configure the TLS reverse proxy to inject `Authorization: Bearer <token>` for protected mutations under `/api/maps`, `/api/regions`, and `/api/geocoding`. The token must remain server-side and must never be exposed to browser code.
- Offline map storage defaults to a 1 GiB archive limit, 2 GiB total retained storage, 512 MiB of free space after reserving the download, a 10,000 km² region, zoom 15, and one inactive recovery archive. Deployments may override these values with `MAP_MAX_ARCHIVE_BYTES`, `MAP_MAX_STORED_BYTES`, `MAP_MIN_FREE_BYTES`, `MAP_MAX_REGION_AREA_KM2`, `MAP_MAX_ZOOM`, and `MAP_RETAINED_INACTIVE_ARCHIVES`; at least one inactive recovery archive is always retained.

## Checks

```bash
npm run typecheck
npm run test
npm run build
```
