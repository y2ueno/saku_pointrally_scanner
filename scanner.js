// --------------------------------------------------
// 設定項目
// --------------------------------------------------
const serverUrl = 'YOUR_VERCEL_API_URL_HERE'; // ★★★ 第5章で変更します ★★★ 
const redirectTimeout = 5000; // 5秒

// --------------------------------------------------
// グローバル変数
// --------------------------------------------------
let userEmail = '';
let currentStoreId = ''; // ★ Glideで開いている店舗のIDを保持
let isScanning = false; 
let html5QrCode = null; 

// --------------------------------------------------
// 初期化処理
// --------------------------------------------------
document.addEventListener('DOMContentLoaded', (event) => {
    console.log("DOM fully loaded");
    const urlParams = new URLSearchParams(window.location.search);
    userEmail = urlParams.get('email');
    currentStoreId = urlParams.get('storeId'); // ★ storeIdも取得
    console.log(`Email: ${userEmail}, StoreID: ${currentStoreId}`); 

    // Email または StoreID がない場合はエラー
    if (!userEmail || !validateEmail(userEmail) || !currentStoreId) { // ★ storeIdもチェック
        displayResult('error', 'ユーザー情報または店舗情報が取得できませんでした。');
        isScanning = false; 
        return;
    }

    if (typeof Html5Qrcode === 'undefined') {
        console.error("Html5Qrcode library is not loaded!");
        displayResult('error', 'QRリーダーの読み込み失敗。再読み込みしてください。');
        return;
    }
    html5QrCode = new Html5Qrcode("qr-reader");
    startScanning();
});

/** Email形式検証 */
function validateEmail(email) { /* ... (変更なし) ... */ 
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/; 
  return re.test(String(email).trim()); 
}

// --------------------------------------------------
// スキャン開始処理 (変更なし)
// --------------------------------------------------
function startScanning() {
    if (isScanning || !html5QrCode) { /* ... */ return; }
    isScanning = true; 
    console.log("Attempting to start scanning...");
    displayResult('info', 'QRコードを読み取ってください...'); 
    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
        if (isScanning) {
            isScanning = false; 
            console.log(`QR Scanned: ${decodedText}`);
            playScanSound(); 
            stopScanning().then(() => {
                sendScanData(decodedText); 
            }).catch(err => {
                console.error("Stop scanner error:", err);
                sendScanData(decodedText); 
            });
        } else { /* ... */ }
    };
    const config = { /* ... (変更なし) ... */ 
        fps: 10, 
        qrbox: (w, h) => ({ width: Math.floor(Math.min(w, h) * 0.7), height: Math.floor(Math.min(w, h) * 0.7) }),
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA], 
        rememberLastUsedCamera: true 
    };
    Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length) { /* ... (カメラ選択ロジック - 変更なし) ... */ 
           let cameraId = devices[0].id;
           const backCam = devices.find(d => d.label.toLowerCase().includes('back'));
           if (backCam) cameraId = backCam.id;
           html5QrCode.start(cameraId, config, qrCodeSuccessCallback, () => {})
            .then(() => console.log("Scanning started."))
            .catch((err) => { /* ... エラー処理 ... */ });
        } else { /* ... エラー処理 ... */ }
    }).catch(err => { /* ... エラー処理 ... */ });
}

// --------------------------------------------------
// スキャナー停止処理 (変更なし)
// --------------------------------------------------
function stopScanning() { /* ... (変更なし - Promiseで返す) ... */ 
    console.log("Attempting to stop scanning...");
    return new Promise((resolve) => { // rejectは不要に
        if (html5QrCode && typeof html5QrCode.getState === 'function' && html5QrCode.getState() === Html5QrcodeScannerState.SCANNING) {
             html5QrCode.stop()
                .then(() => { console.log("Scanner stopped."); resolve(); })
                .catch((err) => { console.error("Failed to stop scanner:", err); resolve(); }); // エラーでもresolve
        } else {
            console.log("Scanner not running or not initialized.");
            resolve(); 
        }
    });
}

// --------------------------------------------------
// スキャンデータのサーバー送信 (★★★ storeId を追加) ★★★
// --------------------------------------------------
function sendScanData(scannedData) {
    displayResult('loading', 'サーバーと通信中...'); 
    console.log(`Sending data: Email=${userEmail}, QR=${scannedData}, StoreID=${currentStoreId}`); // ★ storeIdログ追加

    fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({
            userEmail: userEmail,
            scannedQrData: scannedData,
            storeId: currentStoreId // ★ storeId を送信データに追加
        }),
        mode: 'cors' 
    })
    .then(async response => { /* (エラーハンドリング強化版 - 変更なし) */ 
        console.log(`Server response status: ${response.status}`);
        const contentType = response.headers.get("content-type");
        let responseBody; try { responseBody = await response.text(); console.log('Raw response:', responseBody); } catch (e) { throw new Error(`サーバー応答読取失敗 (${response.status})`); }
        if (!response.ok) { let msg = `サーバーエラー (${response.status})`; if (contentType?.includes("json") && responseBody){ try { msg = JSON.parse(responseBody).message || responseBody; } catch(e){} } else if(responseBody){ msg = `サーバー問題発生 (${response.status})`;} console.error("Server error:", msg); throw new Error(msg); }
        if (contentType?.includes("json") && responseBody) { try { return JSON.parse(responseBody); } catch (e) { throw new Error('サーバー応答形式不正(JSON)'); } } 
        else { throw new Error('サーバー応答形式不正(非JSON)'); }
    })
    .then(data => {
        console.log('Parsed data:', data);
        if (data.status === 'success') {
            displayResult('success', data.message);
            redirectToOrigin(data.message); 
        } else { 
            displayResult('error', data.message || '不明なエラー');
            redirectToOrigin(data.message || '不明なエラー'); 
        }
    })
    .catch((error) => {
        console.error('Fetch error:', error);
        let msg = '通信エラー'; if (error instanceof TypeError) { msg = 'サーバー接続不可'; } else { msg = error.message || msg; }
        displayResult('error', msg);
        redirectToOrigin(msg); 
    });
}

// --------------------------------------------------
// 結果表示の制御 (変更なし)
// --------------------------------------------------
function displayResult(type, message) { /* ... (変更なし - アイコンとメッセージ表示) ... */ 
    const resultsDiv = document.getElementById('qr-reader-results'); if (!resultsDiv) return; 
    resultsDiv.style.display = 'block'; resultsDiv.className = ''; resultsDiv.classList.add('qr-reader-results'); 
    let iconHtml = '';
    if (type === 'success') { resultsDiv.classList.add('success'); iconHtml = '<i class="fas fa-check-circle icon"></i> '; } 
    else if (type === 'error') { resultsDiv.classList.add('error'); iconHtml = '<i class="fas fa-times-circle icon"></i> '; } 
    else if (type === 'loading') { iconHtml = '<i class="fas fa-spinner fa-spin icon"></i> '; }
    resultsDiv.innerHTML = iconHtml + (message || ''); 
    console.log(`Displayed: ${type} - ${message}`);
}

// --------------------------------------------------
// 戻り先関数 (変更なし - ブラウザ履歴で戻る)
// --------------------------------------------------
function redirectToOrigin(resultMessage = '') { /* ... (変更なし - history.back()) ... */ 
     setTimeout(() => {
        console.log("Attempting history back...");
        try { if (window.history && window.history.length > 1) { window.history.back(); } 
              else { console.warn("No history."); displayManualReturnMessage(); }
        } catch (e) { console.error("History back error:", e); displayManualReturnMessage(); }
    }, redirectTimeout);
}
function displayManualReturnMessage() { /* ... (変更なし - 手動メッセージ表示) ... */ 
    const resultsDiv = document.getElementById('qr-reader-results');
    const msg = '<br><small>(自動で戻れません。手動で戻ってください)</small>';
    if (resultsDiv && resultsDiv.style.display !== 'none' && !resultsDiv.innerHTML.includes('手動で')) { resultsDiv.innerHTML += msg; }
}

// --------------------------------------------------
// スキャン成功音 (変更なし - 安定版)
// --------------------------------------------------
function playScanSound() { /* ... (変更なし - AudioContext) ... */ 
  const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) return;
  let ctx = null; try { ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime); 
    g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1); 
    o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.1); 
    o.onended = () => { if (ctx && ctx.state !== 'closed') ctx.close().catch(e => {}); };
    setTimeout(() => { if (ctx && ctx.state !== 'closed') ctx.close().catch(e => {}); }, 500); 
  } catch (e) { console.warn("Scan sound error:", e); if (ctx && ctx.state !== 'closed') ctx.close().catch(e => {}); }
}
