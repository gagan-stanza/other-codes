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

  // Find dynamic column keys safely regardless of column positions
  const findKey = (name) => keys.find(k => k.trim().toLowerCase() === name.toLowerCase()) || '';

  const propertyKey = findKey('Property');
  const mmKey = findKey('Micro Market');
  const cityKey = findKey('City');
  const bedsKey = findKey('Beds');
  const totalSoldKey = findKey('Total Sold #');
  const totalPctKey = findKey('Total Sold %');

  // Format columns for DataTables
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

  // Footer Row setup
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
    drawCallback: function () {
      updateSummaryMetricsAndCharts(keys, cityKey, mmKey, bedsKey, totalSoldKey);
    }
  });

  // Populate Initial Dropdowns
  const cityIdx = keys.indexOf(cityKey);
  const mmIdx = keys.indexOf(mmKey);

  populateDropdown('#citySelect', cityKey, data, 'All Cities');
  populateDropdown('#microMarketSelect', mmKey, data, 'All Micro Markets');

  // Event Listeners for Filters
  $('#citySelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    
    // Reset Micro Market selection when City changes
    if (mmIdx !== -1) dataTableInstance.column(mmIdx).search('');
    $('#microMarketSelect').val('');

    if (cityIdx !== -1) {
      dataTableInstance.column(cityIdx).search(val ? '^' + val + '$' : '', true, false).draw();
    }

    // Update Micro Market dropdown options based on filtered data
    const visibleData = dataTableInstance.rows({ search: 'applied' }).data().toArray();
    populateDropdown('#microMarketSelect', mmKey, visibleData, 'All Micro Markets');
  });

  $('#microMarketSelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    if (mmIdx !== -1) {
      dataTableInstance.column(mmIdx).search(val ? '^' + val + '$' : '', true, false).draw();
    }
  });

  $('#resetFilters').on('click', function () {
    $('#citySelect').val('');
    $('#microMarketSelect').val('');
    dataTableInstance.columns().search('').draw();
    populateDropdown('#citySelect', cityKey, data, 'All Cities');
    populateDropdown('#microMarketSelect', mmKey, data, 'All Micro Markets');
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
  elem.val(currentVal);
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

  // 1. Update KPI Cards
  $('#kpiProperties').text(visibleRows.length);
  $('#kpiBeds').text(totalBeds.toLocaleString());
  $('#kpiSold').text(totalSold.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  const overallPct = totalBeds > 0 ? ((totalSold / totalBeds) * 100).toFixed(1) : 0;
  $('#kpiPct').text(overallPct + '%');

  // 2. Update Footer Sums dynamically for numeric columns
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

  // 3. Render City Bar Graph (Total Sold #)
  if (cityChartInstance) cityChartInstance.destroy();
  const ctxCity = document.getElementById('cityChart').getContext('2d');
  cityChartInstance = new Chart(ctxCity, {
    type: 'bar',
    data: {
      labels: Object.keys(cityMap),
      datasets: [{
        label: 'Total Sold #',
        data: Object.values(cityMap),
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

  // 4. Render Micro Market Bar Graph (Total Sold #)
  if (mmChartInstance) mmChartInstance.destroy();
  const ctxMM = document.getElementById('channelChart').getContext('2d'); // Using existing canvas element
  mmChartInstance = new Chart(ctxMM, {
    type: 'bar',
    data: {
      labels: Object.keys(mmMap),
      datasets: [{
        label: 'Total Sold #',
        data: Object.values(mmMap),
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