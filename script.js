function loadData() {
  fetch('data.json')
    .then(response => response.json())
    .then(data => {
      if (data && data.length > 0) {
        renderTable(data);
      }
    })
    .catch(err => console.error('Error loading data:', err));
}

function renderTable(data) {
  const keys = Object.keys(data[0]);
  const columns = keys.map(key => ({
    title: key,
    data: key,
    defaultContent: ""
  }));

  const microMarketIdx = 1; // Column B
  const cityIdx = 2;        // Column C

  // Initialize DataTable
  const table = $('#dataTable').DataTable({
    data: data,
    columns: columns,
    pageLength: 25,
    responsive: true,
    dom: 'Bfrtip',
    buttons: ['copy', 'csv', 'excel']
  });

  // Dynamic dropdown updater function for nested behavior
  function updateDropdowns() {
    const selectedMarket = $('#microMarketSelect').val();
    const selectedCity = $('#citySelect').val();

    // Get current visible filtered rows
    const visibleData = table.rows({ search: 'applied' }).data().toArray();

    // Extract unique values from visible rows
    const validMarkets = [...new Set(visibleData.map(row => row[keys[microMarketIdx]]))].filter(Boolean).sort();
    const validCities = [...new Set(visibleData.map(row => row[keys[cityIdx]]))].filter(Boolean).sort();

    // 1. Refresh Micro Market options (unless user is actively selecting it)
    if (!selectedMarket) {
      const marketSelect = $('#microMarketSelect');
      marketSelect.html('<option value="">All Micro Markets</option>');
      validMarkets.forEach(m => {
        marketSelect.append(`<option value="${m}">${m}</option>`);
      });
    }

    // 2. Refresh City options (unless user is actively selecting it)
    if (!selectedCity) {
      const citySelect = $('#citySelect');
      citySelect.html('<option value="">All Cities</option>');
      validCities.forEach(c => {
        citySelect.append(`<option value="${c}">${c}</option>`);
      });
    }
  }

  // Initial population of options
  updateDropdowns();

  // Event handler for Micro Market Selection
  $('#microMarketSelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    table.column(microMarketIdx).search(val ? '^' + val + '$' : '', true, false).draw();
    updateDropdowns();
  });

  // Event handler for City Selection
  $('#citySelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    table.column(cityIdx).search(val ? '^' + val + '$' : '', true, false).draw();
    updateDropdowns();
  });
}

document.addEventListener('DOMContentLoaded', loadData);