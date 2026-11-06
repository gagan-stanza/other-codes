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

function parseNum(val) {
  if (val === null || val === undefined) return 0;
  const clean = val.toString().replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function renderDashboard(data) {
  const keys = Object.keys(data[0]);

  // Dynamic header matching based on your new sheet structure
  const findKey = (name) => keys.find(k => k.trim().toLowerCase() === name.toLowerCase()) || '';

  const propertyKey = findKey('Property');
  const mmKey = findKey('Micro Market');
  const cityKey = findKey('City');
  const bedsKey = findKey('Ops Beds') || findKey('Beds') || findKey('Total Beds'); // Fallback check
  const totalSoldKey = findKey('Total Sold #');
  const totalPctKey = findKey('Total Sold %');

  const cityIdx = keys.indexOf(cityKey);
  const mmIdx = keys.indexOf(mmKey);

  // Column formatting for data table (Progress Bar for Total Sold %)
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

  // Dynamic Footer Setup
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
    footerCallback: function () {
      updateFooterSums(keys);
    }
  });

  // Initial Dropdowns & Metrics Population
  populateDropdown('#citySelect', cityKey, data, 'All Cities');
  populateDropdown('#microMarketSelect', mmKey, data, 'All Micro Markets');
  updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);

  // Filter Handler: City Selection
  $('#citySelect').on('change', function () {
    const selectedCity = $(this).val();

    if (mmIdx !== -1) dataTableInstance.column(mmIdx).search('');
    $('#microMarketSelect').val('');

    if (cityIdx !== -1) {
      dataTableInstance.column(cityIdx).search(selectedCity ? '^' + $.fn.dataTable.util.escapeRegex(selectedCity) + '$' : '', true, false);
    }
    dataTableInstance.draw();

    const visibleRows = dataTableInstance.rows({ search: 'applied' }).data().toArray();
    populateDropdown('#microMarketSelect', mmKey, visibleRows, 'All Micro Markets');
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
  });

  // Filter Handler: Micro Market Selection
  $('#microMarketSelect').on('change', function () {
    const selectedMM = $(this).val();

    if (mmIdx !== -1) {
      dataTableInstance.column(mmIdx).search(selectedMM ? '^' + $.fn.dataTable.util.escapeRegex(selectedMM) + '$' : '', true, false);
    }
    dataTableInstance.draw();
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
  });

  // Table Search Bar Listener
  dataTableInstance.on('search.dt', function () {
    updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
  });

  // Reset Filters Handler
  $('#resetFilters').on('click', function () {
    $('#citySelect').val('');
    $('#microMarketSelect').val('');
    dataTableInstance.columns().search('').draw();
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

  // Calculate & Sort City Occupancy %
  const sortedCities = Object.entries(cityTotals)
    .map(([city, data]) => ({
      name: city,
      pct: data.beds > 0 ? parseFloat(((data.sold / data.beds) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.pct - a.pct);

  // Calculate & Sort Micro Market Occupancy %
  const sortedMM = Object.entries(mmTotals)
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
      labels: sortedCities.map(i => i.name),
      datasets: [{
        label: 'Occupancy %',
        data: sortedCities.map(i => i.pct),
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
      labels: sortedMM.map(i => i.name),
      datasets: [{
        label: 'Occupancy %',
        data: sortedMM.map(i => i.pct),
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

document.addEventListener('DOMContentLoaded', loadData);