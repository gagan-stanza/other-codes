function loadData() {
  fetch('data.json')
    .then(response => response.json())
    .then(data => {
      if (data && data.length > 0) {
        renderTable(data);
      }
    })
    .catch(err => console.error('Error:', err));
}

function renderTable(data) {
  const keys = Object.keys(data[0]);
  
  // Format columns for DataTables
  const columns = keys.map(key => ({ title: key, data: key, defaultContent: "" }));

  // Add individual column search inputs in table header
  $('#dataTable').append('<thead><tr id="filterRow"></tr></thead>');
  keys.forEach(() => {
    $('#filterRow').append('<th><input type="text" placeholder="Filter..." /></th>');
  });

  const table = $('#dataTable').DataTable({
    data: data,
    columns: columns,
    pageLength: 25,
    orderCellsTop: true,
    fixedHeader: true,
    dom: 'Bfrtip',
    buttons: ['copy', 'csv', 'excel']
  });

  // Apply column filter on keyup
  $('#dataTable thead tr#filterRow th').each(function (index) {
    $('input', this).on('keyup change', function () {
      if (table.column(index).search() !== this.value) {
        table.column(index).search(this.value).draw();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', loadData);