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
  // Extract keys dynamically from the first object
  const keys = Object.keys(data[0]);

  // Map keys directly to DataTables column definitions
  const columns = keys.map(key => ({
    title: key,
    data: key,
    defaultContent: ""
  }));

  // Initialize DataTables with zero modifications to data
  $('#dataTable').DataTable({
    data: data,
    columns: columns,
    pageLength: 25,
    responsive: true,
    dom: 'Bfrtip',
    buttons: ['copy', 'csv', 'excel']
  });
}

document.addEventListener('DOMContentLoaded', loadData);