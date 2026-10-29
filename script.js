function loadData() {
  fetch('data.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(data => {
      if (data && data.length > 0) {
        renderTable(data);
      } else {
        document.getElementById('wrapper').innerText = 'Data file is empty.';
      }
    })
    .catch(err => {
      console.error('Error loading data:', err);
      document.getElementById('wrapper').innerText = 'Failed to load data.json.';
    });
}

function renderTable(data) {
  const columns = Object.keys(data[0]);
  const rows = data.map(row => Object.values(row));

  new gridjs.Grid({
    columns: columns,
    data: rows,
    search: true,
    sort: true,
    pagination: {
      limit: 10
    }
  }).render(document.getElementById('wrapper'));
}

document.addEventListener('DOMContentLoaded', loadData);