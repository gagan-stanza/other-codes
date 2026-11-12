const ALLOWED_DOMAIN = "stanzaliving.com"; //  Authorized Domain for Google Sign-In

let dataTableInstance = null;
let cityChartInstance = null;
let mmChartInstance = null;
let categoryChartInstance = null;
let modalChartInstance = null;

let currentSortedCities = [];
let currentSortedMM = [];
let currentSortedCategory = [];

// Register ChartDataLabels plugin globally
Chart.register(ChartDataLabels);

// --- Google Authentication Gate Logic ---
function handleCredentialResponse(response) {
  const payload = parseJwt(response.credential);
  
  if (payload.email && payload.email.endsWith('@' + ALLOWED_DOMAIN)) {
    sessionStorage.setItem('dashboard_auth_email', payload.email);
    document.getElementById('googleAuthModal').style.display = 'none';
    loadData();
  } else {
    const errorElem = document.getElementById('googleAuthError');
    if (errorElem) {
      errorElem.innerText = `Access denied (${payload.email}). You must sign in with a @${ALLOWED_DOMAIN} email.`;
      errorElem.style.display = 'block';
    }
  }
}

function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(c => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return JSON.parse(jsonPayload);
}

// Auto-login check if session is already authenticated
document.addEventListener('DOMContentLoaded', () => {
  const savedEmail = sessionStorage.getItem('dashboard_auth_email');
  if (savedEmail && savedEmail.endsWith('@' + ALLOWED_DOMAIN)) {
    const modal = document.getElementById('googleAuthModal');
    if (modal) modal.style.display = 'none';
    loadData();
  }
});

// --- Dashboard Code ---
function loadData() {
  fetch('data.json')
    .then(response => response.json())
    .then(data => {
      if (data && data.length > 0) {
        renderDashboard(data);
      }
    })
    .catch(err => console.error('Error loading data:', err));
}

function parseNum(val) {
  if (val === null || val === undefined) return 0;
  const clean = val.toString().replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function renderDashboard(data) {
  const keys = Object.keys(data[0]);

  const findKey = (name) => keys.find(k => k.trim().toLowerCase() === name.toLowerCase()) || '';

  const cityKey = findKey('City');
  const mmKey = findKey('Micro-Market');
  const propertyKey = findKey('Property');
  const categoryKey = findKey('Category');
  const bedsKey = findKey('Ops Beds #');
  const totalSoldKey = findKey('Sold Beds #');
  const totalPctKey = findKey('Sold %');

  const cityIdx = keys.indexOf(cityKey);
  const mmIdx = keys.indexOf(mmKey);

  const columns = keys.map(key => {
    if (key === totalPctKey) {
      return {
        title: key,
        data: key,
        render: function (val) {
          const num = parseNum(val);
          let color = '#ef4444'; // Red (Default for < 60%)
          if (num >= 80) color = '#10b981'; // Green (80% to 100%)
          else if (num >= 60) color = '#f59e0b'; // Amber (60% to < 80%)

          return `
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style="width: ${Math.min(num, 100)}%; background-color: ${color};"></div>
              <span class="progress-text">${val}</span>
            </div>`;
        }
      };
    }
    return { title: key, data: key, defaultContent: "" };
  });

  // Initialize DataTable
  dataTableInstance = $('#dataTable').DataTable({
    data: data,
    columns: columns,
    pageLength: 25,
    responsive: true,
    dom: 'Bfrtip',
    buttons: ['copy', 'csv', 'excel']
  });

  // Move export buttons container directly into top filter bar
  dataTableInstance.buttons().container().appendTo('#exportContainer');

  // Initialize dropdowns
  populateDropdown('#citySelect', cityKey, data, 'All Cities');
  populateDropdown('#microMarketSelect', mmKey, data, 'All Micro-Markets');
  
  updateSummaryMetricsAndCharts(keys, cityKey, mmKey, categoryKey, bedsKey, totalSoldKey);

  $('#citySelect').on('change', function () {
    const selectedCity = $(this).val();

    if (mmIdx !== -1) dataTableInstance.column(mmIdx).search('');
    $('#microMarketSelect').val('').trigger('change.select2');

    if (cityIdx !== -1) {
      dataTableInstance.column(cityIdx).search(selectedCity ? '^' + $.fn.dataTable.util.escapeRegex(selectedCity) + '$' : '', true, false);
    }
    dataTableInstance.draw();

    const visibleRows = dataTableInstance.rows({ search: 'applied' }).data().toArray();
    populateDropdown('#microMarketSelect', mmKey, visibleRows, 'All Micro-Markets');
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, categoryKey, bedsKey, totalSoldKey);
  });

  $('#microMarketSelect').on('change', function () {
    const selectedMM = $(this).val();

    if (mmIdx !== -1) {
      dataTableInstance.column(mmIdx).search(selectedMM ? '^' + $.fn.dataTable.util.escapeRegex(selectedMM) + '$' : '', true, false);
    }
    dataTableInstance.draw();
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, categoryKey, bedsKey, totalSoldKey);
  });

  dataTableInstance.on('search.dt', function () {
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, categoryKey, bedsKey, totalSoldKey);
  });

  $('#resetFilters').on('click', function () {
    $('#citySelect').val('').trigger('change.select2');
    $('#microMarketSelect').val('').trigger('change.select2');
    dataTableInstance.columns().search('').draw();
    populateDropdown('#citySelect', cityKey, data, 'All Cities');
    populateDropdown('#microMarketSelect', mmKey, data, 'All Micro-Markets');
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, categoryKey, bedsKey, totalSoldKey);
  });

  // Expand Modal Listeners
  $('#expandMMChart').on('click', () => openModalChart('Sold % by Micro-Market', currentSortedMM, '#10b981'));
  $('#expandCityChart').on('click', () => openModalChart('Sold % by City', currentSortedCities, '#3b82f6'));
  $('#expandCategoryChart').on('click', () => openModalChart('Sold % by Category', currentSortedCategory, '#8b5cf6'));
  $('#closeModal').on('click', closeModal);
  $('#chartModal').on('click', function(e) {
    if (e.target === this) closeModal();
  });
}

function populateDropdown(selectId, colKey, rowData, defaultLabel) {
  if (!colKey) return;
  const values = [...new Set(rowData.map(r => r[colKey]))].filter(Boolean).sort();
  const elem = $(selectId);
  const currentVal = elem.val();
  
  if (elem.hasClass("select2-hidden-accessible")) {
    elem.select2('destroy');
  }

  elem.html(`<option value="">${defaultLabel}</option>`);
  values.forEach(v => {
    elem.append(`<option value="${v}">${v}</option>`);
  });
  
  if (values.includes(currentVal)) {
    elem.val(currentVal);
  }

  elem.select2({
    placeholder: defaultLabel,
    allowClear: true,
    width: '200px'
  });
}

function updateSummaryMetricsAndCharts(keys, cityKey, mmKey, categoryKey, bedsKey, totalSoldKey) {
  if (!dataTableInstance) return;

  const visibleRows = dataTableInstance.rows({ search: 'applied' }).data().toArray();

  let totalBeds = 0;
  let totalSold = 0;

  const cityTotals = {};
  const mmTotals = {};
  const categoryTotals = {};

  visibleRows.forEach(row => {
    const beds = parseNum(row[bedsKey]);
    const sold = parseNum(row[totalSoldKey]);
    const city = row[cityKey] || 'Unknown';
    const mm = row[mmKey] || 'Unknown';
    const category = row[categoryKey] || 'Unknown';

    totalBeds += beds;
    totalSold += sold;

    if (!cityTotals[city]) cityTotals[city] = { beds: 0, sold: 0 };
    cityTotals[city].beds += beds;
    cityTotals[city].sold += sold;

    if (!mmTotals[mm]) mmTotals[mm] = { beds: 0, sold: 0 };
    mmTotals[mm].beds += beds;
    mmTotals[mm].sold += sold;

    if (!categoryTotals[category]) categoryTotals[category] = { beds: 0, sold: 0 };
    categoryTotals[category].beds += beds;
    categoryTotals[category].sold += sold;
  });

  // Update Top KPI Cards
  $('#kpiProperties').text(visibleRows.length);
  $('#kpiBeds').text(totalBeds.toLocaleString());
  $('#kpiSold').text(totalSold.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  const overallPct = totalBeds > 0 ? ((totalSold / totalBeds) * 100).toFixed(1) : 0;
  $('#kpiPct').text(overallPct + '%');

  // Compute Micro-Market Occupancy %
  currentSortedMM = Object.entries(mmTotals)
    .map(([mm, data]) => ({
      name: mm,
      pct: data.beds > 0 ? parseFloat(((data.sold / data.beds) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.pct - a.pct);

  // Compute City Occupancy %
  currentSortedCities = Object.entries(cityTotals)
    .map(([city, data]) => ({
      name: city,
      pct: data.beds > 0 ? parseFloat(((data.sold / data.beds) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.pct - a.pct);

  // Compute Category Occupancy %
  currentSortedCategory = Object.entries(categoryTotals)
    .map(([cat, data]) => ({
      name: cat,
      pct: data.beds > 0 ? parseFloat(((data.sold / data.beds) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.pct - a.pct);

  // 1. Render Micro Market Chart
  const showMMLabels = currentSortedMM.length <= 15;

  if (mmChartInstance) mmChartInstance.destroy();
  const ctxMM = document.getElementById('channelChart').getContext('2d');
  mmChartInstance = new Chart(ctxMM, {
    type: 'bar',
    data: {
      labels: currentSortedMM.map(i => i.name),
      datasets: [{
        label: 'Occupancy %',
        data: currentSortedMM.map(i => i.pct),
        backgroundColor: '#10b981',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: showMMLabels ? 20 : 0 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` Occupancy: ${ctx.raw}%` } },
        datalabels: {
          display: showMMLabels,
          anchor: 'end',
          align: 'top',
          color: '#2c3e50',
          font: { weight: 'bold', size: 10 },
          formatter: (value) => value + '%'
        }
      },
      scales: {
        y: { beginAtZero: true, max: showMMLabels ? 110 : 100, ticks: { callback: (val) => val <= 100 ? val + '%' : '' } }
      }
    }
  });

  // 2. Render City Chart
  if (cityChartInstance) cityChartInstance.destroy();
  const ctxCity = document.getElementById('cityChart').getContext('2d');
  cityChartInstance = new Chart(ctxCity, {
    type: 'bar',
    data: {
      labels: currentSortedCities.map(i => i.name),
      datasets: [{
        label: 'Occupancy %',
        data: currentSortedCities.map(i => i.pct),
        backgroundColor: '#3b82f6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` Occupancy: ${ctx.raw}%` } },
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: '#2c3e50',
          font: { weight: 'bold', size: 10 },
          formatter: (value) => value + '%'
        }
      },
      scales: {
        y: { beginAtZero: true, max: 110, ticks: { callback: (val) => val <= 100 ? val + '%' : '' } }
      }
    }
  });

  // 3. Render Category Chart
  if (categoryChartInstance) categoryChartInstance.destroy();
  const ctxCategory = document.getElementById('categoryChart').getContext('2d');
  categoryChartInstance = new Chart(ctxCategory, {
    type: 'bar',
    data: {
      labels: currentSortedCategory.map(i => i.name),
      datasets: [{
        label: 'Occupancy %',
        data: currentSortedCategory.map(i => i.pct),
        backgroundColor: '#8b5cf6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` Occupancy: ${ctx.raw}%` } },
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: '#2c3e50',
          font: { weight: 'bold', size: 10 },
          formatter: (value) => value + '%'
        }
      },
      scales: {
        y: { beginAtZero: true, max: 110, ticks: { callback: (val) => val <= 100 ? val + '%' : '' } }
      }
    }
  });
}

function openModalChart(title, dataItems, barColor) {
  $('#modalChartTitle').text(title);
  $('#chartModal').css('display', 'flex');

  const minBarWidth = 45;
  const calculatedWidth = Math.max(dataItems.length * minBarWidth, 800);
  $('#modalChartWrapper').css('width', `${calculatedWidth}px`);

  if (modalChartInstance) modalChartInstance.destroy();

  const ctxModal = document.getElementById('modalChartCanvas').getContext('2d');
  modalChartInstance = new Chart(ctxModal, {
    type: 'bar',
    data: {
      labels: dataItems.map(i => i.name),
      datasets: [{
        label: 'Occupancy %',
        data: dataItems.map(i => i.pct),
        backgroundColor: barColor,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 25 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` Occupancy: ${ctx.raw}%` } },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'top',
          color: '#2c3e50',
          font: { weight: 'bold', size: 11 },
          formatter: (value) => value + '%'
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            font: { size: 12, weight: '500' }
          }
        },
        y: {
          beginAtZero: true,
          max: 110,
          ticks: { callback: (val) => val <= 100 ? val + '%' : '' }
        }
      }
    }
  });
}

function closeModal() {
  $('#chartModal').css('display', 'none');
}