// ====== Utils ======
const fmt = {
  compact(n){
    if(n===undefined||n===null||isNaN(n)) return "–";
    const u=["","K","M","G","T","P","E"]; let i=0;
    while(n>=1000 && i<u.length-1){ n/=1000; i++; }
    return n.toFixed(2).replace('.',',') + " " + u[i];
  },
  percent(v){ if(!isFinite(v)) return "–"; return (v*100).toFixed(2).replace('.',',')+" %"; },
  timeAgo(ts){
    if(!ts) return "–";
    const d=new Date(ts*1000), diff=(Date.now()-d)/1000;
    if(diff<60) return Math.floor(diff)+"s";
    if(diff<3600) return Math.floor(diff/60)+"m";
    if(diff<86400) return Math.floor(diff/3600)+"h";
    return d.toLocaleString('fr-FR');
  },
  hashrate(v){ 
    if (v === undefined || v === null) return "–";
    return formatAnyHashrate(v);
  }
};

// === Fonctions de formatage hashrate ===
function parseHashrateToUnit(hps){
  const units = ["H/s","KH/s","MH/s","GH/s","TH/s","PH/s","EH/s"];
  let i = 0;
  let v = Number(hps) || 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(2).replace('.',',')} ${units[i]}`;
}
function parseHashrate(strOrNum){
  if(typeof strOrNum === "number") return strOrNum; // déjà en H/s
  if(typeof strOrNum !== "string") return 0;
  const m = strOrNum.trim().match(/^([\d.,]+)\s*([HKMGTP])?$/i);
  if(!m) return 0;
  const num = parseFloat(m[1].replace(',', '.'));
  const unit=(m[2]||'H').toUpperCase();
  const map={H:1, K:1e3, M:1e6, G:1e9, T:1e12, P:1e15};
  return num*(map[unit]||1);
}
function formatAnyHashrate(v){
  const hps = (typeof v === "number") ? v : parseHashrate(v);
  return parseHashrateToUnit(hps); // -> "42,00 TH/s"
}

// Copie presse-papiers (globale)
function copyText(t){ navigator.clipboard?.writeText(t); }
window.copyText = copyText;

// ====== Chart (historique hashrate) ======
let hrChart;
function ensureCharts(){
  const canvas = document.getElementById('hashrateChart');
  if(!canvas) return;
  const hc = canvas.getContext('2d');
  if(!hrChart){
    hrChart = new Chart(hc, {
      type:'line',
      data:{ labels:[], datasets:[{ label:'Hashrate (TH/s)', data:[], fill:true, tension:.35, borderWidth:2 }]},
      options:{ plugins:{ legend:{ display:false }}, scales:{ y:{ title:{display:true,text:'TH/s'}}, x:{ title:{display:true,text:'Date'} } } }
    });
  }
}

// --- Sélecteur d'intervalle (client-side) ---
let hrHistoryRaw = [];      // {date:'YYYY-MM-DD', hashrate:<H/s>}
let currentRange = '30d';   // défaut: Mois

function filterHistoryByRange(range){
  if(range === 'all') return [...hrHistoryRaw];
  const now = new Date();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 365;
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return hrHistoryRaw.filter(p => {
    const d = new Date(p.date + 'T00:00:00');
    return d >= cutoff;
  });
}

function updateHistoryChart(range){
  currentRange = range;
  const subset = filterHistoryByRange(range);
  const labels = subset.map(p=>p.date);
  const series = subset.map(p=> (p.hashrate/1e12)); // TH/s
  if (hrChart){
    hrChart.data.labels = labels;
    hrChart.data.datasets[0].data = series;
    hrChart.update();
  }

  // Style boutons actif/inactif
  document.querySelectorAll('.btn-range').forEach(b=>{
    b.classList.toggle('active', b.dataset.range === range);
  });
}

// ====== Fetch Pool status ======
async function loadPool(){
  try{
    const r = await fetch(`${API}/pool`);
    const pool = await r.json();

    const runtime = pool.runtime || {};
    const hr = pool.hashrates || {};
    const sh = pool.shares || {};

    const hh = document.getElementById("hashrateHeader");
    if (hh) hh.innerText = "Hashrate : " + fmt.hashrate(hr.hashrate1hr ?? "–");

    const set = (id, val) => { const el=document.getElementById(id); if(el) el.innerText = val; };
    set("pillUsers", runtime.Users ?? "–");
    set("pillWorkers", runtime.Workers ?? "–");
    set("pillAccepted", fmt.compact(sh.accepted||0));
    set("pillRejected", fmt.compact(sh.rejected||0));
    set("pillUpdated", "Updated: " + fmt.timeAgo(runtime.lastupdate));
    set("nodeUpdated", fmt.timeAgo(runtime.lastupdate));

    const total = (sh.accepted||0)+(sh.rejected||0);
    const rejRate = total ? (sh.rejected/total) : NaN;
    const rejEl = document.getElementById("pillRejectRate");
    if(rejEl){
      rejEl.innerHTML = (rejRate<=0.02)
        ? `Rejet: <span class="pill good">${(rejRate*100).toFixed(2).replace('.',',')} %</span>`
        : `Rejet: <span class="pill bad">${isNaN(rejRate)?'–':(rejRate*100).toFixed(2).replace('.',',')+' %'}</span>`;
    }

    set("kpiHr1h", fmt.hashrate(hr.hashrate1hr ?? "–"));
    set("kpiHr1d", fmt.hashrate(hr.hashrate1d ?? "–"));
    set("kpiSps1h", sh.SPS1h ?? "–");
    set("kpiBestShare", fmt.compact(sh.bestshare||0));
  }catch(e){
    console.error("Erreur pool:", e);
  }
}

// ====== Monthly Bests ======
const MONTHLY_BESTS_API = `${API}/monthlyBests`;

// Raccourci d'adresse lisible (bc1qabcd…xy)
function shortenMiddle(str, start = 6, end = 2) {
  if (!str || str.length <= start + end + 1) return str || "";
  return str.slice(0, start) + "…" + str.slice(-end);
}

// Format "diff" en M / G / T / P (on évite K)
function formatDiffUnits(val) {
  if (val == null || !isFinite(Number(val))) return "–";
  const v = Number(val);
  const UNITS = [
    { k: 1e15, s: "P" },
    { k: 1e12, s: "T" },
    { k: 1e9,  s: "G" },
    { k: 1e6,  s: "M" },
  ];
  for (const u of UNITS) if (Math.abs(v) >= u.k) {
    return (v / u.k).toFixed(2).replace(".", ",") + " " + u.s;
  }
  return String(v).replace(".", ",");
}

// Sélectionne l'entrée du mois courant dans un tableau [{month:"YYYY-MM", ...}]
function pickCurrentMonthEntry(json) {
  if (!Array.isArray(json)) return null;
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return json.find(e => e?.month === ym) ?? json[json.length - 1] ?? null;
}

// Extrait { user, diff, month, epoch, fullAddress }
function extractWinnerAndDiff(entry) {
  if (!entry || typeof entry !== "object") return { user: null, diff: null, month: null, epoch: null, fullAddress: null };

  let diff = entry.sdiff ?? entry.diff ?? entry.difficulty ?? null;
  if (typeof diff === "string") {
    const asNum = Number(diff.replace(/[, ]/g, ""));
    if (isFinite(asNum)) diff = asNum;
  }

  const fullAddress = entry.address || null;
  const user = fullAddress ? shortenMiddle(fullAddress) :
               (entry.user || entry.username || entry.name || entry.winner || entry.miner || entry.worker || null);

  return { user, diff, month: entry.month || null, epoch: entry.epoch || null, fullAddress };
}

async function loadMonthlyBests() {
  const alertBox = document.getElementById("monthlyBestAlert");
  if (!alertBox) return;

  const elUser   = document.getElementById("bestUser");
  const elDiff   = document.getElementById("bestDiff");
  const elMonth  = document.getElementById("bestMonth");
  const elWhen   = document.getElementById("bestWhen");
  const elWhenWrap = document.getElementById("bestWhenWrap");
  const elDot    = document.getElementById("bestLiveDot");
  const elBadge  = document.getElementById("bestOngoingBadge");

  try {
    const r = await fetch(MONTHLY_BESTS_API, { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();

    const entry = pickCurrentMonthEntry(json);
    const { user, diff, month, epoch, fullAddress } = extractWinnerAndDiff(entry);

    if (user && diff != null) {
      // Remplissage valeurs
      if (elUser) {
        elUser.textContent = user;
        if (fullAddress) elUser.title = fullAddress;
      }
      if (elDiff) elDiff.textContent = formatDiffUnits(diff);
      if (elMonth) elMonth.textContent = month || "";

      if (elWhenWrap) elWhenWrap.classList.toggle("d-none", !epoch);
      if (elWhen && epoch) {
        const ts = Math.floor(epoch) * 1000;
        elWhen.setAttribute("datetime", new Date(ts).toISOString());
        // Affiche un "relative time" si tu as déjà une util de formatage; sinon date ISO courte
        if (typeof fmt?.timeAgo === "function") {
          elWhen.textContent = fmt.timeAgo(Math.floor(epoch));
        } else {
          elWhen.textContent = new Date(ts).toLocaleString();
        }
      }

      // “En cours” si le mois est celui d’aujourd’hui
      const now = new Date();
      const ymNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const ongoing = month === ymNow;

      if (elDot)   elDot.classList.toggle("d-none", !ongoing);
      if (elBadge) elBadge.classList.toggle("d-none", !ongoing);

      alertBox.classList.remove("d-none");
    } else {
      alertBox.classList.add("d-none");
    }
  } catch (e) {
    console.error("Erreur monthlyBests:", e);
    alertBox.classList.add("d-none");
  }
}

// ====== Helpers additionnels (compat avec ton API) ======
function fmtMonthLabel(isoMonth /* "YYYY-MM" */) {
  try {
    const [y, m] = isoMonth.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { year: "numeric", month: "long" });
  } catch { return isoMonth || ""; }
}

function toMillis(epoch) {
  // ton API envoie epoch possiblement en secondes (float). On convertit proprement.
  if (epoch == null || !isFinite(Number(epoch))) return null;
  const s = Number(epoch);
  // S'il ressemble déjà à des ms (ex: > 10^12), ne pas reconvertir
  return s > 1e12 ? s : Math.floor(s * 1000);
}

/**
 * Normalise une entrée venant de l'API pour l’historique
 * Entrée possible: { month:"2025-09", sdiff:number, address:"...", epoch:number }
 * Sortie: { month, user, addr, diff, whenMs}
 */
function normalizeMonthlyBestRow(entry) {
  const month = entry?.month || null;
  let diff = entry?.sdiff ?? entry?.diff ?? entry?.difficulty ?? null;
  if (typeof diff === "string") {
    const asNum = Number(diff.replace(/[, ]/g, ""));
    if (isFinite(asNum)) diff = asNum;
  }
  const addr = entry?.address || entry?.addr || null;
  const user = addr ? shortenMiddle(addr) :
               (entry?.user || entry?.username || entry?.name || entry?.winner || entry?.miner || entry?.worker || "—");
  const whenMs = toMillis(entry?.epoch ?? entry?.ts ?? entry?.time);

  return {
    month,
    user,
    addr,
    diff,
    whenMs,
  };
}

// ====== Historique: peupler le modal ======
async function loadMonthlyBestsHistory() {
  const tbody = document.getElementById("bestshareHistoryBody");
  if (!tbody) return;

  try {
    const r = await fetch(MONTHLY_BESTS_API, { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const rows = Array.isArray(json) ? json.map(normalizeMonthlyBestRow) : [];

    // Tri: plus récent en premier (par month desc)
    rows.sort((a, b) => (a.month < b.month ? 1 : -1));

    tbody.innerHTML = "";
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No data</td></tr>`;
      return;
    }

    for (const r of rows) {
      const tr = document.createElement("tr");

      const tdMonth = document.createElement("td");
      tdMonth.textContent = fmtMonthLabel(r.month || "");

      const tdUser = document.createElement("td");
      // Affiche l’adresse raccourcie si dispo, sinon user
      const main = r.addr ? shortenMiddle(r.addr) : (r.user || "—");
      tdUser.innerHTML = `<strong title="${r.addr || ""}">${main}</strong>`;

      const tdDiff = document.createElement("td");
      tdDiff.innerHTML = `<span class="bestshare__diff">${formatDiffUnits(r.diff)}</span>`;

      const tdWhen = document.createElement("td");
      if (r.whenMs) {
        const d = new Date(r.whenMs);
        tdWhen.textContent = d.toLocaleString();
      } else {
        tdWhen.textContent = "—";
      }

      tr.append(tdMonth, tdUser, tdDiff, tdWhen);
      tbody.appendChild(tr);
    }
  } catch (e) {
    console.error("Erreur loadMonthlyBestsHistory:", e);
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Failed to load history</td></tr>`;
  }
}

// Ouvre/refresh l’historique à l’ouverture du modal (Bootstrap)
document.getElementById("bestshareHistoryModal")
  ?.addEventListener("show.bs.modal", loadMonthlyBestsHistory);




// ====== Fetch History (une fois), puis filtrage local ======
async function loadHistory(){
  try{
    const r = await fetch(`${API}/hashrate`);
    const data = await r.json();
    ensureCharts();
    hrHistoryRaw = Array.isArray(data) ? data : [];
    updateHistoryChart(currentRange); // applique la plage courante
  }catch(e){
    console.error("Erreur history:", e);
  }
}

// ====== PINGS / TOPOLOGIE ======
let topoTimer = null;
let topoLoadedOnce = false;

function normalizeHostName(n){
  if(!n) return '';
  const s = n.toLowerCase();
  if(s.includes('proxy'))   return 'proxy';
  if(s.includes('primary')) return 'primary';
  if(s.includes('backup'))  return 'backup';
  return s;
}
function linkClass(aOnline, bOnline){
  return (aOnline && bOnline) ? 'net-link-ok' : 'net-link-bad';
}
function renderPingCounters(data){
  const total   = Number(data?.total ?? 0);
  const online  = Number(data?.online ?? 0);
  const offline = Number(data?.offline ?? 0);
  const set = (id, val) => { const el=document.getElementById(id); if(el) el.innerText = val; };
  set('pingTotal',   isFinite(total)   ? total   : '–');
  set('pingOnline',  isFinite(online)  ? online  : '–');
  set('pingOffline', isFinite(offline) ? offline : '–');
}
function renderNetwork(data){
  const pos = {
    proxy:   { x: 350, y: 40 },
    primary: { x: 200, y: 170 },
    backup:  { x: 500, y: 170 }
  };
  const box = { w: 180, h: 64 };

  const byKey = {};
  (data?.hosts||[]).forEach(h => { byKey[ normalizeHostName(h.name) ] = h; });

  const proxy   = byKey.proxy   || {};
  const primary = byKey.primary || {};
  const backup  = byKey.backup  || {};

  const online = h => !!h.online;
  const latMs  = h => (h.latencyMs != null ? `${h.latencyMs.toFixed(2)} ms` : '–');

  const link1 = linkClass(online(proxy), online(primary));
  const link2 = linkClass(online(proxy), online(backup));

  const svg = `
    <!-- Lignes -->
    <path class="${link1}" d="M ${pos.proxy.x} ${pos.proxy.y+box.h} C ${pos.proxy.x} ${pos.proxy.y+110}, ${pos.primary.x+box.w/2} ${pos.primary.y-40}, ${pos.primary.x+box.w/2} ${pos.primary.y}" />
    <path class="${link2}" d="M ${pos.proxy.x+box.w} ${pos.proxy.y+box.h} C ${pos.proxy.x+box.w} ${pos.proxy.y+110}, ${pos.backup.x+box.w/2} ${pos.backup.y-40}, ${pos.backup.x+box.w/2} ${pos.backup.y}" />

    <!-- Proxy -->
    <g class="net-node ${online(proxy)?'online':'offline'}">
      <rect x="${pos.proxy.x}" y="${pos.proxy.y}" width="${box.w}" height="${box.h}"></rect>
      <text class="net-title" x="${pos.proxy.x+box.w/2}" y="${pos.proxy.y+26}" text-anchor="middle">Stratum Proxy</text>
      <text class="net-sub"   x="${pos.proxy.x+box.w/2}" y="${pos.proxy.y+44}" text-anchor="middle">${latMs(proxy)}</text>
    </g>

    <!-- Primary -->
    <g class="net-node ${online(primary)?'online':'offline'}">
      <rect x="${pos.primary.x}" y="${pos.primary.y}" width="${box.w}" height="${box.h}"></rect>
      <text class="net-title" x="${pos.primary.x+box.w/2}" y="${pos.primary.y+26}" text-anchor="middle">Primary Stratum Server</text>
      <text class="net-sub"   x="${pos.primary.x+box.w/2}" y="${pos.primary.y+44}" text-anchor="middle">${latMs(primary)}</text>
    </g>

    <!-- Backup -->
    <g class="net-node ${online(backup)?'online':'offline'}">
      <rect x="${pos.backup.x}" y="${pos.backup.y}" width="${box.w}" height="${box.h}"></rect>
      <text class="net-title" x="${pos.backup.x+box.w/2}" y="${pos.backup.y+26}" text-anchor="middle">Backup Stratum Server</text>
      <text class="net-sub"   x="${pos.backup.x+box.w/2}" y="${pos.backup.y+44}" text-anchor="middle">${latMs(backup)}</text>
    </g>
  `;
  const el = document.getElementById('netSvg');
  if(el) el.innerHTML = svg;
}
async function loadPingsOnce(){
  try{
    const r = await fetch(`${API}/pings`);
    const data = await r.json();
    renderPingCounters(data);
    renderNetwork(data);
    updateHeaderStatusFromPings(data); // MAJ LEDs header au 1er chargement topo
    topoLoadedOnce = true;
  }catch(e){ console.error('Erreur pings:', e); }
}
function startTopoRefresh(){
  if(topoTimer) return;
  topoTimer = setInterval(async ()=> {
    try{
      const r = await fetch(`${API}/pings`);
      const data = await r.json();
      renderPingCounters(data);
      renderNetwork(data);
      updateHeaderStatusFromPings(data); // MAJ LEDs header sur refresh topo
    }catch(e){ console.error('Erreur pings:', e); }
  }, 30000);
}
function stopTopoRefresh(){
  if(topoTimer){ clearInterval(topoTimer); topoTimer = null; }
}

// ====== LEDs statut header ======
function setHeaderStatus(elId, host){
  const el = document.getElementById(elId);
  if(!el) return;
  const led = el.querySelector('.led');
  const state = el.querySelector('.state');

  const isOnline = !!host?.online;
  led.classList.toggle('online',  isOnline);
  led.classList.toggle('offline', !isOnline);
  state.textContent = isOnline ? 'UP' : 'DOWN';

  const baseTitle = el.getAttribute('title') || '';
  const lat = (host?.latencyMs!=null) ? `${host.latencyMs.toFixed(2)} ms` : '–';
  el.title = `${baseTitle} • Latence: ${lat}`;
  el.setAttribute('aria-label', `${baseTitle} ${isOnline?'UP':'DOWN'}, latence ${lat}`);
}

function updateBackupWarning(primaryHost, backupHost) {
  const hint = document.getElementById("backupOnlyHint");
  if (!hint) return;

  const isPrimaryOnline = !!primaryHost?.online;
  const isBackupOnline  = !!backupHost?.online;
  const isBackupOnly    = isBackupOnline && !isPrimaryOnline;

  if (!isBackupOnly) {
    hint.classList.add("d-none");
    hint.removeAttribute("title");
    hint.removeAttribute("aria-label");
    return;
  }

  const lang = (document.documentElement.getAttribute("lang") || "fr").toLowerCase();

  const msgFr = "La pool tourne actuellement sur le serveur de backup. Certaines statistiques peuvent être incomplètes ou indisponibles.";
  const msgEn = "The pool is currently running on the backup server. Some statistics may be incomplete or unavailable.";

  const text = lang.startsWith("fr") ? msgFr : msgEn;

  hint.classList.remove("d-none");
  hint.title = text;
  hint.setAttribute("aria-label", text);
}


function updateHeaderStatusFromPings(data){
  const byKey = {};
  (data?.hosts||[]).forEach(h=>{
    const s=(h.name||'').toLowerCase();
    let k = s.includes('proxy')?'proxy':s.includes('primary')?'primary':s.includes('backup')?'backup':s;
    byKey[k]=h;
  });

  const primary = byKey.primary || null;
  const backup  = byKey.backup  || null;

  setHeaderStatus('stProxy',   byKey.proxy   || null);
  setHeaderStatus('stPrimary', primary);
  setHeaderStatus('stBackup',  backup);

  // 👉 Ici on met à jour le point d'interrogation “backup only”
  updateBackupWarning(primary, backup);
}


async function loadHeaderPings(){
  try{
    const r = await fetch(`${API}/pings`);
    const data = await r.json();
    updateHeaderStatusFromPings(data);
  }catch(e){
    // En cas d’erreur, passe tout en DOWN
    ['stProxy','stPrimary','stBackup'].forEach(id=>{
      setHeaderStatus(id, {online:false, latencyMs:null});
    });
    console.error('Erreur header pings:', e);
  }
}

// ====== Auto-refresh (status pool + LEDs header) ======
let timer=null;
function startRefresh(){
  if(timer) clearInterval(timer);
  timer = setInterval(()=>{
    loadPool();
    loadHeaderPings(); // LEDs header
    loadNode();
  }, 30000);
}

// ====== Bind & Init ======
function selectOnClick(el){
  el.addEventListener('click', ()=>{
    const r=document.createRange();
    r.selectNodeContents(el);
    const s=window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.btn-range');
  if(!btn) return;
  updateHistoryChart(btn.dataset.range);
});


// ====== Node (full node Bitcoin) ======
const NODE_API = `${API}/node`;

function parseSubversion(subv){
  // ex: "/Satoshi:28.1.0/" -> "Satoshi 28.1.0"
  if(!subv || typeof subv !== "string") return "–";
  const s = subv.replace(/\//g, ""); // "Satoshi:28.1.0"
  const m = s.match(/^([^:]+):(.+)$/);
  return m ? `${m[1]} ${m[2]}` : s;
}

let lastNodeUpdate = null;

async function loadNode(){
  try{
    const r = await fetch(NODE_API, { cache: "no-cache" });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();

    const height  = Number(json?.height);
    const peers   = Number(json?.peers);
    const version = parseSubversion(json?.subversion);

    const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent = val; };

    set("nodeHeight", isFinite(height) ? height.toLocaleString("fr-FR") : "–");
    set("nodePeers",  isFinite(peers)  ? peers.toString() : "–");
    set("nodeVersion", version);
  }catch(e){
    console.error("Erreur node:", e);
    // En cas d’erreur, on affiche en “–”
    ["nodeHeight","nodePeers","nodeVersion"].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.textContent = "–";
    });
  }
}

// (Optionnel) petit ticker pour rafraîchir l’affichage “timeAgo” du nœud
setInterval(()=>{
  const updEl = document.getElementById("nodeUpdated");
  if(updEl && lastNodeUpdate && typeof fmt?.timeAgo === "function"){
    updEl.textContent = "Maj: " + fmt.timeAgo(lastNodeUpdate);
  }
}, 1000);

document.addEventListener('DOMContentLoaded', ()=>{
  // Sélection rapide des codes
  ['confUrl','confUser','confPass','addrBTC','addrLN'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) selectOnClick(el);
  });

  // Chargement initial du bandeau Best Diff
  loadMonthlyBests();

  // Topologie : lazy load + refresh quand ouvert
  const collapseEl = document.getElementById('topologyCollapse');
  if(collapseEl){
    collapseEl.addEventListener('show.bs.collapse', async ()=>{
      if(!topoLoadedOnce) { await loadPingsOnce(); }
      startTopoRefresh();
    });
    collapseEl.addEventListener('hide.bs.collapse', ()=>{
      stopTopoRefresh();
    });
  }

  ensureCharts();
  Promise.all([loadPool(), loadHistory(), loadNode()]).then(()=>{
    loadHeaderPings(); // init immédiate des LEDs
    startRefresh();
  });

});
