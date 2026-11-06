let dataTableInstance = null;
let cityChartInstance = null;
let mmChartInstance = null;

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

// Clean helper to parse numeric values safely
function parseNum(val) {
  if (val === null || val === undefined) return 0;
  const clean = val.toString().replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function renderDashboard(data) {
  const keys = Object.keys(data[0]);

  // Dynamic header matching
  const findKey = (name) => keys.find(k => k.trim().toLowerCase() === name.toLowerCase()) || '';

  const propertyKey = findKey('Property');
  const mmKey = findKey('Micro Market');
  const cityKey = findKey('City');
  const bedsKey = findKey('Beds');
  const totalSoldKey = findKey('Total Sold #');
  const totalPctKey = findKey('Total Sold %');

  const cityIdx = keys.indexOf(cityKey);
  const mmIdx = keys.indexOf(mmKey);

  // Format table columns with progress bar for percentage
  const columns = keys.map(key => {
    if (key === totalPctKey) {
      return {
        title: key,
        data: key,
        render: function (val) {
          const num = parseNum(val);
          let color = '#f59e0b'; // Orange
          if (num >= 80) color = '#10b981'; // Green
          else if (num >= 50) color = '#3b82f6'; // Blue

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

  // Footer Row Setup
  if ($('#dataTable tfoot').length === 0) {
    let footerHtml = '<tfoot><tr>';
    keys.forEach((key, idx) => {
      footerHtml += idx === 0 ? '<td><strong>Total</strong></td>' : '<td></td>';
    });
    footerHtml += '</tr></tfoot>';
    $('#dataTable').append(footerHtml);
  }

  // Initialize DataTable
  dataTableInstance = $('#dataTable').DataTable({
    data: data,
    columns: columns,
    pageLength: 25,
    responsive: true,
    dom: 'Bfrtip',
    buttons: ['copy', 'csv', 'excel'],
    // Recalculate footer sums on draw (sorting/filtering), but keep charts decoupled from sorting
    footerCallback: function () {
      updateFooterSums(keys);
    }
  });

  // Initial calculation for metrics, dropdowns, and charts
  populateDropdown('#citySelect', cityKey, data, 'All Cities');
  populateDropdown('#microMarketSelect', mmKey, data, 'All Micro Markets');
  updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);

  // Filter Handler: City Dropdown
  $('#citySelect').on('change', function () {
    const selectedCity = $(this).val();

    // 1. Reset Micro Market search and selection
    if (mmIdx !== -1) dataTableInstance.column(mmIdx).search('');
    $('#microMarketSelect').val('');

    // 2. Filter Table by City
    if (cityIdx !== -1) {
      dataTableInstance.column(cityIdx).search(selectedCity ? '^' + $.fn.dataTable.util.escapeRegex(selectedCity) + '$' : '', true, false);
    }
    dataTableInstance.draw();

    // 3. Update Micro Market dropdown options dynamically based on visible rows
    const visibleRows = dataTableInstance.rows({ search: 'applied' }).data().toArray();
    populateDropdown('#microMarketSelect', mmKey, visibleRows, 'All Micro Markets');

    // 4. Update KPI metrics and Charts based on visible rows
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
  });

  // Filter Handler: Micro Market Dropdown
  $('#microMarketSelect').on('change', function () {
    const selectedMM = $(this).val();

    // 1. Filter Table by Micro Market
    if (mmIdx !== -1) {
      dataTableInstance.column(mmIdx).search(selectedMM ? '^' + $.fn.dataTable.util.escapeRegex(selectedMM) + '$' : '', true, false);
    }
    dataTableInstance.draw();

    // 2. Update KPI metrics and Charts based on visible rows
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
  });

  // Global Table Search Listener (so charts & KPIs update if user types in DataTable search box)
  dataTableInstance.on('search.dt', function () {
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
  });

  // Reset Button Handler
  $('#resetFilters').on('click', function () {
    $('#citySelect').val('');
    $('#microMarketSelect').val('');
    dataTableInstance.columns().search('').search('').draw();
    populateDropdown('#citySelect', cityKey, data, 'All Cities');
    populateDropdown('#microMarketSelect', mmKey, data, 'All Micro Markets');
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
  });
}

function populateDropdown(selectId, colKey, rowData, defaultLabel) {
  if (!colKey) return;
  const values = [...new Set(rowData.map(r => r[colKey]))].filter(Boolean).sort();
  const elem = $(selectId);
  const currentVal = elem.val();
  elem.html(`<option value="">${defaultLabel}</option>`);
  values.forEach(v => {
    elem.append(`<option value="${v}">${v}</option>`);
  });
  if (values.includes(currentVal)) {
    elem.val(currentVal);
  }
}

function updateFooterSums(keys) {
  if (!dataTableInstance) return;
  const visibleRows = dataTableInstance.rows({ search: 'applied' }).data().toArray();

  keys.forEach((key, colIdx) => {
    if (colIdx === 0) return;
    const isNumeric = visibleRows.some(r => !isNaN(parseNum(r[key])) && parseNum(r[key]) !== 0);
    if (isNumeric && !key.includes('%')) {
      const colSum = visibleRows.reduce((sum, r) => sum + parseNum(r[key]), 0);
      $(dataTableInstance.column(colIdx).footer()).html(colSum.toLocaleString(undefined, { maximumFractionDigits: 1 }));
    } else {
      $(dataTableInstance.column(colIdx).footer()).html('');
    }
  });
}

function updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey) {
  if (!dataTableInstance) return;

  const visibleRows = dataTableInstance.rows({ search: 'applied' }).data().toArray();

  let totalBeds = 0;
  let totalSold = 0;

  const cityMap = {};
  const mmMap = {};

  visibleRows.forEach(row => {
    const beds = parseNum(row[bedsKey]);
    const sold = parseNum(row[totalSoldKey]);
    const city = row[cityKey] || 'Unknown';
    const mm = row[mmKey] || 'Unknown';

    totalBeds += beds;
    totalSold += sold;

    cityMap[city] = (cityMap[city] || 0) + sold;
    mmMap[mm] = (mmMap[mm] || 0) + sold;
  });

  // 1. Update Top KPI Cards
  $('#kpiProperties').text(visibleRows.length);
  $('#kpiBeds').text(totalBeds.toLocaleString());
  $('#kpiSold').text(totalSold.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  const overallPct = totalBeds > 0 ? ((totalSold / totalBeds) * 100).toFixed(1) : 0;
  $('#kpiPct').text(overallPct + '%');

  // 2. Sort City Data: Higher to Lesser Total Sold
  const sortedCities = Object.entries(cityMap).sort((a, b) => b[1] - a[1]);
  const cityLabels = sortedCities.map(item => item[0]);
  const cityValues = sortedCities.map(item => item[1]);

  // 3. Sort Micro Market Data: Higher to Lesser Total Sold
  const sortedMM = Object.entries(mmMap).sort((a, b) => b[1] - a[1]);
  const mmLabels = sortedMM.map(item => item[0]);
  const mmValues = sortedMM.map(item => item[1]);

  // 4. Render / Update City Bar Chart
  if (cityChartInstance) cityChartInstance.destroy();
  const ctxCity = document.getElementById('cityChart').getContext('2d');
  cityChartInstance = new Chart(ctxCity, {
    type: 'bar',
    data: {
      labels: cityLabels,
      datasets: [{
        label: 'Total Sold #',
        data: cityValues,
        backgroundColor: '#3b82f6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });

  // 5. Render / Update Micro Market Bar Chart
  if (mmChartInstance) mmChartInstance.destroy();
  const ctxMM = document.getElementById('channelChart').getContext('2d');
  mmChartInstance = new Chart(ctxMM, {
    type: 'bar',
    data: {
      labels: mmLabels,
      datasets: [{
        label: 'Total Sold #',
        data: mmValues,
        backgroundColor: '#10b981',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

document.addEventListener('DOMContentLoaded', loadData);