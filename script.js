let dataTableInstance = null;
let cityChartInstance = null;
let channelChartInstance = null;

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

function renderDashboard(data) {
  const keys = Object.keys(data[0]);

  const microMarketIdx = 1; // Column B (Micro Market)
  const cityIdx = 2;        // Column C (City)
  const bedsIdx = 8;        // Column I (Beds)
  const scholarIdx = 9;     // Column J (Scholar Sold #)
  const wpIdx = 10;         // Column K (WP Sold #)
  const coachingIdx = 11;   // Column L (Coaching Sold #)
  const hydraIdx = 12;      // Column M (Hydra Sold #)
  const totalSoldIdx = 13;  // Column N (Total Sold #)
  const totalPctIdx = 14;   // Column O (Total Sold %)

  // Define table columns with custom formatting for Column O (Progress Bar)
  const columns = keys.map((key, index) => {
    if (index === totalPctIdx) {
      return {
        title: key,
        data: key,
        render: function (val) {
          const num = parseFloat(val) || 0;
          let color = '#f59e0b'; // Default orange
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

  // Setup Table Footer HTML
  let footerHtml = '<tfoot><tr>';
  keys.forEach((key, idx) => {
    footerHtml += idx === 0 ? '<td><strong>Total</strong></td>' : '<td></td>';
  });
  footerHtml += '</tr></tfoot>';
  $('#dataTable').append(footerHtml);

  // Initialize DataTable
  dataTableInstance = $('#dataTable').DataTable({
    data: data,
    columns: columns,
    pageLength: 25,
    responsive: true,
    dom: 'Bfrtip',
    buttons: ['copy', 'csv', 'excel'],
    footerCallback: function () {
      updateSummaryMetricsAndCharts(keys, cityIdx, bedsIdx, scholarIdx, wpIdx, coachingIdx, hydraIdx, totalSoldIdx);
    }
  });

  // Initialize Filters
  populateDropdown('#citySelect', cityIdx, data, keys, 'All Cities');
  populateDropdown('#microMarketSelect', microMarketIdx, data, keys, 'All Micro Markets');

  // Filter Handlers
  $('#citySelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    dataTableInstance.column(microMarketIdx).search('');
    $('#microMarketSelect').val('');
    dataTableInstance.column(cityIdx).search(val ? '^' + val + '$' : '', true, false).draw();
    
    // Update Micro Market options for selected City
    const visibleData = dataTableInstance.rows({ search: 'applied' }).data().toArray();
    populateDropdown('#microMarketSelect', microMarketIdx, visibleData, keys, 'All Micro Markets');
  });

  $('#microMarketSelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    dataTableInstance.column(microMarketIdx).search(val ? '^' + val + '$' : '', true, false).draw();
  });

  $('#resetFilters').on('click', function () {
    $('#citySelect').val('');
    $('#microMarketSelect').val('');
    dataTableInstance.columns().search('').draw();
    populateDropdown('#citySelect', cityIdx, data, keys, 'All Cities');
    populateDropdown('#microMarketSelect', microMarketIdx, data, keys, 'All Micro Markets');
  });
}

// Populate Dropdown helper
function populateDropdown(selectId, colIdx, rowData, keys, defaultLabel) {
  const values = [...new Set(rowData.map(r => r[keys[colIdx]]))].filter(Boolean).sort();
  const elem = $(selectId);
  const currentVal = elem.val();
  elem.html(`<option value="">${defaultLabel}</option>`);
  values.forEach(v => {
    elem.append(`<option value="${v}">${v}</option>`);
  });
  elem.val(currentVal);
}

// Dynamic KPI Cards, Footer Sums, and Chart Renderer
function updateSummaryMetricsAndCharts(keys, cityIdx, bedsIdx, scholarIdx, wpIdx, coachingIdx, hydraIdx, totalSoldIdx) {
  if (!dataTableInstance) return;

  const api = dataTableInstance;
  const visibleRows = api.rows({ search: 'applied' }).data().toArray();

  let totalBeds = 0;
  let totalSold = 0;
  let sumScholar = 0;
  let sumWP = 0;
  let sumCoaching = 0;
  let sumHydra = 0;

  const cityMap = {};

  visibleRows.forEach(row => {
    const beds = parseFloat(row[keys[bedsIdx]]) || 0;
    const sold = parseFloat(row[keys[totalSoldIdx]]) || 0;
    const scholar = parseFloat(row[keys[scholarIdx]]) || 0;
    const wp = parseFloat(row[keys[wpIdx]]) || 0;
    const coaching = parseFloat(row[keys[coachingIdx]]) || 0;
    const hydra = parseFloat(row[keys[hydraIdx]]) || 0;
    const city = row[keys[cityIdx]] || 'Unknown';

    totalBeds += beds;
    totalSold += sold;
    sumScholar += scholar;
    sumWP += wp;
    sumCoaching += coaching;
    sumHydra += hydra;

    cityMap[city] = (cityMap[city] || 0) + sold;
  });

  // 1. Update KPI Cards
  $('#kpiProperties').text(visibleRows.length);
  $('#kpiBeds').text(totalBeds.toLocaleString());
  $('#kpiSold').text(totalSold.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  const overallPct = totalBeds > 0 ? ((totalSold / totalBeds) * 100).toFixed(1) : 0;
  $('#kpiPct').text(overallPct + '%');

  // 2. Update Footer Sums for Columns I through N (Indices 8 to 13)
  for (let c = 8; c <= 13; c++) {
    const colSum = api.column(c, { page: 'current' }).data().reduce((a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0), 0);
    $(api.column(c).footer()).html(colSum.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  }

  // 3. Render / Update City Bar Chart
  const cityLabels = Object.keys(cityMap);
  const cityValues = Object.values(cityMap);

  if (cityChartInstance) cityChartInstance.destroy();
  const ctxCity = document.getElementById('cityChart').getContext('2d');
  cityChartInstance = new Chart(ctxCity, {
    type: 'bar',
    data: {
      labels: cityLabels,
      datasets: [{
        label: 'Beds Sold',
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

  // 4. Render / Update Channel Donut Chart
  if (channelChartInstance) channelChartInstance.destroy();
  const ctxChannel = document.getElementById('channelChart').getContext('2d');
  channelChartInstance = new Chart(ctxChannel, {
    type: 'doughnut',
    data: {
      labels: ['Scholar', 'WP', 'Coaching', 'Hydra'],
      datasets: [{
        data: [sumScholar, sumWP, sumCoaching, sumHydra],
        backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ec4899']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

document.addEventListener('DOMContentLoaded', loadData);