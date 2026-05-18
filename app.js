mapboxgl.accessToken = "pk.eyJ1Ijoic2FuamFuYXJhbTQxMCIsImEiOiJjbXBiZWx5dGkwM3pzMnNwdHdpbW1taHd1In0.z1RzG2XT6J5sqGBXLizpDA";

const GEOJSON_URLS = [
  "https://ana410.github.io/location_data/locations.geojson",
  "https://raw.githubusercontent.com/Ana410/location_data/main/locations.geojson"
];

// -----------------------------
// 1. TEXAS BOUNDS
// -----------------------------
const TEXAS_BOUNDS = [
  [-106.65, 25.84], // SW
  [-93.51, 36.50]   // NE
];

// -----------------------------
// 2. MAP INIT
// -----------------------------
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [-97.0, 31.0],
  zoom: 6
});

// -----------------------------
// 3. STATE CONTROL
// -----------------------------
let lastFetchTime = 0;
const MIN_REFRESH_INTERVAL = 30000; // 30s throttle
let isFetching = false;

// -----------------------------
// 4. UTILITY: CHECK TEXAS VIEW
// -----------------------------
function isInTexasView() {
  const bounds = map.getBounds();

  return (
    bounds.getWest() <= TEXAS_BOUNDS[1][0] &&
    bounds.getEast() >= TEXAS_BOUNDS[0][0] &&
    bounds.getSouth() <= TEXAS_BOUNDS[1][1] &&
    bounds.getNorth() >= TEXAS_BOUNDS[0][1]
  );
}

// -----------------------------
// 5. FETCH GEOJSON
// -----------------------------
async function fetchGeoJSON() {
  let lastError = null;

  for (const url of GEOJSON_URLS) {
    try {
      const res = await fetch(url + "?t=" + Date.now());

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Unable to load GeoJSON data");
}

// -----------------------------
// 6. SAFE REFRESH (THROTTLED)
// -----------------------------
async function refreshData() {
  const now = Date.now();

  if (isFetching) return;

  if (now - lastFetchTime < MIN_REFRESH_INTERVAL) return;

  if (!isInTexasView()) return;

  isFetching = true;

  try {
    const data = await fetchGeoJSON();

    const source = map.getSource("locations");

    if (source) {
      source.setData(data);
    }

    lastFetchTime = now;

  } catch (err) {
    console.error("GeoJSON refresh failed:", err);
  }

  isFetching = false;
}

// -----------------------------
// 7. INITIAL LOAD
// -----------------------------
map.on("load", async () => {

  // LOCK MAP TO TEXAS
  map.setMaxBounds(TEXAS_BOUNDS);
  map.fitBounds(TEXAS_BOUNDS);

  // LOAD INITIAL DATA
  const data = await fetchGeoJSON();

  map.addSource("locations", {
    type: "geojson",
    data: data
  });

  // POINT LAYER
  map.addLayer({
    id: "locations-layer",
    type: "circle",
    source: "locations",
    paint: {
      "circle-radius": 6,
      "circle-color": "#007cbf",
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  });

  // POPUPS
  map.on("click", "locations-layer", (e) => {
    const props = e.features[0].properties;

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="font-family: sans-serif;">
          <h3>${props.name || "Unknown"}</h3>
          <p><b>Company:</b> ${props.company || ""}</p>
          <p><b>Address:</b> ${props.address || ""}</p>
          <p><b>Contact:</b> ${props.contact || ""}</p>
          <p><b>Email:</b> ${props.email || ""}</p>
        </div>
      `)
      .addTo(map);
  });

  map.on("mouseenter", "locations-layer", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "locations-layer", () => {
    map.getCanvas().style.cursor = "";
  });

});

// -----------------------------
// 8. SMART REFRESH TRIGGERS
// -----------------------------

// A. periodic refresh (throttled)
setInterval(refreshData, 30000);

// B. refresh when user returns to tab
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshData();
  }
});

// C. refresh after map movement
map.on("moveend", refreshData);
map.on("zoomend", refreshData);