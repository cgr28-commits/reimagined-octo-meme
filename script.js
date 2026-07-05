document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('quoteForm');
  const result = document.getElementById('quoteResult');
  if (!form || !result) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const message = [
      'Hi, I would like an airport transfer quote.',
      `Journey: ${data.get('journey') || ''}`,
      `Pickup: ${data.get('pickup') || ''}`,
      `Airport: ${data.get('airport') || ''}`,
      `Date: ${data.get('date') || ''}`,
      `Time: ${data.get('time') || ''}`,
      `Passengers: ${data.get('passengers') || ''}`,
      `Suitcases: ${data.get('cases') || ''}`
    ].join('\n');
    result.textContent = 'Opening WhatsApp quote request...';
    window.open(`https://wa.me/447549815538?text=${encodeURIComponent(message)}`, '_blank');
  });
});
