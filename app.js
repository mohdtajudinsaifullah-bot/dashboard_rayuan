let currentUser = null;
let allKes = [];
let rujukanData = {
  negeri: [],
  jenis: [],
  kod: [],
  panel: [],
  status: [],
  kpiByJenis: { rayuan: 180, semakan: 90, permohonan: 180 }
};
let chartInstances = {};
let modalKemaskiniInstance = null;
let modalKpiInstance = null;

const multiFilterState = {};

const BULAN_ORDER = [
  "Januari", "Februari", "Mac", "April", "Mei", "Jun",
  "Julai", "Ogos", "September", "Oktober", "November", "Disember"
];

const BULAN_EN_TO_MY = {
  january: "Januari", february: "Februari", march: "Mac", april: "April",
  may: "Mei", june: "Jun", july: "Julai", august: "Ogos",
  september: "September", october: "Oktober", november: "November", december: "Disember"
};

// ==================== INISIALISASI ====================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("uiAppTitle").textContent = APP_CONFIG.APP_TITLE;
  document.getElementById("uiAppSubtitle").textContent = APP_CONFIG.SUBTITLE;
  modalKemaskiniInstance = new bootstrap.Modal(document.getElementById("modalKemaskiniKes"));
  modalKpiInstance = new bootstrap.Modal(document.getElementById("modalTetapanKpi"));

  const savedUser = sessionStorage.getItem("user_kes_app");
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    bukaAplikasiUtama();
  }

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const emel = document.getElementById("loginEmel").value.trim();
    const pin = document.getElementById("loginPin").value.trim();
    const alertBox = document.getElementById("loginAlert");
    alertBox.classList.add("d-none");

    toggleLoading(true, "Mengesahkan akaun...");
    try {
      const res = await hantarKeGAS("login", { emel, pin });
      if (res.status === "success") {
        currentUser = res.user;
        sessionStorage.setItem("user_kes_app", JSON.stringify(currentUser));
        bukaAplikasiUtama();
      } else {
        alertBox.textContent = res.message || "Log masuk gagal.";
        alertBox.classList.remove("d-none");
      }
    } catch (err) {
      alertBox.textContent = "Ralat sambungan ke pelayan GAS.";
      alertBox.classList.remove("d-none");
    } finally {
      toggleLoading(false);
    }
  });

  document.getElementById("formDaftarKes").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      noKes: document.getElementById("regNoKes").value.trim(),
      noDaftarJksm: document.getElementById("regNoDaftarJksm").value.trim(),
      negeri: document.getElementById("regNegeri").value,
      jenisKes: document.getElementById("regJenisKes").value,
      kodKes: document.getElementById("regKodKes").value,
      status: document.getElementById("regStatus").value,
      perayu: document.getElementById("regPerayu").value.trim(),
      responden: document.getElementById("regResponden").value.trim(),
      tarikhDaftar: document.getElementById("regTarikhDaftar").value,
      tarikhProsiding: document.getElementById("regTarikhProsiding").value,
      catatan: document.getElementById("regCatatan").value.trim(),
      panelList: ambilPanelTerpilih("regPanelBox")
    };

    toggleLoading(true, "Mendaftarkan kes baru...");
    try {
      const res = await hantarKeGAS("daftarKes", { data: payload });
      if (res.status === "success") {
        alert(res.message);
        document.getElementById("formDaftarKes").reset();
        const hintJksm = document.getElementById("hintNoJksm");
        if (hintJksm) hintJksm.textContent = "Auto-jana mengikut running no. terakhir negeri";
        await muatDataDashboard();
      } else {
        alert("Gagal: " + res.message);
      }
    } catch (err) {
      alert("Ralat rangkaian semasa menyimpan kes.");
    } finally {
      toggleLoading(false);
    }
  });
});

// ==================== HELPER TARIKH BERSIH (PEMBETULAN ISU FORMAT & KIRAAN 0 HARI) ====================
function parseCleanDate(val) {
  if (!val) return null;
  const s = String(val).trim();

  // Semak format dd/MM/yyyy atau d/M/yyyy dahulu (Format Malaysia)
  const mDMY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mDMY) {
    let d = Number(mDMY[1]);
    let m = Number(mDMY[2]);
    let y = Number(mDMY[3]);
    
    // PEMBETULAN: Jika 'hari' lebih besar dari 12, kita pasti ia format DD/MM.
    // Tetapi jika kedua-dua nilai <= 12 (cth: 01/08/2026), JS asli sering terbalikkan jadi Bulan 1, Hari 8.
    // Jadi kita paksa bacaan sebagai: [1] = Hari, [2] = Bulan.
    return new Date(y, m - 1, d);
  }

  // Format yyyy-MM-dd
  const mISO = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mISO) return new Date(Number(mISO[1]), Number(mISO[2]) - 1, Number(mISO[3]));

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

function formatTarikhSahaja(val) {
  const dt = parseCleanDate(val);
  if (!dt) return String(val || "").trim();
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

function susunTarikhTerkiniAtas(rawInput) {
  const arr = Array.isArray(rawInput)
    ? rawInput
    : String(rawInput || "").split(/[\n,]+/).map(x => x.trim()).filter(Boolean);

  const map = new Map();
  arr.forEach(item => {
    const dt = parseCleanDate(item);
    const fmt = formatTarikhSahaja(item);
    if (fmt) {
      map.set(fmt, dt ? dt.getTime() : 0);
    }
  });

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1]) // Terkini di atas
    .map(entry => entry[0]);
}

function normalisasiBulan(b) {
  if (!b) return "";
  const low = String(b).trim().toLowerCase();
  if (BULAN_EN_TO_MY[low]) return BULAN_EN_TO_MY[low];
  return String(b).trim();
}

function kiraKpiKes(k, senaraiProsidingTerkiniSusunan) {
  const kpiMap = rujukanData.kpiByJenis || { rayuan: 180, semakan: 90, permohonan: 180 };
  const jenisKey = String(k.jenisKes || "").trim().toLowerCase();
  const sasaran = Number(kpiMap[jenisKey] || 180);

  const dtDaftar = parseCleanDate(k.tarikhDaftar);
  const isSelesai = ["selesai", "s", "batal"].includes(String(k.status || "").toLowerCase());
  
  // PEMBETULAN KIRAAN HARI:
  // Jika Tarikh Selesai (kolum N) tiada, tetapi status ialah Selesai, 
  // kita ambil tarikh prosiding paling terkini (indeks 0) sebagai tarikh selesai.
  let dtSelesai = parseCleanDate(k.tarikhSelesai);
  if (isSelesai && !dtSelesai && senaraiProsidingTerkiniSusunan.length > 0) {
    dtSelesai = parseCleanDate(senaraiProsidingTerkiniSusunan[0]);
  }

  let tempoh = 0;
  let statusKpi = "Belum Dinilai"; // Untuk kes baki

  if (dtDaftar) {
    if (isSelesai && dtSelesai) {
      // Kes Selesai: Tempoh = Tarikh Selesai - Tarikh Daftar
      tempoh = Math.max(0, Math.round((dtSelesai - dtDaftar) / 86400000));
      statusKpi = tempoh <= sasaran ? "Dalam Tempoh" : "Lebih Tempoh";
    } else if (!isSelesai) {
      // Kes Baki: Tempoh = Hari Ini - Tarikh Daftar
      const kini = new Date();
      const hariIni = new Date(kini.getFullYear(), kini.getMonth(), kini.getDate());
      tempoh = Math.max(0, Math.round((hariIni - dtDaftar) / 86400000));
      // Kes Baki tidak mempunyai nilai KPI sehingga ia selesai
      statusKpi = "Belum Dinilai";
    }
  }

  return {
    isSelesai,
    tempohHari: tempoh,
    sasaranHari: sasaran,
    statusKpi: statusKpi,
    tarikhSelesaiFallback: dtSelesai ? formatTarikhSahaja(dtSelesai) : ""
  };
}

// ==================== KOMUNIKASI API GAS ====================
async function hantarKeGAS(action, payload = {}) {
  const response = await fetch(APP_CONFIG.GAS_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload })
  });
  return await response.json();
}

function toggleLoading(show, text = "Memproses data...") {
  document.getElementById("loadingText").textContent = text;
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

function logoutUser() {
  sessionStorage.removeItem("user_kes_app");
  currentUser = null;
  location.reload();
}

async function bukaAplikasiUtama() {
  document.getElementById("loginSection").classList.add("d-none");
  document.getElementById("mainAppSection").classList.remove("d-none");
  document.getElementById("navUserNama").textContent = currentUser.nama;
  document.getElementById("navUserPeranan").textContent = currentUser.peranan;

  await muatDataDashboard();
}

async function muatDataDashboard() {
  toggleLoading(true, "Memuat turun rekod kes terkini...");
  try {
    const res = await hantarKeGAS("getDashboardData", {
      peranan: currentUser.peranan,
      nama: currentUser.nama
    });

    if (res.status !== "success") {
      alert("Ralat memuat data: " + res.message);
      return;
    }

    rujukanData = res.rujukan || rujukanData;

    allKes = (res.kes || []).map(k => {
      const cleanDaftar = formatTarikhSahaja(k.tarikhDaftar);
      const dtDaftar = parseCleanDate(cleanDaftar);
      const tahunAuto = dtDaftar ? String(dtDaftar.getFullYear()) : String(k.tahun || "");
      const bulanAuto = dtDaftar ? BULAN_ORDER[dtDaftar.getMonth()] : normalisasiBulan(k.bulan);
      
      const senaraiProsiding = susunTarikhTerkiniAtas(k.tarikhProsidingList || k.tarikhProsiding);

      const hasilKpi = kiraKpiKes({
        ...k,
        tarikhDaftar: cleanDaftar,
        tarikhSelesai: formatTarikhSahaja(k.tarikhSelesai)
      }, senaraiProsiding);

      return {
        ...k,
        tarikhDaftar: cleanDaftar,
        tarikhSelesai: hasilKpi.tarikhSelesaiFallback,
        tarikhProsidingList: senaraiProsiding,
        tahun: tahunAuto,
        bulan: bulanAuto,
        isSelesai: hasilKpi.isSelesai,
        tempohHari: hasilKpi.tempohHari,
        sasaranHari: hasilKpi.sasaranHari,
        kpi: hasilKpi.statusKpi // "Dalam Tempoh", "Lebih Tempoh", "Belum Dinilai"
      };
    });

    if (currentUser.peranan === "Panel") {
      document.getElementById("adminWorkspace").classList.add("d-none");
      document.getElementById("panelWorkspace").classList.remove("d-none");
      document.getElementById("panelHeaderNama").textContent = currentUser.nama;
      initPanelMultiFilters();
      renderPanelDashboard();
    } else {
      document.getElementById("panelWorkspace").classList.add("d-none");
      document.getElementById("adminWorkspace").classList.remove("d-none");
      isiDropdownRujukan();
      initAdminMultiFilters();
      renderAdminStats();
      renderJadualKes();
    }
  } catch (err) {
    alert("Gagal menyambung ke pangkalan data Google Sheets.");
  } finally {
    toggleLoading(false);
  }
}

// ==================== KOMPONEN MULTI-SELECT CHECKBOX DROPDOWN ====================
function binaMultiSelect(containerId, key, defaultLabel, items, onChangeFn) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!multiFilterState[key]) {
    multiFilterState[key] = new Set();
  }

  const uniqueItems = [...new Set(items.filter(Boolean))];
  const searchHtml = uniqueItems.length > 6
    ? `<input type="text" class="form-control form-control-sm mb-2" placeholder="Cari..." onkeyup="tapisItemMultiSelect('${key}', this.value)">`
    : "";

  const itemsHtml = uniqueItems.map((item, idx) => {
    const checked = multiFilterState[key].has(item) ? "checked" : "";
    const safeVal = item.replace(/"/g, "&quot;");
    return `
      <div class="form-check ms-item-${key}">
        <input class="form-check-input" type="checkbox" value="${safeVal}" id="ms_${key}_${idx}" ${checked}
          onchange="togglePilihanMultiSelect('${key}', this.value, this.checked)">
        <label class="form-check-label small" for="ms_${key}_${idx}">${item}</label>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="dropdown w-100 ms-wrapper" data-default-label="${defaultLabel}">
      <button class="btn multi-filter-btn w-100 dropdown-toggle" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside">
        <span class="label-text" id="msLabel_${key}">${defaultLabel}</span>
      </button>
      <div class="dropdown-menu multi-filter-menu shadow">
        ${searchHtml}
        <div class="d-flex justify-content-between gap-1 mb-2 pb-1 border-bottom">
          <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none fw-semibold" onclick="pilihSemuaMultiSelect('${key}', true)">Pilih Semua</button>
          <button type="button" class="btn btn-link btn-sm p-0 text-danger text-decoration-none fw-semibold" onclick="pilihSemuaMultiSelect('${key}', false)">Kosongkan</button>
        </div>
        <div id="msList_${key}">${itemsHtml || '<small class="text-muted">Tiada pilihan</small>'}</div>
      </div>
    </div>
  `;

  window[`_msCallback_${key}`] = onChangeFn;
  kemaskiniLabelMultiSelect(key);
}

function togglePilihanMultiSelect(key, val, isChecked) {
  if (!multiFilterState[key]) multiFilterState[key] = new Set();
  if (isChecked) multiFilterState[key].add(val);
  else multiFilterState[key].delete(val);

  kemaskiniLabelMultiSelect(key);
  if (window[`_msCallback_${key}`]) window[`_msCallback_${key}`]();
}

function pilihSemuaMultiSelect(key, selectAll) {
  const checkboxes = document.querySelectorAll(`#msList_${key} input[type="checkbox"]`);
  multiFilterState[key] = new Set();

  checkboxes.forEach(cb => {
    cb.checked = selectAll;
    if (selectAll) multiFilterState[key].add(cb.value);
  });

  kemaskiniLabelMultiSelect(key);
  if (window[`_msCallback_${key}`]) window[`_msCallback_${key}`]();
}

function tapisItemMultiSelect(key, kw) {
  const q = kw.toLowerCase();
  document.querySelectorAll(`.ms-item-${key}`).forEach(div => {
    div.style.display = div.textContent.toLowerCase().includes(q) ? "" : "none";
  });
}

function kemaskiniLabelMultiSelect(key) {
  const labelEl = document.getElementById(`msLabel_${key}`);
  const container = labelEl ? labelEl.closest(".ms-wrapper") : null;
  const defaultLabel = container ? container.dataset.defaultLabel : "Semua";
  const selected = Array.from(multiFilterState[key] || []);

  if (selected.length === 0) {
    labelEl.textContent = defaultLabel;
    labelEl.classList.remove("fw-bold", "text-primary");
  } else if (selected.length === 1) {
    labelEl.textContent = selected[0];
    labelEl.classList.add("fw-bold", "text-primary");
  } else {
    labelEl.textContent = `${selected.length} dipilih`;
    labelEl.classList.add("fw-bold", "text-primary");
  }
}

function padamMultiFilter(key, nilai) {
  const set = multiFilterState[key];
  if (!set || set.size === 0) return true; // Tiada ditanda = papar semua
  return set.has(nilai);
}

// ==================== INISIALISASI PENAPIS ADMIN & PANEL ====================
function initAdminMultiFilters() {
  const tahunList = [...new Set(allKes.map(k => k.tahun).filter(Boolean))].sort().reverse();
  const bulanList = BULAN_ORDER.filter(b => allKes.some(k => k.bulan === b));
  const negeriList = [...new Set([...rujukanData.negeri, ...allKes.map(k => k.negeri)].filter(Boolean))].sort();
  const jenisList = [...new Set([...rujukanData.jenis, ...allKes.map(k => k.jenisKes)].filter(Boolean))].sort();
  const panelList = [...new Set([...rujukanData.panel, ...allKes.flatMap(k => k.panelList || [])].filter(Boolean))].sort();

  binaMultiSelect("msAdminTahun", "adminTahun", "Semua Tahun", tahunList, renderAdminStats);
  binaMultiSelect("msAdminBulan", "adminBulan", "Semua Bulan", bulanList.length ? bulanList : BULAN_ORDER, renderAdminStats);
  binaMultiSelect("msAdminNegeri", "adminNegeri", "Semua Negeri", negeriList, renderAdminStats);
  binaMultiSelect("msAdminJenis", "adminJenis", "Semua Jenis Kes", jenisList, renderAdminStats);
  binaMultiSelect("msAdminPanel", "adminPanel", "Semua Panel", panelList, renderAdminStats);
}

function resetAdminFilters() {
  ["adminTahun", "adminBulan", "adminNegeri", "adminJenis", "adminPanel"].forEach(k => {
    pilihSemuaMultiSelect(k, false);
  });
}

function initPanelMultiFilters() {
  const tahunList = [...new Set(allKes.map(k => k.tahun).filter(Boolean))].sort().reverse();
  const bulanList = BULAN_ORDER.filter(b => allKes.some(k => k.bulan === b));
  const jenisList = [...new Set(allKes.map(k => k.jenisKes).filter(Boolean))].sort();
  const statusList = ["Selesai", "Baki", "Dalam Tempoh", "Lebih Tempoh", "Belum Dinilai"];

  binaMultiSelect("msPanelTahun", "panelTahun", "Semua Tahun", tahunList, renderPanelDashboard);
  binaMultiSelect("msPanelBulan", "panelBulan", "Semua Bulan", bulanList.length ? bulanList : BULAN_ORDER, renderPanelDashboard);
  binaMultiSelect("msPanelJenis", "panelJenis", "Semua Jenis Kes", jenisList, renderPanelDashboard);
  binaMultiSelect("msPanelStatus", "panelStatus", "Semua Status", statusList, renderPanelDashboard);
}

function resetPanelFilters() {
  ["panelTahun", "panelBulan", "panelJenis", "panelStatus"].forEach(k => {
    pilihSemuaMultiSelect(k, false);
  });
}

// ==================== TETAPAN KPI & DROPDOWN RUJUKAN ====================
function isiDropdownRujukan() {
  const unik = (arr) => [...new Set(arr.filter(Boolean))];
  isiSelect("regNegeri", unik(rujukanData.negeri), "Pilih Negeri");
  isiSelect("regJenisKes", unik(rujukanData.jenis), "Pilih Jenis Kes");
  isiSelect("regKodKes", unik(rujukanData.kod), "Pilih Kod Kes");
  isiSelect("regStatus", unik(rujukanData.status), null);
  isiSelect("editStatus", unik(rujukanData.status), null);

  const negeriKemaskiniList = unik([...rujukanData.negeri, ...allKes.map(k => k.negeri)]).sort();
  const tahunKemaskiniList = unik(allKes.map(k => String(k.tahun || ""))).sort().reverse();
  isiSelect("filterNegeriKemaskini", negeriKemaskiniList, "Semua Negeri");
  isiSelect("filterTahunKemaskini", tahunKemaskiniList, "Semua Tahun");

  binaCheckboxPanel("regPanelBox", unik(rujukanData.panel), []);
  binaCheckboxPanel("editPanelBox", unik(rujukanData.panel), []);
  kemaskiniBadgeKpiInfo();
}

function kemaskiniBadgeKpiInfo() {
  const m = rujukanData.kpiByJenis || { rayuan: 180, semakan: 90, permohonan: 180 };
  document.getElementById("badgeRuleKpiInfo").textContent =
    `Rayuan: ${m.rayuan || 180} hari (6 Bln) | Semakan: ${m.semakan || 90} hari | Permohonan: ${m.permohonan || 180} hari`;
}

function bukaModalTetapanKpi() {
  const m = rujukanData.kpiByJenis || { rayuan: 180, semakan: 90, permohonan: 180 };
  document.getElementById("kpiInputRayuan").value = m.rayuan || 180;
  document.getElementById("kpiInputSemakan").value = m.semakan || 90;
  document.getElementById("kpiInputPermohonan").value = m.permohonan || 180;
  modalKpiInstance.show();
}

async function simpanTetapanKpi() {
  const kpiMap = {
    rayuan: Number(document.getElementById("kpiInputRayuan").value || 180),
    semakan: Number(document.getElementById("kpiInputSemakan").value || 90),
    permohonan: Number(document.getElementById("kpiInputPermohonan").value || 180)
  };

  toggleLoading(true, "Menyimpan tetapan KPI ke tab Rujukan...");
  try {
    const res = await hantarKeGAS("simpanTetapanKpi", { kpiMap });
    if (res.status === "success") {
      rujukanData.kpiByJenis = kpiMap;
      allKes = allKes.map(k => {
        const hasil = kiraKpiKes(k, k.tarikhProsidingList);
        return { ...k, sasaranHari: hasil.sasaranHari, kpi: hasil.statusKpi };
      });
      kemaskiniBadgeKpiInfo();
      renderAdminStats();
      renderJadualKes();
      modalKpiInstance.hide();
      alert(res.message);
    } else {
      alert("Gagal: " + res.message);
    }
  } catch (err) {
    alert("Ralat sambungan semasa menyimpan tetapan KPI.");
  } finally {
    toggleLoading(false);
  }
}

function isiSelect(id, items, defaultLabel) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = defaultLabel ? `<option value="">${defaultLabel}</option>` : "";
  items.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    el.appendChild(opt);
  });
}

function binaCheckboxPanel(containerId, senaraiPanel, selectedList) {
  const box = document.getElementById(containerId);
  box.innerHTML = "";
  senaraiPanel.forEach((nama, idx) => {
    const checked = selectedList.includes(nama) ? "checked" : "";
    const div = document.createElement("div");
    div.className = "form-check panel-item";
    div.innerHTML = `
      <input class="form-check-input" type="checkbox" value="${nama}" id="${containerId}_${idx}" ${checked}>
      <label class="form-check-label small" for="${containerId}_${idx}">${nama}</label>
    `;
    box.appendChild(div);
  });
}

function tapisCheckboxPanel(keyword, containerId) {
  const kw = keyword.toLowerCase();
  document.querySelectorAll(`#${containerId} .panel-item`).forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(kw) ? "" : "none";
  });
}

function ambilPanelTerpilih(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)).map(cb => cb.value);
}

// ==================== DASHBOARD STATISTIK ADMIN / URUSETIA ====================
function renderAdminStats() {
  const selPanels = multiFilterState["adminPanel"];
  const hasPanelFilter = selPanels && selPanels.size > 0;

  const filtered = allKes.filter(k => {
    if (!padamMultiFilter("adminTahun", k.tahun)) return false;
    if (!padamMultiFilter("adminBulan", k.bulan)) return false;
    if (!padamMultiFilter("adminNegeri", k.negeri)) return false;
    if (!padamMultiFilter("adminJenis", k.jenisKes)) return false;
    if (hasPanelFilter) {
      const adaPanel = (k.panelList || []).some(p => selPanels.has(p));
      if (!adaPanel) return false;
    }
    return true;
  });

  const jumlah = filtered.length;
  const selesai = filtered.filter(k => k.isSelesai).length;
  const baki = jumlah - selesai;
  
  // PEMBETULAN: KPI hanya dikira untuk kes yang SELESAI sahaja
  const selesaiDalamTempoh = filtered.filter(k => k.isSelesai && k.kpi === "Dalam Tempoh").length;
  const selesaiLebihTempoh = selesai - selesaiDalamTempoh;

  const peratusSelesai = jumlah ? ((selesai / jumlah) * 100).toFixed(1) : 0;
  const peratusKpi = selesai ? ((selesaiDalamTempoh / selesai) * 100).toFixed(1) : 0;

  document.getElementById("statJumlahKes").textContent = jumlah.toLocaleString();
  document.getElementById("statKesSelesai").textContent = selesai.toLocaleString();
  document.getElementById("statPeratusSelesai").textContent = `${peratusSelesai}% daripada jumlah`;
  document.getElementById("statKesBaki").textContent = baki.toLocaleString();
  document.getElementById("statPeratusKpi").textContent = `${peratusKpi}%`;
  document.getElementById("statBilDalamTempoh").textContent = `${selesaiDalamTempoh.toLocaleString()} dalam tempoh / ${selesaiLebihTempoh.toLocaleString()} lebih tempoh`;

  const negeriCount = {};
  const jenisCount = {};
  const panelStats = {};

  filtered.forEach(k => {
    const neg = k.negeri || "Tidak Dinyatakan";
    negeriCount[neg] = (negeriCount[neg] || 0) + 1;

    const jns = k.jenisKes || "Lain-lain";
    jenisCount[jns] = (jenisCount[jns] || 0) + 1;

    (k.panelList || []).forEach(pNama => {
      if (hasPanelFilter && !selPanels.has(pNama)) return;

      if (!panelStats[pNama]) {
        panelStats[pNama] = { jumlah: 0, selesai: 0, baki: 0, dalamTempoh: 0, lebihTempoh: 0 };
      }
      panelStats[pNama].jumlah++;
      
      if (k.isSelesai) {
        panelStats[pNama].selesai++;
        if (k.kpi === "Dalam Tempoh") panelStats[pNama].dalamTempoh++;
        else panelStats[pNama].lebihTempoh++;
      } else {
        panelStats[pNama].baki++;
      }
    });
  });

  // 1. Carta Negeri
  const sortedNegeri = Object.entries(negeriCount).sort((a, b) => b[1] - a[1]);
  lukisCarta("chartNegeri", "doughnut", {
    labels: sortedNegeri.map(x => x[0]),
    datasets: [{
      data: sortedNegeri.map(x => x[1]),
      backgroundColor: [
        "#06b6d4", "#ec4899", "#f472b6", "#f59e0b", "#6366f1",
        "#e11d48", "#f97316", "#84cc16", "#64748b", "#22c55e", "#0ea5e9", "#a855f7"
      ]
    }]
  }, { plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } } } });

  // 2. Carta Jenis Kes
  const sortedJenis = Object.entries(jenisCount).sort((a, b) => b[1] - a[1]);
  lukisCarta("chartJenisKes", "bar", {
    labels: sortedJenis.map(x => x[0]),
    datasets: [{
      label: "Jumlah Kes",
      data: sortedJenis.map(x => x[1]),
      backgroundColor: "#fb923c",
      borderRadius: 6
    }]
  }, { plugins: { legend: { display: false } } });

  // 3. Carta Pai KPI (Dalam Tempoh vs Lebih Tempoh untuk Kes Selesai shj)
  lukisCarta("chartTempohKpi", "pie", {
    labels: ["Dalam Tempoh (Selesai)", "Lebih Tempoh (Selesai)"],
    datasets: [{
      data: [selesaiDalamTempoh, selesaiLebihTempoh],
      backgroundColor: ["#10b981", "#ef4444"]
    }]
  }, { plugins: { legend: { position: "bottom" } } });

  // Jadual Prestasi Panel
  const tbody = document.getElementById("tbodyStatPanel");
  const sortedPanels = Object.entries(panelStats).sort((a, b) => b[1].jumlah - a[1].jumlah);
  tbody.innerHTML = sortedPanels.map(([nama, st], idx) => {
    // KPI dipaparkan sebagai peratusan Kes Selesai Dalam Tempoh berbanding Jumlah Kes Selesai
    const pct = st.selesai ? ((st.dalamTempoh / st.selesai) * 100).toFixed(1) : 0;
    const badgeColor = pct >= 80 ? "bg-success" : pct >= 50 ? "bg-warning text-dark" : "bg-danger";
    return `
      <tr>
        <td>${idx + 1}</td>
        <td class="fw-semibold">${nama}</td>
        <td class="text-center fw-bold">${st.jumlah}</td>
        <td class="text-center text-success">${st.selesai}</td>
        <td class="text-center text-warning fw-semibold">${st.baki}</td>
        <td class="text-center text-primary fw-semibold">${st.dalamTempoh}</td>
        <td class="text-center text-danger fw-semibold">${st.lebihTempoh}</td>
        <td class="text-center"><span class="badge ${badgeColor}">${pct}%</span></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="8" class="text-center py-3 text-muted">Tiada rekod ditemui.</td></tr>`;
}

// ==================== CARIAN & KEMASKINI KES (URUSETIA) ====================
function renderJadualKes() {
  const kw = document.getElementById("searchKesInput").value.toLowerCase().trim();
  const statusFilter = document.getElementById("filterStatusKemaskini").value;
  const negeriFilter = document.getElementById("filterNegeriKemaskini")?.value || "";
  const tahunFilter = document.getElementById("filterTahunKemaskini")?.value || "";

  const filtered = allKes.filter(k => {
    if (statusFilter === "Selesai" && !k.isSelesai) return false;
    if (statusFilter === "Baki" && k.isSelesai) return false;
    if (negeriFilter && k.negeri !== negeriFilter) return false;
    if (tahunFilter && String(k.tahun || "") !== tahunFilter) return false;

    if (!kw) return true;
    const gabungan = `${k.noKes} ${k.negeri} ${k.perayu} ${k.responden} ${(k.panelList || []).join(" ")}`.toLowerCase();
    return gabungan.includes(kw);
  });

  document.getElementById("countPaparanKes").textContent = filtered.length;
  const paparan = filtered.slice(0, 150);
  const tbody = document.getElementById("tbodySenaraiKes");

  tbody.innerHTML = paparan.map(k => {
    const tarikhBadges = (k.tarikhProsidingList || [])
      .map(t => `<span class="badge badge-date-stack">${t}</span>`).join("") || `<span class="text-muted">-</span>`;

    const panelBadges = (k.panelList || [])
      .map(p => `<span class="badge badge-panel">${p}</span>`).join("") || `<span class="text-muted">-</span>`;

    const statusBadge = k.isSelesai
      ? `<span class="badge bg-success">Selesai</span>`
      : `<span class="badge bg-warning text-dark">${k.status || "Baki"}</span>`;

    let kpiBadge = "";
    if (k.kpi === "Dalam Tempoh") {
      kpiBadge = `<span class="badge bg-info text-dark">Dalam Tempoh (${k.tempohHari}h)</span>`;
    } else if (k.kpi === "Lebih Tempoh") {
      kpiBadge = `<span class="badge bg-danger">Lebih Tempoh (${k.tempohHari}h)</span>`;
    } else {
      kpiBadge = `<span class="badge bg-secondary">Belum Dinilai</span>`;
    }

    return `
      <tr>
        <td class="fw-bold text-primary">${k.noKes}<br><small class="text-muted fw-normal">Daftar: ${k.tarikhDaftar || "-"}</small></td>
        <td><span class="fw-semibold">${k.negeri}</span><br><small class="text-muted">${k.jenisKes}</small></td>
        <td><div class="fw-semibold">${k.perayu}</div><small class="text-muted">lwn. ${k.responden}</small></td>
        <td>${tarikhBadges}</td>
        <td>${panelBadges}</td>
        <td>${statusBadge}<br>${kpiBadge}</td>
        <td class="text-end">
          <button class="btn btn-outline-primary btn-sm" onclick="bukaModalKemaskini('${k.noKes}')">
            <i class="bi bi-pencil-square"></i> Kemaskini
          </button>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="7" class="text-center py-4 text-muted">Tiada rekod kes sepadan dengan carian.</td></tr>`;
}

function bukaModalKemaskini(noKes) {
  const kes = allKes.find(k => k.noKes === noKes);
  if (!kes) return;

  document.getElementById("editModalNoKes").textContent = kes.noKes;
  document.getElementById("editNoKesHidden").value = kes.noKes;
  document.getElementById("editInfoNegeri").textContent = `${kes.negeri} (${kes.jenisKes})`;
  document.getElementById("editInfoTarikhDaftar").textContent = kes.tarikhDaftar || "-";
  document.getElementById("editInfoPihak").textContent = `${kes.perayu} lwn. ${kes.responden}`;

  const tarikhArr = kes.tarikhProsidingList || [];
  document.getElementById("editSejarahTarikh").innerHTML = tarikhArr.length
    ? tarikhArr.map((t, i) => `<span class="badge badge-date-stack">${i === 0 ? "★ " + t + " (Terkini)" : t}</span>`).join("")
    : `<span class="text-muted small">Belum ada tarikh prosiding</span>`;

  document.getElementById("editTarikhProsidingBaru").value = "";
  document.getElementById("editTarikhSelesai").value = "";
  document.getElementById("editStatus").value = kes.status || "Prosiding";
  document.getElementById("editCatatan").value = kes.catatan || "";

  binaCheckboxPanel("editPanelBox", [...new Set(rujukanData.panel.filter(Boolean))], kes.panelList || []);
  modalKemaskiniInstance.show();
}

async function simpanKemaskiniKes() {
  const payload = {
    noKes: document.getElementById("editNoKesHidden").value,
    tarikhProsidingBaru: document.getElementById("editTarikhProsidingBaru").value,
    panelList: ambilPanelTerpilih("editPanelBox"),
    status: document.getElementById("editStatus").value,
    tarikhSelesai: document.getElementById("editTarikhSelesai").value,
    catatan: document.getElementById("editCatatan").value.trim()
  };

  toggleLoading(true, "Menyimpan kemaskini kes...");
  try {
    const res = await hantarKeGAS("kemaskiniKes", { data: payload });
    if (res.status === "success") {
      modalKemaskiniInstance.hide();
      await muatDataDashboard();
      alert(res.message);
    } else {
      alert("Gagal kemaskini: " + res.message);
    }
  } catch (err) {
    alert("Ralat sambungan semasa menyimpan perubahan.");
  } finally {
    toggleLoading(false);
  }
}

// ==================== DASHBOARD PRESTASI KHUSUS PANEL ====================
function renderPanelDashboard() {
  const selStatus = multiFilterState["panelStatus"];
  const hasStatusFilter = selStatus && selStatus.size > 0;

  const filtered = allKes.filter(k => {
    if (!padamMultiFilter("panelTahun", k.tahun)) return false;
    if (!padamMultiFilter("panelBulan", k.bulan)) return false;
    if (!padamMultiFilter("panelJenis", k.jenisKes)) return false;

    if (hasStatusFilter) {
      const tags = [
        k.isSelesai ? "Selesai" : "Baki",
        k.kpi // "Dalam Tempoh", "Lebih Tempoh", "Belum Dinilai"
      ];
      if (!tags.some(t => selStatus.has(t))) return false;
    }
    return true;
  });

  const jumlah = filtered.length;
  const selesai = filtered.filter(k => k.isSelesai).length;
  const baki = jumlah - selesai;
  
  const selesaiDalamTempoh = filtered.filter(k => k.isSelesai && k.kpi === "Dalam Tempoh").length;
  const selesaiLebihTempoh = selesai - selesaiDalamTempoh;
  const peratusKpi = selesai ? ((selesaiDalamTempoh / selesai) * 100).toFixed(1) : 0;

  document.getElementById("pStatJumlah").textContent = jumlah.toLocaleString();
  document.getElementById("pStatSelesai").textContent = selesai.toLocaleString();
  document.getElementById("pStatBaki").textContent = baki.toLocaleString();
  document.getElementById("pStatKpiPeratus").textContent = `${peratusKpi}%`;
  document.getElementById("pStatKpiTeks").textContent = `${selesaiDalamTempoh} kes capai KPI`;
  document.getElementById("panelCountRekod").textContent = `${jumlah} kes dipaparkan`;

  lukisCarta("chartPanelKpi", "doughnut", {
    labels: ["Dalam Tempoh (Selesai)", "Lebih Tempoh (Selesai)"],
    datasets: [{
      data: [selesaiDalamTempoh, selesaiLebihTempoh],
      backgroundColor: ["#10b981", "#ef4444"]
    }]
  });

  const jenisMap = {};
  filtered.forEach(k => {
    const j = k.jenisKes || "Lain-lain";
    jenisMap[j] = (jenisMap[j] || 0) + 1;
  });
  lukisCarta("chartPanelJenis", "bar", {
    labels: Object.keys(jenisMap),
    datasets: [{
      label: "Bilangan Kes",
      data: Object.values(jenisMap),
      backgroundColor: "#3b82f6",
      borderRadius: 6
    }]
  }, { plugins: { legend: { display: false } } });

  const tbody = document.getElementById("tbodyPanelKes");
  tbody.innerHTML = filtered.map(k => {
    const tempohPaparan = k.isSelesai ? `${k.tempohHari} hari (Selesai)` : `${k.tempohHari} hari (Berjalan)`;
    const statusBadge = k.isSelesai
      ? `<span class="badge bg-primary">Selesai</span>`
      : `<span class="badge bg-warning text-dark">Baki</span>`;

    let kpiBadge = "";
    if (k.kpi === "Dalam Tempoh") {
      kpiBadge = `<span class="badge bg-success">Dalam Tempoh</span>`;
    } else if (k.kpi === "Lebih Tempoh") {
      kpiBadge = `<span class="badge bg-danger">Lebih Tempoh</span>`;
    } else {
      kpiBadge = `<span class="badge bg-secondary">Belum Dinilai</span>`;
    }

    const tarikhProsHtml = (k.tarikhProsidingList || [])
      .map(t => `<span class="badge badge-date-stack">${t}</span>`).join("") || `<span class="text-muted">-</span>`;

    return `
      <tr>
        <td class="fw-bold">${k.noKes}</td>
        <td>${k.negeri}<br><small class="text-muted">${k.jenisKes}</small></td>
        <td>${k.perayu} <small class="text-muted">lwn.</small> ${k.responden}</td>
        <td class="fw-semibold">${k.tarikhDaftar || "-"}</td>
        <td>${tarikhProsHtml}</td>
        <td class="fw-semibold">${tempohPaparan}<br><small class="text-muted">Sasaran: ${k.sasaranHari}h</small></td>
        <td>${kpiBadge}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="8" class="text-center py-4 text-muted">Tiada kes ditemui bagi pilihan ini.</td></tr>`;
}

// ==================== HELPER CARTA ====================
function lukisCarta(canvasId, type, data, extraOptions = {}) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }
  const ctx = document.getElementById(canvasId).getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...extraOptions
    }
  });
}
// ==================== AUTO-JANA NO. DAFTAR JKSM MENGIKUT NEGERI ====================
function janaNoDaftarJksm() {
  const noKesInput = document.getElementById("regNoKes");
  const jksmInput = document.getElementById("regNoDaftarJksm");
  const negeriSelect = document.getElementById("regNegeri");
  const hintEl = document.getElementById("hintNoJksm");

  if (!noKesInput || !jksmInput || !negeriSelect) return;

  const noKes = noKesInput.value.trim();
  if (!noKes) {
    jksmInput.value = "";
    if (hintEl) hintEl.textContent = "Auto-jana mengikut running no. terakhir negeri";
    return;
  }

  // Padankan corak No. Kes: cth 2509-A0007-043-0019.A1
  const match = noKes.match(/^(.+-)(\d+)(?:[.-]([A-Za-z0-9]+))?$/);
  if (!match) {
    if (hintEl) hintEl.textContent = "Format No. Kes belum lengkap untuk auto-jana";
    return;
  }

  const prefix = match[1];           // cth: 2509-A0007-043-
  const seqLength = match[2].length; // cth: 4 digit (0019)
  const suffix = match[3] || "";     // cth: A1

  const segs = prefix.split("-").filter(Boolean);
  const yearPrefix = segs[0] && /^\d{2}/.test(segs[0]) ? segs[0].slice(0, 2) : "";
  const courtCode = segs.length >= 2 ? segs[1] : "";

  // Auto-pilih Negeri jika belum dipilih berdasarkan kod mahkamah dalam rekod sedia ada
  let negeri = negeriSelect.value;
  if (!negeri && courtCode) {
    const padanNegeri = allKes.find(k =>
      k.negeri && (
        String(k.noKes || "").includes(`-${courtCode}-`) ||
        String(k.noDaftarJksm || "").includes(`-${courtCode}-`)
      )
    );
    if (padanNegeri) {
      negeri = padanNegeri.negeri;
      negeriSelect.value = negeri;
    }
  }

  // Semak running no. terakhir dalam senarai daftar sedia ada untuk negeri & tahun tersebut
  let maxNo = 0;
  allKes.forEach(k => {
    const jksm = String(k.noDaftarJksm || "").trim();
    if (!jksm) return;

    // Tapis mengikut negeri (atau kod mahkamah jika negeri belum dipilih)
    if (negeri) {
      if (k.negeri !== negeri) return;
    } else if (courtCode) {
      if (!jksm.includes(`-${courtCode}-`)) return;
    }

    // Tapis mengikut awalan tahun 2-digit jika ada (cth: 25 vs 26)
    if (yearPrefix && /^\d{2}/.test(jksm) && !jksm.startsWith(yearPrefix)) {
      return;
    }

    // Ekstrak nombor larian sebelum .JKSM (cth: -0019.JKSMA1 -> 19)
    const mJksm = jksm.match(/-(\d+)\.JKSM/i);
    if (mJksm) {
      const num = parseInt(mJksm[1], 10);
      if (!isNaN(num) && num > maxNo) maxNo = num;
      return;
    }

    // Sandaran jika format lama tanpa .JKSM
    const mGen = jksm.match(/^.+?-(\d+)(?:[.-][A-Za-z0-9]+)?$/);
    if (mGen) {
      const num = parseInt(mGen[1], 10);
      if (!isNaN(num) && num > maxNo) maxNo = num;
    }
  });

  const nextNo = maxNo + 1;
  const nextPadded = String(nextNo).padStart(seqLength, "0");
  jksmInput.value = `${prefix}${nextPadded}.JKSM${suffix}`;

  if (hintEl) {
    if (negeri) {
      hintEl.textContent = maxNo > 0
        ? `Rekod terakhir ${negeri}: ${String(maxNo).padStart(seqLength, "0")} → Dijana: ${nextPadded}`
        : `Rekod pertama ${negeri} → Dijana: ${nextPadded}`;
    } else {
      hintEl.textContent = `Sila pilih Negeri untuk semakan tepat (Dijana: ${nextPadded})`;
    }
  }
}