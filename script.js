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
  const columns = keys.map(key => ({ title: key, data: key, defaultContent: "" }));

  const microMarketIdx = 1; // Column B (Micro Market)
  const cityIdx = 2;        // Column C (City)

  // 1. Populate City Dropdown (Column C)
  const uniqueCities = [...new Set(data.map(item => item[keys[cityIdx]]))].filter(Boolean).sort();
  const citySelect = document.getElementById('citySelect');
  uniqueCities.forEach(city => {
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = city;
    citySelect.appendChild(opt);
  });

  // 2. Populate Micro Market Dropdown (Column B)
  const uniqueMarkets = [...new Set(data.map(item => item[keys[microMarketIdx]]))].filter(Boolean).sort();
  const marketSelect = document.getElementById('microMarketSelect');
  uniqueMarkets.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    marketSelect.appendChild(opt);
  });

  // 3. Setup Table Header Filters
  $('#dataTable').append('<thead><tr id="filterRow"></tr></thead>');
  keys.forEach(() => {
    $('#filterRow').append('<th><input type="text" placeholder="Filter..." /></th>');
  });

  // 4. Setup Table Footer for Totals
  let footerHtml = '<tfoot><tr>';
  keys.forEach((key, idx) => {
    footerHtml += idx === 0 ? '<td><strong>Total</strong></td>' : '<td></td>';
  });
  footerHtml += '</tr></tfoot>';
  $('#dataTable').append(footerHtml);

  // 5. Initialize DataTable with Footer Sum Callback
  const table = $('#dataTable').DataTable({
    data: data,
    columns: columns,
    pageLength: 25,
    orderCellsTop: true,
    fixedHeader: true,
    dom: 'Bfrtip',
    buttons: ['copy', 'csv', 'excel'],
    footerCallback: function (row, data, start, end, display) {
      const api = this.api();

      // Sum columns I to N (Indices 8 to 13)
      const sumColumns = [8, 9, 10, 11, 12, 13];

      sumColumns.forEach(colIdx => {
        const total = api
          .column(colIdx, { page: 'current' })
          .data()
          .reduce((a, b) => {
            const valA = parseFloat(a) || 0;
            const valB = parseFloat(b) || 0;
            return valA + valB;
          }, 0);

        $(api.column(colIdx).footer()).html(
          total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })
        );
      });
    }
  });

  // 6. Connect City Filter
  $('#citySelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    table.column(cityIdx).search(val ? '^' + val + '$' : '', true, false).draw();
  });

  // 7. Connect Micro Market Filter
  $('#microMarketSelect').on('change', function () {
    const val = $.fn.dataTable.util.escapeRegex($(this).val());
    table.column(microMarketIdx).search(val ? '^' + val + '$' : '', true, false).draw();
  });

  // 8. Connect individual column search inputs
  $('#dataTable thead tr#filterRow th').each(function (index) {
    $('input', this).on('keyup change', function () {
      if (table.column(index).search() !== this.value) {
        table.column(index).search(this.value).draw();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', loadData);