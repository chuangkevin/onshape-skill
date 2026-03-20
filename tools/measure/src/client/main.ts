async function init() {
  const res = await fetch('/api/health');
  const data = await res.json();
  const app = document.getElementById('app')!;
  app.innerHTML = `<h1>Photo Measure</h1><p>Server: ${data.status} at ${data.timestamp}</p>`;
}

init();
