// --------------------------------------------------
// ★ スタッフ用スキャナー (景品交換用) ★
// --------------------------------------------------
const serverUrl = 'https://saku-pointrally-proxy.vercel.app/api'; 
const redirectTimeout = 3000; // 3秒後に戻る

let staffEmail = '';
let isScanning = false; 
let html5QrCode = null; 

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded (Staff)");
    const urlParams = new URLSearchParams(window.location.search);
    staffEmail = urlParams.get('email');

    if (!staffEmail) { 
        displayResult('error', 'スタッフ情報(Email)が取得できませんでした。URLを確認してください。');
        return;
    }
    
    // ライブラリチェック
    if (typeof Html5Qrcode === 'undefined') {
        displayResult('error', 'スキャナーの起動に失敗しました(Lib not loaded)。リロードしてください。');
        return;
    }

    // HTMLのID "qr-reader" と一致させる
    html5QrCode = new Html5Qrcode("qr-reader");
    startScanning();
});

function startScanning() {
    if (isScanning) return;
    isScanning = true; 
    displayResult('info', '引換券のQRコードを読み取ってください...'); 
    
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length) { 
           let cameraId = devices[0].id;
           const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
           if (backCam) cameraId = backCam.id;
           
           html5QrCode.start(cameraId, config, (decodedText) => {
                // スキャン成功時
                if (isScanning) {
                    isScanning = false;
                    playScanSound();
                    html5QrCode.stop().then(() => {
                        sendDataToServer(decodedText);
                    }).catch(() => sendDataToServer(decodedText));
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

function sendDataToServer(voucherId) {
    displayResult('loading', '確認中...'); 
    
    fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({
            action: "redeem", // ★ このキーでAPIがスタッフ用と判断します
            staffEmail: staffEmail,
            voucherId: voucherId
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
            displayResult('success', data.message); // "景品交換が完了しました"
        } else { 
            displayResult('error', data.message); // "無効な引換券です" 等
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
    el.className = type; // success, error, loading
    el.innerHTML = message;
}

function playScanSound() { 
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.1);
}
