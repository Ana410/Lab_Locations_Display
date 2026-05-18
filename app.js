mapboxgl.accessToken = "pk.eyJ1Ijoic2FuamFuYXJhbTQxMCIsImEiOiJjbXBiZWx5dGkwM3pzMnNwdHdpbW1taHd1In0.z1RzG2XT6J5sqGBXLizpDA";

const GEOJSON_URLS = [
  "https://ana410.github.io/location_data/locations.geojson",
  "https://raw.githubusercontent.com/Ana410/location_data/main/locations.geojson"
];

const TXDOT_DISTRICTS_URL =
  "https://ana410.github.io/location_data/TxDOT_Districts_-495511146228322221.geojson";

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

function formatExpirationDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();

  return `${month}/${day}/${year}`;
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

    // Ensure the source exists and always replace its data.
    const existing = map.getSource("locations");

    if (existing) {
      existing.setData(data);
    } else {
      map.addSource("locations", { type: "geojson", data });
    }

    lastFetchTime = now;

  } catch (err) {
    console.error("GeoJSON refresh failed:", err);

    // If the dataset returns a 404 (deleted/missing), clear the map pins
    // by replacing the source data with an empty FeatureCollection.
    try {
      const source = map.getSource("locations");
      if (source && err && String(err.message).includes("404")) {
        source.setData({ type: "FeatureCollection", features: [] });
      }
    } catch (clearErr) {
      console.error("Failed to clear locations source:", clearErr);
    }
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
  map.addSource("txdot-districts", {
    type: "geojson",
    data: TXDOT_DISTRICTS_URL
  });

  // POINT LAYER
  map.addLayer({
    id: "locations-layer",
    type: "circle",
    source: "locations",
    paint: {
      "circle-radius": 8,
      "circle-color": [
        "match",
        ["get", "expiring_soon"],
        "expired", "#ff3b30",
        "expiring_soon", "#ff9500",
        "normal", "#2b8cff",
        "#2b8cff"
      ],
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  });
  map.addLayer({
    id: "district-fill",
    type: "fill",
    source: "txdot-districts",

    paint: {
      "fill-color": "#888",
      "fill-opacity": 0.08
    }
  });
  map.addLayer({
    id: "district-borders",
    type: "line",
    source: "txdot-districts",

    paint: {
      "line-color": "#444",
      "line-width": 2,
      "line-opacity": 0.95
    }
  });
  map.on("click", "district-fill", (e) => {
    const props = e.features && e.features[0] ? e.features[0].properties : {};
    const districtName = props.DIST_NM || props.dist_nm || props.name || "Unknown district";

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="font-family: sans-serif;">
          <h3>${districtName}</h3>
        </div>
      `)
      .addTo(map);
  });

  map.on("mouseenter", "district-fill", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "district-fill", () => {
    map.getCanvas().style.cursor = "";
  });

  // POPUPS
  map.on("click", "locations-layer", (e) => {
    const props = e.features[0].properties;
    console.log(props);
    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="font-family: sans-serif;">
          <h3>${props.name || "Unknown"}</h3>
          <p><b>ID:</b> ${props.lab_id || ""}</p>
          <p><b>Area:</b> ${props.area || ""}</p>
          <p><b>Address:</b> ${props.address || ""}</p>
          <p><b>Contact:</b> ${props.contact || ""}</p>
          <p><b>Email:</b> ${props.email || ""}</p>
          <p><b>Expiration Date:</b> ${formatExpirationDate(props.expiration)}</p>
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

  // EXPIRING SOON TOGGLE: show only labs that are expired or expiring soon
  const expiringToggle = document.getElementById("expiring-toggle");
  const expiringFilter = [
    "any",
    ["==", ["get", "expiring_soon"], "expiring_soon"]
  ];

  function applyExpiringFilter(enabled) {
    try {
      if (enabled) {
        map.setFilter("locations-layer", expiringFilter);
      } else {
        map.setFilter("locations-layer", null);
      }
    } catch (err) {
      // layer may not be ready yet; ignore
      console.error("Failed to set filter:", err);
    }
  }

  if (expiringToggle) {
    // initialize based on current checkbox state
    applyExpiringFilter(expiringToggle.checked);

    expiringToggle.addEventListener("change", (ev) => {
      applyExpiringFilter(ev.target.checked);
    });
  }

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