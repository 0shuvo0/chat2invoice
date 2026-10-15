// Tiny stand-in for Ollama's /api/chat used for local testing without a model.
import http from 'node:http';
const port = Number(process.env.PORT || 11435);
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url !== '/api/chat') { res.writeHead(404); return res.end('not found'); }
    const j = JSON.parse(body || '{}');
    const content = JSON.stringify({
      freelancer_name: 'Alex Morgan', freelancer_email: 'alex@designstudio.co', freelancer_company: '',
      client_name: 'Sarah Jenkins', client_email: 'sarah.jenkins@acmehealth.io', client_company: 'Acme Health Inc.',
      project_description: 'Brand identity refresh & UI design sprint (40 hours)', project_details: '40.0 hrs x $75.00/hr',
      project_deadline: 'not mentioned', amount: '$3,000', currency: 'usd', discount_amount: null, due_now: '',
      payment_instructions: '', tax_note: '', _images_received: (j.messages?.[0]?.images || []).length,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: j.model, message: { role: 'assistant', content }, done: true }));
  });
}).listen(port, () => console.log('mock ollama on', port));
