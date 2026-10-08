// Apoie o Bup (R$ 7,08) via Pix do Mercado Pago.
// POST {name} -> cria o Pix e devolve { id, qr, qrBase64 } | GET ?id=123 -> { status }
// Variável na Vercel: MP_ACCESS_TOKEN (Mercado Pago > Seu negócio > Configurações > Credenciais).
const c = require('crypto');
const VALOR = 7.08, MP = 'https://api.mercadopago.com/v1/payments';
const tries = new Map();
const body = (req) => { let b = req.body; try { if (typeof b === 'string') b = JSON.parse(b || '{}'); } catch { b = {}; } return b || {}; };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: 'Configure MP_ACCESS_TOKEN na Vercel.' });
  const auth = { Authorization: 'Bearer ' + token };
  try {
    if (req.method === 'GET') {
      const id = String(req.query.id || '').replace(/\D/g, '');
      if (!id) return res.status(400).json({ error: 'id inválido' });
      const r = await fetch(MP + '/' + id, { headers: auth });
      const p = await r.json();
      if (!r.ok || !String(p.external_reference || '').startsWith('bup-apoie')) return res.status(404).json({ error: 'não encontrado' });
      return res.status(200).json({ status: p.status, name: (p.metadata && p.metadata.name) || '' });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x', now = Date.now();
    const recent = (tries.get(ip) || []).filter((t) => now - t < 600000);
    if (recent.length >= 8) return res.status(429).json({ error: 'Muitas tentativas. Espere alguns minutos.' });
    recent.push(now); tries.set(ip, recent);

    const name = String(body(req).name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (name.length < 2) return res.status(400).json({ error: 'Digite seu nome (mínimo 2 letras).' });
    const exp = new Date(now + 30 * 60000 - 3 * 3600000).toISOString().replace('Z', '-03:00');
    const r = await fetch(MP, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json', 'X-Idempotency-Key': c.randomUUID() },
      body: JSON.stringify({
        transaction_amount: VALOR,
        description: 'Apoio ao novo site do Bup - ' + name,
        payment_method_id: 'pix',
        date_of_expiration: exp,
        external_reference: 'bup-apoie-' + c.randomBytes(4).toString('hex'),
        metadata: { name },
        payer: { email: process.env.MP_PAYER_EMAIL || 'apoiador@bup.app', first_name: name.split(' ')[0] },
      }),
    });
    const p = await r.json();
    const t = p.point_of_interaction && p.point_of_interaction.transaction_data;
    if (!r.ok || !t) { console.error('MP', r.status, JSON.stringify(p).slice(0, 400)); return res.status(502).json({ error: 'Não foi possível gerar o Pix agora. Tente de novo.' }); }
    return res.status(200).json({ id: p.id, qr: t.qr_code, qrBase64: t.qr_code_base64 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro no servidor. Tente de novo.' });
  }
};
