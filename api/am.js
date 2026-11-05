const BASE_URL = 'https://am.noxxyrorr.biz.id';

/**
 * Kirim Magic Link ke email
 */
export async function amSendLink(email) {
  if (!email) throw new Error('Email tidak boleh kosong!');
  
  const response = await fetch(`${BASE_URL}/api/send-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() })
  });
  
  const result = await response.json();
  if (result.success === false) throw new Error(result.message || 'Gagal mengirim link');
  return result;
}

/**
 * Verifikasi Magic Link dari inbox
 */
export async function amVerifyLink(email, link, customOrderId = '') {
  if (!email || !link) throw new Error('Email dan Link wajib diisi!');

  const payload = { 
    email: email.trim().toLowerCase(), 
    link: link.trim() 
  };
  
  if (customOrderId) payload.customOrderId = customOrderId.trim().toUpperCase();

  const response = await fetch(`${BASE_URL}/api/verify-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (result.ok === false || result.success === false) {
    throw new Error(result.error || result.message || 'Verifikasi gagal');
  }
  return result;
}

/**
 * Generate Akun Instan (Direct)
 */
export async function amGenerate(customOrderId = '') {
  const payload = customOrderId ? { customOrderId: customOrderId.trim().toUpperCase() } : {};

  const response = await fetch(`${BASE_URL}/api/am/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  const data = result.data || result;
  
  if (data.ok === false || data.success === false) {
    throw new Error(data.error || data.message || 'Generate gagal');
  }
  return data;
}
