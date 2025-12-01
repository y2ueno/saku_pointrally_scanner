// --------------------------------------------------
// ★ ユーザー用スキャナー (スマホ対応・安定版) ★
// --------------------------------------------------
const serverUrl = 'https://saku-pointrally-proxy.vercel.app/api'; 
const redirectTimeout = 5000; // 5秒後に戻る

let userEmail = '';
let currentStoreId = ''; 
let isScanning = false; 
let html5QrCode = null; 

document.addEventListener('DOMContentLoaded', (event) => {
    console.log("DOM loaded (User)");
    
    // 1. URLパラメータ取得
    const urlParams = new URLSearchParams(window.location.search);
    userEmail = urlParams.get('email');
    currentStoreId = urlParams.get('storeId');
    
    console.log(`User: ${userEmail}, Store: ${currentStoreId}`);

    // 2. 必須パラメータチェック
    if (!userEmail || !currentStoreId) {
        displayResult('error', 'ユーザー情報または店舗情報が取得できませんでした。URLを確認してください。');
        return;
    }
    
    // 3. ライブラリ読み込みチェック
    if (typeof Html5Qrcode === 'undefined') {
        displayResult('error', 'スキャナーの起動に失敗しました(Lib)。リロードしてください。');
        return;
    }

    // 4. スキャン開始
    startScanning();
});

function startScanning() {
    if (isScanning) return;
    isScanning = true; 
    displayResult('info', 'カメラへのアクセスを求めています...'); 
    
    // ★★★ 修正ポイント: インスタンス生成 ★★★
    // ID "qr-reader" の要素を使用
    html5QrCode = new Html5Qrcode("qr-reader");

    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 }
    };

    // ★★★ 修正ポイント: カメラID指定をやめ、facingModeを使用 ★★★
    // これによりスマホの背面カメラが自動的に選択されます
    html5QrCode.start(
        { facingMode: "environment" }, // リアカメラを指定
        config, 
        (decodedText, decodedResult) => {
            // --- スキャン成功時の処理 ---
            if (isScanning) {
                console.log(`QR Scanned: ${decodedText}`);
                isScanning = false; // 二重読み込み防止
                playScanSound();
                
                // カメラを停止してから送信（停止失敗しても送信はする）
                html5QrCode.stop().then(() => {
                    sendScanData(decodedText);
                }).catch(err => {
                    console.warn("Stop failed", err);
                    sendScanData(decodedText);
                });
            }
        },
        (errorMessage) => {
            // スキャン中の小エラーは無視（ログに出すと重くなるため）
        }
    )
    .then(() => {
        console.log("Camera started.");
        displayResult('info', '店舗のQRコードを読み取ってください...');
    })
    .catch(err => {
        console.error("Camera start error:", err);
        // エラー内容に応じたメッセージ表示
        let msg = 'カメラの起動に失敗しました。';
        if (err.name === 'NotAllowedError') {
            msg = 'カメラの許可がありません。ブラウザの設定で許可してください。';
        } else if (err.name === 'NotFoundError') {
            msg = 'カメラが見つかりません。';
        } else if (err.name === 'NotReadableError') {
            msg = 'カメラにアクセスできません（他のアプリが使用中など）。';
        }
        displayResult('error', msg);
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
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.1);
}
