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

  // Function to refresh available options for a target dropdown based on currently visible data
  function updateDropdownOptions(targetId, colIdx, defaultText) {
    const visibleData = table.rows({ search: 'applied' }).data().toArray();
    const validValues = [...new Set(visibleData.map(row => row[keys[colIdx]]))].filter(Boolean).sort();
    
    const selectElem = $(targetId);
    selectElem.html(`<option value="">${defaultText}</option>`);
    validValues.forEach(val => {
      selectElem.append(`<option value="${val}">${val}</option>`);
    });
  }

  // Initial population of both dropdowns
  updateDropdownOptions('#citySelect', cityIdx, 'All Cities');
  updateDropdownOptions('#microMarketSelect', microMarketIdx, 'All Micro Markets');

  // Event handler for City Selection (First filter)
  $('#citySelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    
    // 1. Reset Micro Market search filter and dropdown selection
    table.column(microMarketIdx).search('');
    $('#microMarketSelect').val('');

    // 2. Apply City search filter
    table.column(cityIdx).search(val ? '^' + val + '$' : '', true, false).draw();

    // 3. Re-populate Micro Market dropdown with valid options for the chosen City
    updateDropdownOptions('#microMarketSelect', microMarketIdx, 'All Micro Markets');
  });

  // Event handler for Micro Market Selection (Second filter)
  $('#microMarketSelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    
    // Apply Micro Market search filter
    table.column(microMarketIdx).search(val ? '^' + val + '$' : '', true, false).draw();
  });
}

document.addEventListener('DOMContentLoaded', loadData);