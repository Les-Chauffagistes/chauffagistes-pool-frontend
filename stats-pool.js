// ---------- Utils ----------
const fmt = {
number(n){ if(n===undefined||n===null||isNaN(n)) return "–";
    return n.toLocaleString('fr-FR'); },
compact(n){ if(n===undefined||n===null||isNaN(n)) return "–";
    const units=["","K","M","G","T","P","E"];
    let i=0; let v=Number(n)||0;
    while(v>=1000 && i<units.length-1){ v/=1000; i++; }
    return v.toFixed(2).replace('.',',') + units[i];
},
hashrate(v){
    if (v === undefined || v === null) return "–";
    return formatAnyHashrate(v);
},
bestShare(n){ return fmt.compact(n); },
percent(v){ if(v===undefined||v===null||isNaN(v)) return "–"; return (v*100).toFixed(2).replace('.',',')+" %"; },
timeAgo(ts){
    if(!ts) return "–";
    const d = new Date(ts*1000);
    const diff = (Date.now()-d.getTime())/1000;
    if(diff<60) return Math.floor(diff)+"s";
    if(diff<3600) return Math.floor(diff/60)+"m";
    if(diff<86400) return Math.floor(diff/3600)+"h";
    return d.toLocaleString('fr-FR');
},
uptime(sec){
    if(!sec && sec!==0) return "–";
    const d = Math.floor(sec/86400);
    const h = Math.floor((sec%86400)/3600);
    const m = Math.floor((sec%3600)/60);
    return `${d}j ${h}h ${m}m`;
}
};

function parseHashrateToUnit(hps){
const units = ["H/s","KH/s","MH/s","GH/s","TH/s","PH/s","EH/s"];
let i = 0;
let v = Number(hps) || 0;
while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
return `${v.toFixed(2).replace('.',',')} ${units[i]}`;
}

function parseHashrate(strOrNum){
if(typeof strOrNum === "number") return strOrNum; // already H/s
if(typeof strOrNum !== "string") return 0;
const m = strOrNum.trim().match(/^([\d.]+)\s*([HKMGTP])?$/i);
if(!m) return 0;
const num = parseFloat(m[1]);
const unit=(m[2]||'H').toUpperCase();
const map={H:1, K:1e3, M:1e6, G:1e9, T:1e12, P:1e15};
return num*map[unit];
}

function setFreshPill(ts){
const pill = document.getElementById("freshnessPill");
pill.textContent = `Updated: ${fmt.timeAgo(ts)}`;
}

// ---------- Charts ----------
let chartHashrate;
function ensureCharts(){
const ctxH = document.getElementById('hashrateChart').getContext('2d');
if(!chartHashrate){
    chartHashrate = new Chart(ctxH, {
    type:'line',
    data:{ labels:[], datasets:[{ label:'Hashrate (TH/s)', data:[], borderWidth:2, tension:.3, fill:true }]},
    options:{ plugins:{legend:{display:false}}, scales:{ y:{ title:{display:true, text:'TH/s'}}, x:{ title:{display:true, text:'Date'}}}}
    });
}
}

// ---------- Fetchers ----------
async function loadPool(){
try{
    const res = await fetch(`${API}/pool`);
    const data = await res.json();

    // Runtime / counts
    document.getElementById('uptime').textContent = fmt.uptime(data.runtime?.runtime);
    document.getElementById('lastupdate').textContent = fmt.timeAgo(data.runtime?.lastupdate);
    document.getElementById('users').textContent = fmt.number(data.runtime?.Users);
    document.getElementById('workers').textContent = fmt.number(data.runtime?.Workers);
    document.getElementById('idle').textContent = fmt.number(data.runtime?.Idle);
    document.getElementById('disco').textContent = fmt.number(data.runtime?.Disconnected);
    const active = (data.runtime?.Workers||0) - (data.runtime?.Idle||0) - (data.runtime?.Disconnected||0);
    document.getElementById('workersActive').textContent = Math.max(active,0);

    // Hashrates tiles
    document.getElementById('hr1m').textContent = fmt.hashrate(data.hashrates?.hashrate1m);
    document.getElementById('hr5m').textContent = fmt.hashrate(data.hashrates?.hashrate5m);
    document.getElementById('hr15m').textContent = fmt.hashrate(data.hashrates?.hashrate15m);
    document.getElementById('hr1h').textContent = fmt.hashrate(data.hashrates?.hashrate1hr);
    document.getElementById('hr6h').textContent = fmt.hashrate(data.hashrates?.hashrate6hr);
    document.getElementById('hr1d').textContent = fmt.hashrate(data.hashrates?.hashrate1d);
    document.getElementById('hr7d').textContent = fmt.hashrate(data.hashrates?.hashrate7d);

    // tiny spark 1h vs 1d
    const hr1h = parseHashrate(data.hashrates?.hashrate1hr||0);
    const hr1d = parseHashrate(data.hashrates?.hashrate1d||1);
    const ratio = Math.min(100, Math.max(0, (hr1h / hr1d) * 50 + 50)); // centré 50%
    document.getElementById('spark1h').style.width = `${isFinite(ratio)?ratio:0}%`;

    // Shares values
    const acc = data.shares?.accepted || 0;
    const rej = data.shares?.rejected || 0;
    const total = acc + rej;
    const rejRate = total ? (rej/total) : 0;

    document.getElementById('sharesAccepted').textContent = fmt.compact(acc);
    document.getElementById('sharesRejected').textContent = fmt.compact(rej);
    document.getElementById('rejectRate').innerHTML = (rejRate < 0.02)
        ? `<span class="pill good">${fmt.percent(rejRate)}</span>`
        : `<span class="pill bad">${fmt.percent(rejRate)}</span>`;
    document.getElementById('bestShare').textContent = fmt.bestShare(data.shares?.bestshare);
    document.getElementById('diff').textContent = data.shares?.diff ?? "–";

    // SPS values only (plus de graphique)
    document.getElementById('sps1m').textContent = fmt.number(data.shares?.SPS1m||0);
    document.getElementById('sps5m').textContent = fmt.number(data.shares?.SPS5m||0);
    document.getElementById('sps15m').textContent = fmt.number(data.shares?.SPS15m||0);
    document.getElementById('sps1h').textContent = fmt.number(data.shares?.SPS1h||0);

    setFreshPill(data.runtime?.lastupdate);
}catch(e){
    console.error(e);
}
}

function formatAnyHashrate(v){
const hps = (typeof v === "number") ? v : parseHashrate(v);
return parseHashrateToUnit(hps);
}

async function loadTop(){
try{
    const res = await fetch(`${API}/top`);
    const data = await res.json();

    // Top Hashrate
    document.getElementById("topHashrate").innerHTML = (data.topHashrate || []).map(u=>{
    const hrStr = formatAnyHashrate(u.totalHashrate1hr);
    return `<li class="mb-1">
        <span class="pill">${escapeHtml(u.address)}</span>
        <span class="muted">(${u.workerCount} wkr)</span>
        – <strong>${hrStr}</strong>
    </li>`;
    }).join("");

    // Top BestShares
    document.getElementById("topBestShares").innerHTML = data.topBestShares.map(u=>{
    return `<li class="mb-1"><span class="pill">${escapeHtml(u.address)}</span> <span class="muted">(${u.workerCount} wkr)</span> – <strong>${fmt.bestShare(u.bestshare)}</strong></li>`;
    }).join("");
}catch(e){ console.error(e); }
}

// -------- Historique avec sélection d'intervalle --------
let chartHashrateRaw = [];     // {date: 'YYYY-MM-DD', hashrate: <H/s>}
let currentRange = '30d';      // valeur par défaut

function filterHistoryByRange(range){
if(range === 'all') return [...chartHashrateRaw];
const now = new Date();
const days = range === '7d' ? 7 : range === '30d' ? 30 : 365;
const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
return chartHashrateRaw.filter(p => {
    const d = new Date(p.date + 'T00:00:00');
    return d >= cutoff;
});
}

function updateHistoryChart(range){
currentRange = range;
const subset = filterHistoryByRange(range);
const labels = subset.map(p=>p.date);
const series = subset.map(p=>(p.hashrate/1e12)); // TH/s
chartHashrate.data.labels = labels;
chartHashrate.data.datasets[0].data = series;
chartHashrate.update();

// maj style boutons
document.querySelectorAll('.btn-range').forEach(b=>{
    b.classList.toggle('active', b.dataset.range === range);
});
}

async function loadHistory(){
try{
    const res = await fetch(`${API}/hashrate`);
    const data = await res.json();
    // on conserve brut puis on applique le range courant
    chartHashrateRaw = Array.isArray(data) ? data : [];
    ensureCharts();
    updateHistoryChart(currentRange);
}catch(e){ console.error(e); }
}

// ===== Deep-link helpers (URL <-> adresse) =====
const ADDR_PARAM = "addr";

function getAddrFromUrl() {
  const u = new URL(window.location.href);
  const a = (u.searchParams.get(ADDR_PARAM) || "").trim();
  return a;
}

function setAddrInUrl(addr, {replace=true} = {}) {
  const u = new URL(window.location.href);
  if (addr) {
    u.searchParams.set(ADDR_PARAM, addr);
  } else {
    u.searchParams.delete(ADDR_PARAM);
  }
  if (replace) history.replaceState({}, "", u.toString());
  else history.pushState({}, "", u.toString());
  updateLangLinksWithAddr(addr);
}

function updateLangLinksWithAddr(addr) {
  // Conserve l’adresse quand on bascule FR/EN
  document.querySelectorAll(".lang-switcher a.nav-link").forEach(a => {
    try {
      const u = new URL(a.getAttribute("href"), window.location.origin);
      if (addr) u.searchParams.set(ADDR_PARAM, addr);
      else u.searchParams.delete(ADDR_PARAM);
      a.setAttribute("href", u.pathname + u.search);
    } catch { /* no-op */ }
  });
}

// Lors des navigations arrière/avant (bouton du navigateur)
window.addEventListener("popstate", () => {
  const fromUrl = getAddrFromUrl();
  const input = document.getElementById("btcInput");
  if (input && fromUrl && input.value.trim() !== fromUrl) {
    input.value = fromUrl;
    // Relance la recherche sans alerte si l’adresse est présente
    searchUser(/* silent */ true);
  } else if (input && !fromUrl) {
    input.value = "";
    document.getElementById("userStats").innerHTML = "";
  }
});

// ---------- User Search ----------
async function searchUser(silent = false){
  const addr = document.getElementById("btcInput").value.trim();
  if(!addr){ if(!silent) alert("Adresse requise"); return; }

  const hideZero = document.getElementById("hideZero").checked;
  const btn = document.getElementById('btnSearch');
  btn.disabled = true; btn.classList.add("loader");

  try{
    const res = await fetch(`${API}/stats/${addr}`);
    if(!res.ok) throw new Error("Introuvable");
    const data = await res.json();

    const workers = [...data.workers].sort((a,b)=> parseHashrate(b.hashrate1d||"0") - parseHashrate(a.hashrate1d||"0"));
    const filtered = hideZero ? workers.filter(w => parseHashrate(w.hashrate1hr||"0")>0 || (w.shares||0)>0) : workers;

    const rows = filtered.map(w=>{
    const name = (w.workername||"").split('.').pop();
    return `
        <tr>
        <td class="tiny">${escapeHtml(name)}</td>
        <td>${escapeHtml(w.hashrate1m||"–")}</td>
        <td>${escapeHtml(w.hashrate5m||"–")}</td>
        <td>${escapeHtml(w.hashrate1hr||"–")}</td>
        <td>${escapeHtml(w.hashrate1d||"–")}</td>
        <td>${fmt.compact(w.shares||0)}</td>
        <td>${fmt.compact(w.bestshare||0)}</td>
        </tr>
    `;
    }).join("");

    const html = `
    <div class="card-dark p-3">
        <div class="d-flex align-items-center gap-2 flex-wrap">
        <h4 class="text-orange m-0">${escapeHtml(data.address)}</h4>
        <button class="btn btn-sm btn-outline-light" onclick="copyText('${escapeAttr(data.address)}')">Copier</button>
        </div>
        <div class="row g-3 mt-1">
        <div class="col-6 col-md-3"><div class="kpi"><div class="label">Workers</div><div class="value">${fmt.number(data.globalStats.workers)}</div></div></div>
        <div class="col-6 col-md-3"><div class="kpi"><div class="label">Hashrate 1h</div><div class="value">${escapeHtml(data.globalStats.hashrate1hr)}</div></div></div>
        <div class="col-6 col-md-3"><div class="kpi"><div class="label">Shares</div><div class="value">${fmt.compact(data.globalStats.shares)}</div></div></div>
        <div class="col-6 col-md-3"><div class="kpi"><div class="label">Best share</div><div class="value">${fmt.bestShare(data.globalStats.bestshare)}</div></div></div>
        </div>

        <h5 class="mt-3">Workers</h5>
        <div class="table-responsive">
        <table class="table table-dark table-striped table-bordered table-sm align-middle">
            <thead>
            <tr>
                <th class="pointer" onclick="sortUserTable(0)">Name</th>
                <th class="pointer" onclick="sortUserTable(1)">HR 1m</th>
                <th class="pointer" onclick="sortUserTable(2)">HR 5m</th>
                <th class="pointer" onclick="sortUserTable(3)">HR 1h</th>
                <th class="pointer" onclick="sortUserTable(4)">HR 1j</th>
                <th class="pointer" onclick="sortUserTable(5)">Shares</th>
                <th class="pointer" onclick="sortUserTable(6)">Best share</th>
            </tr>
            </thead>
            <tbody id="userWorkersBody">
            ${rows || '<tr><td colspan="7" class="text-center muted">No worker</td></tr>'}
            </tbody>
        </table>
        </div>
    </div>
    `;
    document.getElementById("userStats").innerHTML = html;
    // ➜ met l’adresse dans l’URL (remplace l’état courant)
    setAddrInUrl(addr, { replace: true });
}catch(err){
    document.getElementById("userStats").innerHTML = `<p class="text-danger">Address not found</p>`;
}finally{
    btn.disabled = false; btn.classList.remove("loader");
}
}

function sortUserTable(colIndex){
const body = document.getElementById('userWorkersBody');
if(!body) return;
const rows = Array.from(body.querySelectorAll('tr'));
const sorted = rows.sort((ra, rb)=>{
    const a = ra.children[colIndex]?.textContent.trim() || "";
    const b = rb.children[colIndex]?.textContent.trim() || "";
    if(colIndex>=1){
    const na = (colIndex<=4) ? parseHashrate(a) : parseFloat(a.replace(/\D/g,'')) ;
    const nb = (colIndex<=4) ? parseHashrate(b) : parseFloat(b.replace(/\D/g,'')) ;
    return (nb||0) - (na||0);
    }
    return a.localeCompare(b, 'fr');
});
body.innerHTML = ""; sorted.forEach(r=>body.appendChild(r));
}

// ---------- History / refresh ----------
let refreshTimer = null;
function startAutoRefresh(){
if(refreshTimer) clearInterval(refreshTimer);
refreshTimer = setInterval(()=>{ loadPool(); loadTop(); }, 30000);
}

// ---------- Misc helpers ----------
function escapeHtml(s){ return (s??"").replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/\n/g,''); }
function copyText(txt){ navigator.clipboard?.writeText(txt); }

// ---------- Bindings ----------
document.getElementById('refreshBtn').addEventListener('click', ()=>{ loadPool(); loadTop(); });

// Boutons d'intervalle
document.addEventListener('click', (e)=>{
const btn = e.target.closest('.btn-range');
if(!btn) return;
const range = btn.dataset.range;
updateHistoryChart(range);
});

document.getElementById('btnSearch').addEventListener('click', searchUser);
document.getElementById('btnCopy').addEventListener('click', () => {
  const addr = document.getElementById('btcInput').value.trim();
  if (!addr) return;
  const u = new URL(window.location.href);
  u.searchParams.set(ADDR_PARAM, addr);
  navigator.clipboard?.writeText(u.toString());
});

// initial load
ensureCharts();

// Hydrate l’input depuis l’URL (si ?addr=…)
const prefillAddr = getAddrFromUrl();
if (prefillAddr) {
  document.getElementById("btcInput").value = prefillAddr;
  updateLangLinksWithAddr(prefillAddr);
  // Recherche auto, sans pop-up si vide
  searchUser(/* silent */ true);
} else {
  updateLangLinksWithAddr("");
}

Promise.all([loadPool(), loadTop(), loadHistory()]).then(startAutoRefresh);