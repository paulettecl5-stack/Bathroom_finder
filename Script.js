/* ────────────────────────────────────────────────
   FlushNYC — script.js
   Queries NYC Open Data (Socrata SODA API) for
   public restroom data entirely from the frontend.
   Auth + favorites powered by Supabase.
   ──────────────────────────────────────────────── */

"use strict";

// ── SUPABASE CONFIG ───────────────────────────────
// Replace these two values with your own from:
// Supabase Dashboard → Project Settings → API
const SUPABASE_URL    = "https://frknwwxlmbiaredbunaf.supabase.co";
const SUPABASE_ANON   = "sb_publishable_aoM0IQ0ZtNiXF8JgrxMTAw_auMtuvjo";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── CONFIG ────────────────────────────────────────
const API_BASE   = "https://data.cityofnewyork.us/resource/i7jb-7jku.json";
const MAX_RADIUS = 2000;
const MAX_RESULTS = 50;

// ── STATE ─────────────────────────────────────────
let userLat = null;
let userLng = null;
let allResults = [];
let filteredResults = [];
let activeFilter = "all";
let boroughQuery = "";
let map = null;
let markers = [];
let userMarker = null;
let currentUser = null;

// ── DOM REFS ──────────────────────────────────────
const locateBtn      = document.getElementById("locate-btn");
const locateBtn2     = document.getElementById("locate-btn-2");
const retrBtn        = document.getElementById("retry-btn");
const boroughInput   = document.getElementById("borough-filter");
const pillBtns       = document.querySelectorAll(".pill");
const resList        = document.getElementById("restroom-list");
const resHeader      = document.getElementById("results-count-text");
const stateIdle      = document.getElementById("state-idle");
const stateLoading   = document.getElementById("state-loading");
const stateError     = document.getElementById("state-error");
const errorMsg       = document.getElementById("error-msg");
const mapPlaceholder = document.getElementById("map-placeholder");
const leafletMap     = document.getElementById("leaflet-map");
const headerAuth     = document.getElementById("header-auth");

// Auth modal
const authModal      = document.getElementById("auth-modal");
const modalClose     = document.getElementById("modal-close");
const modalTabs      = document.querySelectorAll(".modal-tab");
const loginForm      = document.getElementById("login-form");
const regForm        = document.getElementById("register-form");
const loginError     = document.getElementById("login-error");
const regError       = document.getElementById("reg-error");

// ── SUPABASE AUTH ─────────────────────────────────
sb.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  renderHeaderAuth();
});

function renderHeaderAuth() {
  if (currentUser) {
    headerAuth.innerHTML = `
      <div class="header-user">
        <span class="header-email">${escHtml(currentUser.email)}</span>
        <button class="btn-header-logout" id="logout-btn">Log Out</button>
      </div>
    `;
    document.getElementById("logout-btn").addEventListener("click", () => sb.auth.signOut());
  } else {
    headerAuth.innerHTML = `
      <button class="btn-header-login" id="open-auth-btn">Log In / Register</button>
    `;
    document.getElementById("open-auth-btn").addEventListener("click", () => openAuthModal());
  }
}

// ── AUTH MODAL ────────────────────────────────────
function openAuthModal(tab = "login") {
  authModal.classList.remove("hidden");
  switchTab(tab);
}

function closeAuthModal() {
  authModal.classList.add("hidden");
  loginError.classList.add("hidden");
  regError.classList.add("hidden");
  loginForm.reset();
  regForm.reset();
}

modalClose.addEventListener("click", closeAuthModal);
authModal.addEventListener("click", e => { if (e.target === authModal) closeAuthModal(); });

modalTabs.forEach(tab => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

function switchTab(name) {
  modalTabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  loginForm.classList.toggle("hidden", name !== "login");
  regForm.classList.toggle("hidden", name !== "register");
}

loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  setFormBusy(loginForm, true);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  setFormBusy(loginForm, false);
  if (error) {
    showFormError(loginError, error.message);
  } else {
    closeAuthModal();
  }
});

regForm.addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("reg-email").value.trim();
  const pass1 = document.getElementById("reg-password").value;
  const pass2 = document.getElementById("reg-password2").value;
  if (pass1 !== pass2) {
    showFormError(regError, "Passwords do not match.");
    return;
  }
  setFormBusy(regForm, true);
  const { error } = await sb.auth.signUp({ email, password: pass1 });
  setFormBusy(regForm, false);
  if (error) {
    showFormError(regError, error.message);
  } else {
    showFormError(regError, "Account created! Check your email to confirm.", "success");
    setTimeout(closeAuthModal, 2000);
  }
});

function showFormError(el, msg, type = "error") {
  el.textContent = msg;
  el.className = `auth-error ${type}`;
}

function setFormBusy(form, busy) {
  form.querySelectorAll("button[type=submit]").forEach(b => {
    b.disabled = busy;
    b.textContent = busy ? "Please wait…" : b.dataset.label ?? b.textContent;
  });
}

// ── ENTRY POINTS ──────────────────────────────────
locateBtn.addEventListener("click",  triggerGeolocate);
locateBtn2.addEventListener("click", triggerGeolocate);
retrBtn.addEventListener("click",    triggerGeolocate);

pillBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    pillBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    applyFilters();
  });
});

const boroughSearchBtn = document.getElementById("borough-search-btn");

boroughInput.addEventListener("input", () => {
  boroughQuery = boroughInput.value.trim().toLowerCase();
  if (allResults.length > 0) applyFilters();
});

boroughInput.addEventListener("keydown", e => {
  if (e.key === "Enter") triggerBoroughSearch();
});

boroughSearchBtn.addEventListener("click", triggerBoroughSearch);

// ── BOROUGH SEARCH ─────────────────────────────────
const BOROUGH_CENTROIDS = {
  "manhattan":    { lat: 40.7831, lng: -73.9712 },
  "brooklyn":     { lat: 40.6501, lng: -73.9496 },
  "queens":       { lat: 40.7282, lng: -73.7949 },
  "bronx":        { lat: 40.8448, lng: -73.8648 },
  "staten island":{ lat: 40.5795, lng: -74.1502 },
};

function triggerBoroughSearch() {
  const query = boroughInput.value.trim().toLowerCase();
  if (!query) return;

  const centroid = BOROUGH_CENTROIDS[query];
  if (!centroid) {
    showError(`"${boroughInput.value.trim()}" isn't a recognised NYC borough. Try: Manhattan, Brooklyn, Queens, Bronx, or Staten Island.`);
    return;
  }

  userLat = centroid.lat;
  userLng = centroid.lng;
  boroughQuery = query;
  fetchRestrooms();
}

// ── GEOLOCATION ────────────────────────────────────
function triggerGeolocate() {
  if (!("geolocation" in navigator)) {
    showError("Geolocation is not supported by your browser.");
    return;
  }
  showLoading();
  navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 60000,
  });
}

function onLocationSuccess(pos) {
  userLat = pos.coords.latitude;
  userLng = pos.coords.longitude;
  fetchRestrooms();
}

function onLocationError(err) {
  let msg = "Unable to retrieve your location.";
  if (err.code === 1) msg = "Location access was denied. Please allow location permission and try again.";
  if (err.code === 3) msg = "Location request timed out. Please try again.";
  showError(msg);
}

// ── API FETCH ──────────────────────────────────────
async function fetchRestrooms() {
  if (userLat === null) return;

  showLoading();

  const params = new URLSearchParams({
    $where: `within_circle(location_1, ${userLat}, ${userLng}, ${MAX_RADIUS})`,
    $limit: MAX_RESULTS,
  });

  const url = `${API_BASE}?${params.toString()}`;

  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });

    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);

    const data = await res.json();

    if (!Array.isArray(data)) throw new Error("Unexpected API response format.");

    allResults = data
      .filter(r => r.latitude && r.longitude)
      .map(r => enrichRestroom(r));

    allResults.sort((a, b) => a.distanceM - b.distanceM);

    applyFilters();
    initMap();

  } catch (err) {
    console.error("FlushNYC fetch error:", err);
    showError("Could not load restroom data. Please check your connection and try again.");
  }
}

// ── DATA ENRICHMENT ────────────────────────────────
function enrichRestroom(r) {
  const lat = parseFloat(r.latitude);
  const lng = parseFloat(r.longitude);
  const distanceM = haversine(userLat, userLng, lat, lng);
  const hours = r.hours_of_operation || "";

  return {
    ...r,
    lat,
    lng,
    distanceM,
    distanceLabel: formatDistance(distanceM),
    name:          r.facility_name || "Public Restroom",
    address:       r.location_type || "See map for location",
    borough:       inferBorough(lat, lng),
    accessible:    accessibleLike(r.accessibility),
    open24:        hours.toLowerCase().includes("24"),
    changingTable: yesLike(r.changing_stations),
    hoursNote:     hours,
    operator:      r.operator || "",
  };
}

function inferBorough(lat, lng) {
  if (lat > 40.700 && lat < 40.796 && lng > -74.020 && lng < -73.907) return "Staten Island";
  if (lat > 40.739 && lat < 40.918 && lng > -73.933 && lng < -73.700) return "Queens";
  if (lat > 40.796 && lat < 40.918 && lng > -74.020 && lng < -73.933) return "Bronx";
  if (lat > 40.570 && lat < 40.739 && lng > -74.050 && lng < -73.833) return "Brooklyn";
  if (lat > 40.700 && lat < 40.796 && lng > -74.020 && lng < -73.907) return "Staten Island";
  return "Manhattan";
}

function accessibleLike(val) {
  if (!val) return false;
  const s = String(val).toLowerCase();
  return s.includes("fully") || s.includes("partial");
}

function yesLike(val) {
  if (!val) return false;
  const s = String(val).toLowerCase().trim();
  return s === "yes" || s === "y" || s === "true" || s === "1" || s === true;
}

// ── FILTERING ─────────────────────────────────────
function applyFilters() {
  filteredResults = allResults.filter(r => {
    if (boroughQuery && !r.borough.toLowerCase().includes(boroughQuery) &&
        !r.name.toLowerCase().includes(boroughQuery) &&
        !r.address.toLowerCase().includes(boroughQuery)) {
      return false;
    }
    if (activeFilter === "accessible"  && !r.accessible)    return false;
    if (activeFilter === "open24"      && !r.open24)        return false;
    if (activeFilter === "changing"    && !r.changingTable) return false;
    return true;
  });

  renderResults();
  updateMapMarkers();
}

// ── RENDERING ─────────────────────────────────────
function renderResults() {
  if (filteredResults.length === 0 && allResults.length > 0) {
    resHeader.textContent = "No results match your filters";
    showResultsList();
    resList.innerHTML = `<li style="padding:28px 20px;text-align:center;color:var(--grey-mid);font-size:.88rem;">
      Try removing a filter or expanding your search.
    </li>`;
    return;
  }

  if (filteredResults.length === 0) return;

  const plural = filteredResults.length === 1 ? "restroom" : "restrooms";
  resHeader.textContent = `${filteredResults.length} ${plural} found nearby`;

  resList.innerHTML = "";

  filteredResults.forEach((r, i) => {
    const li = document.createElement("li");
    li.className = "restroom-card";
    li.dataset.index = i;
    li.innerHTML = buildCardHTML(r, i);
    li.addEventListener("click", () => onCardClick(i, li));
    resList.appendChild(li);
  });

  showResultsList();
}

function buildCardHTML(r, i) {
  const tags = [];
  if (r.borough)       tags.push(`<span class="tag borough">${r.borough}</span>`);
  if (r.accessible)    tags.push(`<span class="tag accessible">♿ Accessible</span>`);
  if (r.open24)        tags.push(`<span class="tag open24">🌙 24 Hours</span>`);
  if (r.changingTable) tags.push(`<span class="tag changing">🍼 Changing Table</span>`);

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`;
  const wazeUrl = `https://www.waze.com/ul?ll=${r.lat}%2C${r.lng}&navigate=yes`;

  return `
    <div class="card-top">
      <div class="card-name">${escHtml(r.name)}</div>
      <div class="card-distance">${r.distanceLabel}</div>
    </div>
    <div class="card-address">${escHtml(r.address)}</div>
    ${tags.length ? `<div class="card-tags">${tags.join("")}</div>` : ""}
    ${r.hoursNote ? `<div class="card-address" style="margin-top:2px">🕐 ${escHtml(r.hoursNote)}</div>` : ""}
    <div class="card-actions">
      <button class="card-btn primary" onclick="window.open('${mapsUrl}','_blank');event.stopPropagation()">
        🗺 Directions
      </button>
      <button class="card-btn" onclick="window.open('${wazeUrl}','_blank');event.stopPropagation()">
        Waze
      </button>
      ${r.operator ? `<button class="card-btn" style="pointer-events:none;opacity:.6">${escHtml(r.operator)}</button>` : ""}
    </div>
  `;
}

// ── MAP ────────────────────────────────────────────
function initMap() {
  mapPlaceholder.classList.add("hidden");
  leafletMap.classList.remove("hidden");

  if (!map) {
    map = L.map("leaflet-map", { zoomControl: true }).setView([userLat, userLng], 15);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
  } else {
    map.setView([userLat, userLng], 15);
  }

  if (userMarker) userMarker.remove();
  userMarker = L.circleMarker([userLat, userLng], {
    radius: 10,
    color: "#f5e642",
    fillColor: "#0d0d0d",
    fillOpacity: 1,
    weight: 3,
  }).addTo(map).bindPopup("<strong>You are here</strong>");

  updateMapMarkers();
}

function updateMapMarkers() {
  if (!map) return;

  markers.forEach(m => m.remove());
  markers = [];

  const icon = L.divIcon({
    html: `<div style="
      width:28px;height:28px;background:#0d0d0d;border:3px solid #f5e642;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      box-shadow:2px 2px 4px rgba(0,0,0,.35);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
    className: "",
  });

  filteredResults.forEach((r, i) => {
    if (!r.lat || !r.lng) return;
    const marker = L.marker([r.lat, r.lng], { icon })
      .addTo(map)
      .bindPopup(buildPopupHTML(r));

    marker.on("click", () => {
      const cards = document.querySelectorAll(".restroom-card");
      cards.forEach(c => c.classList.remove("highlighted"));
      const card = document.querySelector(`.restroom-card[data-index="${i}"]`);
      if (card) {
        card.classList.add("highlighted");
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    markers.push(marker);
  });

  if (filteredResults.length > 0) {
    const group = L.featureGroup([userMarker, ...markers]);
    map.fitBounds(group.getBounds().pad(0.15));
  }
}

function buildPopupHTML(r) {
  return `
    <div style="font-family:'DM Sans',sans-serif;min-width:180px">
      <strong style="font-size:.9rem">${escHtml(r.name)}</strong><br/>
      <span style="font-size:.78rem;color:#888">${escHtml(r.address)}</span><br/>
      <span style="font-size:.76rem;color:#555;margin-top:4px;display:block">${r.distanceLabel} away</span>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}"
         target="_blank"
         style="display:inline-block;margin-top:8px;font-size:.76rem;font-weight:700;
                color:#0d0d0d;background:#f5e642;padding:4px 10px;border-radius:3px;
                text-decoration:none">
        Get Directions
      </a>
    </div>
  `;
}

function onCardClick(i, li) {
  if (!map) return;
  document.querySelectorAll(".restroom-card").forEach(c => c.classList.remove("highlighted"));
  li.classList.add("highlighted");
  const r = filteredResults[i];
  if (r.lat && r.lng) {
    map.setView([r.lat, r.lng], 17, { animate: true });
    markers[i]?.openPopup();
  }
}

// ── UI STATE HELPERS ───────────────────────────────
function showLoading() {
  stateIdle.classList.add("hidden");
  stateError.classList.add("hidden");
  resList.classList.add("hidden");
  stateLoading.classList.remove("hidden");
}

function showResultsList() {
  stateIdle.classList.add("hidden");
  stateLoading.classList.add("hidden");
  stateError.classList.add("hidden");
  resList.classList.remove("hidden");
}

function showError(msg) {
  stateIdle.classList.add("hidden");
  stateLoading.classList.add("hidden");
  resList.classList.add("hidden");
  errorMsg.textContent = msg;
  stateError.classList.remove("hidden");
  resHeader.textContent = "Error";
}

// ── UTILS ─────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(metres) {
  if (metres < 100)  return `${Math.round(metres)} m`;
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
