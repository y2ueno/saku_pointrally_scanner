// Vercel Serverless Function (Node.js)
// Path: /api/index.js

const fetch = require('node-fetch'); // node-fetch v2 を想定

// 環境変数からGASのURLを取得
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

module.exports = async (req, res) => {
  // --- CORS Preflight Request Handling ---
  // OPTIONSメソッドのリクエストは、実際のPOSTリクエストの前にブラウザが送信する
  // これに応答して、どのオリジンからのリクエストを許可するかなどを伝える
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'YOUR_GITHUB_PAGES_DOMAIN_HERE'); // ★★★ 下で変更します ★★★
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.status(204).end(); // No Content
    return;
  }

  // --- Allow only POST requests ---
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  // --- Set CORS header for the actual POST response ---
  res.setHeader('Access-Control-Allow-Origin', 'YOUR_GITHUB_PAGES_DOMAIN_HERE'); // ★★★ 下で変更します ★★★

  // --- Validate APPS_SCRIPT_URL ---
  if (!APPS_SCRIPT_URL) {
    console.error('Environment variable APPS_SCRIPT_URL is not set.');
    res.status(500).json({ status: 'error', message: 'Server configuration error: GAS URL not found.' });
    return;
  }

  try {
    // --- Forward the request body to Google Apps Script ---
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body), // Vercelが自動でパースしてくれる
      redirect: 'follow' // GASはリダイレクトすることがあるため必要
    });

    // --- Handle GAS Response ---
    if (!response.ok) {
      // GAS returned an error (e.g., script error, permission issue)
      const errorText = await response.text();
      console.error(`GAS Error (${response.status}): ${errorText}`);
      // GASからのエラーメッセージをそのまま返すか、汎用的なメッセージにするか選択
      // 詳細なエラーをクライアントに返さない方が安全な場合もある
      try {
          const gasError = JSON.parse(errorText);
          res.status(response.status).json(gasError); // GASがJSONエラーを返した場合
      } catch (parseError){
           res.status(500).json({ status: 'error', message: 'Failed to process response from backend service.'});
      }
      return;
    }

    // --- Relay the successful GAS JSON response back to the client ---
    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    // --- Handle Network or other unexpected errors ---
    console.error('Proxy Error:', error);
    res.status(500).json({ status: 'error', message: 'Proxy server error: ' + error.message });
  }
};
