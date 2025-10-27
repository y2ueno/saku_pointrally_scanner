// --------------------------------------------------
// 設定項目
// --------------------------------------------------
// Vercel APIのエンドポイントURL (環境に合わせて変更)
const serverUrl = 'https://saku-pointrally-proxy.vercel.app/'; // ★★★ 第5章で変更します ★★★ 

// スキャン成功/エラーメッセージ表示後の自動リダイレクト時間（ミリ秒）
const redirectTimeout = 5000; // 5秒

// --------------------------------------------------
// グローバル変数
// --------------------------------------------------
let userEmail = '';
// let glideAppUrl = ''; // ★ glide_app_urlパラメータは使わないのでコメントアウト
let isScanning = true; // スキャン中フラグ (スキャン開始時にtrue)
let html5QrCode = null; // QRコードリーダーのインスタンス

// --------------------------------------------------
// 初期化処理: DOM読み込み完了後に実行
// --------------------------------------------------
document.addEventListener('DOMContentLoaded', (event) => {
    console.log("DOM fully loaded and parsed");
    // URLパラメータからユーザーEmailを取得 (glide_app_urlは不要)
    const urlParams = new URLSearchParams(window.location.search);
    userEmail = urlParams.get('email');
    // glideAppUrl = urlParams.get('glide_app_url'); // ★ コメントアウト
    console.log(`Email: ${userEmail}`); // ★ Glide URLのログ削除

    // Emailがない場合はエラー表示して終了
    if (!userEmail) {
        displayResult('error', 'ユーザー情報が取得できませんでした。');
        isScanning = false; // スキャンは開始しない
        return;
    }

    // QRコードリーダーのインスタンスを作成
    html5QrCode = new Html5Qrcode("qr-reader");

    // QRコードリーダーの初期化とスキャン開始
    startScanning();
});

// --------------------------------------------------
// QRコードリーダーのスキャン開始処理 (変更なし)
// --------------------------------------------------
function startScanning() {
    isScanning = true; 
    console.log("Starting QR Code scanning...");
    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
        if (isScanning) {
            isScanning = false; 
            console.log(`Code scanned = ${decodedText}`, decodedResult);
            playScanSound(); 
            stopScanning().then(() => {
                sendScanData(decodedText);
            }).catch(err => {
                console.error("Error stopping scanner, but proceeding to send data:", err);
                sendScanData(decodedText);
            });
        } else {
            console.log("Scan detected but already processing another scan.");
        }
    };
    const config = { 
        fps: 10, 
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            let qrboxSize = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.8);
            return { width: qrboxSize, height: qrboxSize };
        },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA] 
    };
    Html5Qrcode.getCameras().then(devices => {
        console.log("Available cameras:", devices);
        if (devices && devices.length) {
            let cameraId;
            const backCamera = devices.find(device => device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('arrière') || device.label.toLowerCase().includes('environment'));
            if (backCamera) {
                cameraId = backCamera.id;
                console.log("Using back camera:", backCamera.label);
            } else {
                cameraId = devices[0].id; 
                console.log("Using default camera:", devices[0].label);
            }
            html5QrCode.start(
                cameraId, config, qrCodeSuccessCallback, (errorMessage) => {/* ignore */})
            .catch((err) => {
                console.error(`Unable to start scanning, error: ${err}`);
                displayResult('error', 'カメラの起動に失敗しました。カメラへのアクセスを許可してください。ページを再読み込みしてください。');
                isScanning = false; 
            });
        } else {
            console.error('No cameras found.');
            displayResult('error', '利用可能なカメラが見つかりませんでした。');
            isScanning = false; 
        }
    }).catch(err => {
        console.error("Error getting cameras", err);
        displayResult('error', 'カメラ情報の取得に失敗しました。');
        isScanning = false; 
    });
}

// --------------------------------------------------
// スキャナー停止処理 (変更なし)
// --------------------------------------------------
function stopScanning() {
    return new Promise((resolve, reject) => {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop()
                .then(() => { console.log("QR Code scanning stopped successfully."); resolve(); })
                .catch((err) => { console.error("Failed to stop QR Code scanning.", err); reject(err); });
        } else {
            console.log("Scanner already stopped or not initialized.");
            resolve(); 
        }
    });
}

// --------------------------------------------------
// スキャンデータのサーバー送信 (変更なし)
// --------------------------------------------------
function sendScanData(scannedData) {
    displayResult('loading', 'サーバーと通信中...'); 
    console.log(`Sending data to server: ${serverUrl}, Email: ${userEmail}, QR: ${scannedData}`);
    fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ userEmail: userEmail, scannedQrData: scannedData }),
        mode: 'cors' 
    })
    .then(response => { /* (エラーハンドリングは省略 - 前回と同じ) */ 
         console.log(`Server response status: ${response.status}`);
         const contentType = response.headers.get("content-type");
         if (!response.ok) {
             if (contentType && contentType.indexOf("application/json") !== -1) {
                  return response.json().then(errData => {
                     const message = errData ? (errData.message || JSON.stringify(errData)) : `サーバーエラー (${response.status})`;
                     console.error("Server returned JSON error:", message); throw new Error(message); });
             } else {
                 return response.text().then(text => {
                     console.error("Server returned non-JSON error:", text); throw new Error(`サーバーエラー (${response.status}): ${text.substring(0, 100)}`); });
             }
         }
         if (contentType && contentType.indexOf("application/json") !== -1) { return response.json(); } 
         else { return response.text().then(text => {
                 console.error("Server returned non-JSON success response:", text); throw new Error('サーバーから予期しない形式の応答がありました。'); }); }
    })
    .then(data => {
        console.log('Server response data:', data);
        if (data.status === 'success') {
            displayResult('success', data.message);
            redirectToOrigin(); // ★ 戻り先関数を変更
        } else {
            displayResult('error', data.message || '不明なエラーが発生しました。');
            redirectToOrigin(); // ★ 戻り先関数を変更
        }
    })
    .catch((error) => {
        console.error('Fetch error:', error);
        let displayMessage = '通信エラーが発生しました。';
        if (error.message.includes('Failed to fetch')) { displayMessage = 'サーバーに接続できませんでした。ネットワークを確認してください。'; } 
        else if (error.message.startsWith('サーバーエラー')) { displayMessage = error.message; } 
        else { displayMessage = `エラー: ${error.message}`; }
        displayResult('error', displayMessage);
        redirectToOrigin(); // ★ 戻り先関数を変更
    });
}

// --------------------------------------------------
// 結果表示の制御 (変更なし)
// --------------------------------------------------
function displayResult(type, message) {
    const resultsDiv = document.getElementById('qr-reader-results');
    if (!resultsDiv) return; 
    resultsDiv.style.display = 'block'; 
    resultsDiv.className = ''; 
    resultsDiv.classList.add('qr-reader-results'); 
    let iconHtml = '';
    if (type === 'success') { resultsDiv.classList.add('success'); iconHtml = '<i class="fas fa-check-circle icon"></i>'; } 
    else if (type === 'error') { resultsDiv.classList.add('error'); iconHtml = '<i class="fas fa-times-circle icon"></i>'; } 
    else if (type === 'loading') { iconHtml = '<i class="fas fa-spinner fa-spin icon"></i>'; }
    resultsDiv.innerHTML = iconHtml + (message || ''); 
    console.log(`Displayed Result: Type=${type}, Message=${message}`);
}

// --------------------------------------------------
// ★★★ 戻り先関数 (Glideではなくブラウザ履歴で戻る) ★★★
// --------------------------------------------------
function redirectToOrigin() {
    // メッセージ表示が完了するのを待ってからリダイレクト
    setTimeout(() => {
        console.log("Attempting to go back in history...");
        // Glideアプリ内でWebViewが開かれている場合、history.back()で戻れることが多い
        if (window.history.length > 1) {
            window.history.back();
        } else {
            // 履歴がない場合 (直接URLを開いた場合など) は、ページを閉じるか別の動作
            console.warn("No history to go back to. Cannot return to Glide automatically.");
            // window.close(); // タブを閉じる (ブラウザによっては動作しない)
            displayResult('error', (document.getElementById('qr-reader-results')?.innerHTML || '') + '<br><small>(自動でアプリに戻れません。手動で戻ってください)</small>');
        }
    }, redirectTimeout); // redirectTimeoutミリ秒後に実行
}

// --------------------------------------------------
// スキャン成功音 (変更なし)
// --------------------------------------------------
function playScanSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (!audioContext) { console.warn("AudioContext not supported."); return; }
    const oscillator = audioContext.createOscillator(); const gainNode = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(880, audioContext.currentTime); 
    gainNode.gain.setValueAtTime(0, audioContext.currentTime); gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.01); gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.1); 
    oscillator.connect(gainNode); gainNode.connect(audioContext.destination);
    oscillator.start(audioContext.currentTime); oscillator.stop(audioContext.currentTime + 0.1); 
    setTimeout(() => { if (audioContext.state !== 'closed') { audioContext.close(); } }, 500); 
  } catch (e) { console.warn("Could not play scan sound:", e); }
}
