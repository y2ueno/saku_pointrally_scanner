// --------------------------------------------------
// ★ ユーザー用スキャナー (ポイント獲得用) ★
// --------------------------------------------------
const serverUrl = 'https://saku-pointrally-proxy.vercel.app/api'; 
const redirectTimeout = 5000; // 5秒後に戻る

let userEmail = '';
let currentStoreId = ''; 
let isScanning = false; 
let html5QrCode = null; 

document.addEventListener('DOMContentLoaded', (event) => {
    console.log("DOM loaded (User)");
    const urlParams = new URLSearchParams(window.location.search);
    userEmail = urlParams.get('email');
    currentStoreId = urlParams.get('storeId');
    
    console.log(`User: ${userEmail}, Store: ${currentStoreId}`);

    // 必須パラメータチェック
    if (!userEmail || !currentStoreId) {
        displayResult('error', 'ユーザー情報または店舗情報が取得できませんでした。URLを確認してください。');
        return;
    }
    
    // ライブラリ読み込みチェック
    if (typeof Html5Qrcode === 'undefined') {
        displayResult('error', 'スキャナーの起動に失敗しました(Lib)。リロードしてください。');
        return;
    }

    // HTMLのID "qr-reader" と一致させる
    html5QrCode = new Html5Qrcode("qr-reader");
    startScanning();
});

function startScanning() {
    if (isScanning) return;
    isScanning = true; 
    displayResult('info', '店舗のQRコードを読み取ってください...'); 
    
    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        // 背面カメラを優先
        videoConstraints: { facingMode: "environment" }
    };
    
    Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length) { 
           let cameraId = devices[0].id;
           const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
           if (backCam) cameraId = backCam.id;
           
           html5QrCode.start(cameraId, config, (decodedText) => {
                if (isScanning) {
                    isScanning = false;
                    playScanSound();
                    html5QrCode.stop().then(() => {
                        sendScanData(decodedText);
                    }).catch(() => sendScanData(decodedText));
                }
           }, () => {})
           .catch(err => {
               displayResult('error', 'カメラの起動に失敗しました。権限を確認してください。');
               isScanning = false;
           });
        } else { 
            displayResult('error', 'カメラが見つかりません。');
            isScanning = false;
        }
    }).catch(err => {
        displayResult('error', 'カメラ情報の取得に失敗しました。');
        isScanning = false;
    });
}

function sendScanData(scannedQrData) {
    displayResult('loading', 'ポイント確認中...'); 
    
    // Vercel API (GAS) へ送信
    fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({
            // actionは指定なし（デフォルトでポイント獲得処理になる）
            userEmail: userEmail,
            scannedQrData: scannedQrData,
            storeId: currentStoreId 
        }),
    })
    .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
             throw new Error(data.message || `Server Error: ${response.status}`);
        }
        return data;
    })
    .then(data => {
        if (data.status === 'success') {
            displayResult('success', data.message);
        } else { 
            displayResult('error', data.message);
        }
        setTimeout(() => { 
            if(window.history.length > 1) window.history.back(); 
        }, redirectTimeout);
    })
    .catch((error) => {
        displayResult('error', error.message || '通信エラーが発生しました。');
        setTimeout(() => { 
            if(window.history.length > 1) window.history.back(); 
        }, redirectTimeout);
    });
}

function displayResult(type, message) { 
    const el = document.getElementById('qr-reader-results'); 
    if(!el) return;
    el.style.display = 'block'; 
    el.className = type; 
    el.innerHTML = message;
}

function playScanSound() { 
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.1);
}
