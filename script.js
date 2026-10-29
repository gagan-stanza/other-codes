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
  
  // Format columns for DataTables
  const columns = keys.map(key => ({ title: key, data: key, defaultContent: "" }));

  // Identify Column C key (3rd column index = 2)
  const microMarketKey = keys[2] || 'Micro Market';

  // 1. Populate Dropdown with unique values from Column C
  const uniqueMarkets = [...new Set(data.map(item => item[microMarketKey]))]
    .filter(val => val !== null && val !== undefined && val.toString().trim() !== '')
    .sort();

  const selectElem = document.getElementById('microMarketSelect');
  uniqueMarkets.forEach(market => {
    const option = document.createElement('option');
    option.value = market;
    option.textContent = market;
    selectElem.appendChild(option);
  });

  // 2. Add header search inputs row
  $('#dataTable').append('<thead><tr id="filterRow"></tr></thead>');
  keys.forEach(() => {
    $('#filterRow').append('<th><input type="text" placeholder="Filter..." /></th>');
  });

  // 3. Initialize DataTable
  const table = $('#dataTable').DataTable({
    data: data,
    columns: columns,
    pageLength: 25,
    orderCellsTop: true,
    fixedHeader: true,
    dom: 'Bfrtip',
    buttons: ['copy', 'csv', 'excel']
  });

  // 4. Connect Dropdown Filter to Column C (Exact Regex Match)
  $('#microMarketSelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    // Filter index 2 (Column C) with exact regex matching
    table.column(2).search(val ? '^' + val + '$' : '', true, false).draw();
  });

  // 5. Connect individual header search inputs
  $('#dataTable thead tr#filterRow th').each(function (index) {
    $('input', this).on('keyup change', function () {
      if (table.column(index).search() !== this.value) {
        table.column(index).search(this.value).draw();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', loadData);