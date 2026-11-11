let dataTableInstance = null;
let cityChartInstance = null;
let mmChartInstance = null;
let modalChartInstance = null;

let currentSortedCities = [];
let currentSortedMM = [];

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

  const propertyKey = findKey('Property');
  const mmKey = findKey('Micro Market');
  const cityKey = findKey('City');
  const bedsKey = findKey('Ops Beds') || findKey('Beds') || findKey('Total Beds');
  const totalSoldKey = findKey('Total Sold #');
  const totalPctKey = findKey('Total Sold %');

  const cityIdx = keys.indexOf(cityKey);
  const mmIdx = keys.indexOf(mmKey);

  const columns = keys.map(key => {
    if (key === totalPctKey) {
      return {
        title: key,
        data: key,
        render: function (val) {
          const num = parseNum(val);
          let color = '#f59e0b';
          if (num >= 80) color = '#10b981';
          else if (num >= 50) color = '#3b82f6';

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

  // Move export buttons container directly into top filter bar (right corner)
  dataTableInstance.buttons().container().appendTo('#exportContainer');

  // Initialize dropdowns with Select2 search boxes
  populateDropdown('#citySelect', cityKey, data, 'All Cities');
  populateDropdown('#microMarketSelect', mmKey, data, 'All Micro Markets');
  
  updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);

  $('#citySelect').on('change', function () {
    const selectedCity = $(this).val();

    if (mmIdx !== -1) dataTableInstance.column(mmIdx).search('');
    $('#microMarketSelect').val('').trigger('change.select2');

    if (cityIdx !== -1) {
      dataTableInstance.column(cityIdx).search(selectedCity ? '^' + $.fn.dataTable.util.escapeRegex(selectedCity) + '$' : '', true, false);
    }
    dataTableInstance.draw();

    const visibleRows = dataTableInstance.rows({ search: 'applied' }).data().toArray();
    populateDropdown('#microMarketSelect', mmKey, visibleRows, 'All Micro Markets');
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
  });

  $('#microMarketSelect').on('change', function () {
    const selectedMM = $(this).val();

    if (mmIdx !== -1) {
      dataTableInstance.column(mmIdx).search(selectedMM ? '^' + $.fn.dataTable.util.escapeRegex(selectedMM) + '$' : '', true, false);
    }
    dataTableInstance.draw();
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
  });

  dataTableInstance.on('search.dt', function () {
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
  });

  $('#resetFilters').on('click', function () {
    $('#citySelect').val('').trigger('change.select2');
    $('#microMarketSelect').val('').trigger('change.select2');
    dataTableInstance.columns().search('').draw();
    populateDropdown('#citySelect', cityKey, data, 'All Cities');
    populateDropdown('#microMarketSelect', mmKey, data, 'All Micro Markets');
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
  });

  // Expand Modal Listeners
  $('#expandCityChart').on('click', () => openModalChart('Sold % by City', currentSortedCities, '#3b82f6'));
  $('#expandMMChart').on('click', () => openModalChart('Sold % by Micro Market', currentSortedMM, '#10b981'));
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
  
  // Destroy previous Select2 instance before updating options
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

  // Re-initialize Select2 with search enabled
  elem.select2({
    placeholder: defaultLabel,
    allowClear: true,
    width: '200px'
  });
}

function updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey) {
  if (!dataTableInstance) return;

  const visibleRows = dataTableInstance.rows({ search: 'applied' }).data().toArray();

  let totalBeds = 0;
  let totalSold = 0;

  const cityTotals = {};
  const mmTotals = {};

  visibleRows.forEach(row => {
    const beds = parseNum(row[bedsKey]);
    const sold = parseNum(row[totalSoldKey]);
    const city = row[cityKey] || 'Unknown';
    const mm = row[mmKey] || 'Unknown';

    totalBeds += beds;
    totalSold += sold;

    if (!cityTotals[city]) cityTotals[city] = { beds: 0, sold: 0 };
    cityTotals[city].beds += beds;
    cityTotals[city].sold += sold;

    if (!mmTotals[mm]) mmTotals[mm] = { beds: 0, sold: 0 };
    mmTotals[mm].beds += beds;
    mmTotals[mm].sold += sold;
  });

  // Update Top KPI Cards
  $('#kpiProperties').text(visibleRows.length);
  $('#kpiBeds').text(totalBeds.toLocaleString());
  $('#kpiSold').text(totalSold.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  const overallPct = totalBeds > 0 ? ((totalSold / totalBeds) * 100).toFixed(1) : 0;
  $('#kpiPct').text(overallPct + '%');

  // Compute City Occupancy %
  currentSortedCities = Object.entries(cityTotals)
    .map(([city, data]) => ({
      name: city,
      pct: data.beds > 0 ? parseFloat(((data.sold / data.beds) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.pct - a.pct);

  // Compute Micro Market Occupancy %
  currentSortedMM = Object.entries(mmTotals)
    .map(([mm, data]) => ({
      name: mm,
      pct: data.beds > 0 ? parseFloat(((data.sold / data.beds) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.pct - a.pct);

  // Render City Chart
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
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` Occupancy: ${ctx.raw}%` } }
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: (val) => val + '%' } }
      }
    }
  });

  // Render Micro Market Chart
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
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` Occupancy: ${ctx.raw}%` } }
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: (val) => val + '%' } }
      }
    }
  });
}

function openModalChart(title, dataItems, barColor) {
  $('#modalChartTitle').text(title);
  $('#chartModal').css('display', 'flex');

  const minBarWidth = 35;
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
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` Occupancy: ${ctx.raw}%` } }
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
          max: 100,
          ticks: { callback: (val) => val + '%' }
        }
      }
    }
  });
}

function closeModal() {
  $('#chartModal').css('display', 'none');
}

document.addEventListener('DOMContentLoaded', loadData);