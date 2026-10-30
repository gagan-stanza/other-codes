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
  
  // Format columns dynamically for DataTables
  const columns = keys.map(key => ({ title: key, data: key, defaultContent: "" }));

  // Column B key (index 1)
  const colBKey = keys[1];

  // 1. Populate top-left dropdown with unique values from Column B
  const uniqueValues = [...new Set(data.map(item => item[colBKey]))]
    .filter(val => val !== null && val !== undefined && val.toString().trim() !== '')
    .sort();

  const selectElem = document.getElementById('microMarketSelect');
  selectElem.innerHTML = '<option value="">All Property Names</option>';

  uniqueValues.forEach(val => {
    const option = document.createElement('option');
    option.value = val;
    option.textContent = val;
    selectElem.appendChild(option);
  });

  // 2. Add header search inputs row for DataTables
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

  // 4. Connect Top-Left Dropdown Filter to Column B (Index 1)
  $('#microMarketSelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    table.column(1).search(val ? '^' + val + '$' : '', true, false).draw();
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