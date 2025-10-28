// Vercel Serverless Function (Node.js)
// Path: /api/index.js

const fetch = require('node-fetch'); 
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

module.exports = async (req, res) => {
  // --- CORS Preflight (OPTIONS) ---
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'https://y2ueno.github.io'); // ★★★ 下で変更 ★★★
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400'); 
    console.log('Responding to OPTIONS request from origin:', req.headers.origin);
    res.status(204).end(); 
    return;
  }

  // --- Method Check (POST only) ---
  if (req.method !== 'POST') {
    console.log(`Method Not Allowed: ${req.method}`);
    res.setHeader('Access-Control-Allow-Origin', 'https://y2ueno.github.io'); // ★★★ 下で変更 ★★★
    res.setHeader('Content-Type', 'application/json');
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  // --- CORS for POST ---
  const requestOrigin = req.headers.origin;
  const allowedOrigin = 'YOUR_GITHUB_PAGES_BASE_URL_HERE'; // ★★★ 下で変更 ★★★
  // オリジンチェック (本番では厳密に)
  // if (requestOrigin === allowedOrigin || !requestOrigin) { // 同一オリジン or 直接アクセス
     res.setHeader('Access-Control-Allow-Origin', allowedOrigin); 
  // } else { /* 拒否 or 警告 */ }
  res.setHeader('Content-Type', 'application/json');

  // --- Check GAS URL ---
  if (!APPS_SCRIPT_URL) {
    console.error('APPS_SCRIPT_URL not set.');
    res.status(500).json({ status: 'error', message: 'Server config error: GAS URL missing.' });
    return;
  }

  try {
    // --- Forward Request to GAS ---
    console.log('Forwarding to GAS:', APPS_SCRIPT_URL);
    console.log('Request body:', req.body); 

    // Body validation
    if (!req.body || typeof req.body !== 'object' || typeof req.body.userEmail !== 'string' || typeof req.body.scannedQrData !== 'string' || typeof req.body.storeId !== 'string') { // ★ storeIdもチェック
         console.error('Invalid body structure/types:', req.body);
         res.status(400).json({ status: 'error', message: 'Invalid request: Expecting JSON with string userEmail, scannedQrData, and storeId.' });
         return;
    }

    // Fetch GAS
    const gasResponse = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body), // req.body をそのままGASへ
      redirect: 'follow',
      // timeout: 15000 
    });
    console.log(`GAS status: ${gasResponse.status}`);

    // --- Process GAS Response ---
    const responseBody = await gasResponse.text(); 
    console.log('Raw GAS response:', responseBody);

    const gasContentType = gasResponse.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', gasContentType); 
    res.status(gasResponse.status); 
    res.send(responseBody); // Relay response body
    console.log('Response relayed to client.');

  } catch (error) {
    // --- Error Handling ---
    console.error('Proxy Error:', error.name, error.message, error.stack);
    if (!res.headersSent) {
       let errorMessage = 'Proxy server error.';
       if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) { errorMessage = 'Backend timeout.'; } 
       else if (error.name === 'FetchError') { errorMessage = 'Backend connection failed.'; }
       res.status(500).json({ status: 'error', message: errorMessage });
    } else {
       console.error("Headers sent, cannot send error JSON.");
       res.end(); 
    }
  }
};
