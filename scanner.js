// --------------------------------------------------
// 設定項目
// --------------------------------------------------
// Vercel APIのエンドポイントURL (環境に合わせて変更)
const serverUrl = 'https://saku-pointrally-proxy.vercel.app/api'; // ★★★ 要変更 ★★★ 
                                             // 例: 'https://your-proxy-project.vercel.app/api'

// スキャン成功/エラーメッセージ表示後の自動リダイレクト時間（ミリ秒）
const redirectTimeout = 5000; // 5秒

// --------------------------------------------------
// グローバル変数
// --------------------------------------------------
let userEmail = '';
let glideAppUrl = ''; // Glideアプリに戻るためのURL
let isScanning = true; // スキャン中フラグ

// --------------------------------------------------
// 初期化処理
// --------------------------------------------------
document.addEventListener('DOMContentLoaded', (event) => {
    // URLパラメータからユーザーEmailとGlideアプリURLを取得
    const urlParams = new URLSearchParams(window.location.search);
    userEmail = urlParams.get('email');
    glideAppUrl = urlParams.get('glide_app_url'); // 例: glide://app-url.glide.page/SCREEN_ID

    if (!userEmail) {
        displayResult('error', 'ユーザー情報が取得できませんでした。');
        isScanning = false;
        return;
    }
    
    // QRコードリーダーの初期化と開始
    initializeQrCodeReader();
});

// --------------------------------------------------
// QRコードリーダーの初期化と制御
// --------------------------------------------------
function initializeQrCodeReader() {
    const html5QrCode = new Html5Qrcode("qr-reader");
    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
        if (isScanning) {
            isScanning = false; // 重複スキャン防止
            console.log(`Code scanned = ${decodedText}`, decodedResult);
            // スキャン成功音を鳴らす (任意)
            playScanSound(); 
            // スキャナーを停止
            html5QrCode.stop().then(ignore => {
              console.log("QR Code scanning stopped.");
            }).catch(err => {
              console.error("Failed to stop QR Code scanning.", err);
            });
            // サーバーにデータを送信
            sendScanData(decodedText);
        }
    };

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    // 利用可能なカメラを取得し、背面カメラを優先してスキャンを開始
    Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length) {
            // 背面カメラ(environment)があればそれを優先、なければ最初のカメラを使用
            const cameraId = devices.find(device => device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('arrière'))?.id || devices[0].id;
            html5QrCode.start(
                cameraId,
                config,
                qrCodeSuccessCallback,
                (errorMessage) => {
                    // console.warn(`QR Code no longer in front of camera. Error: ${errorMessage}`);
                })
            .catch((err) => {
                console.error(`Unable to start scanning, error: ${err}`);
                displayResult('error', 'カメラの起動に失敗しました。カメラへのアクセスを許可してください。');
                isScanning = false;
            });
        } else {
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
// スキャンデータのサーバー送信
// --------------------------------------------------
function sendScanData(scannedData) {
    displayResult('loading', 'サーバーと通信中...'); // 通信中メッセージ

    fetch(serverUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            userEmail: userEmail,
            scannedQrData: scannedData
        }),
    })
    .then(response => {
        if (!response.ok) {
            // サーバーからのエラーレスポンス (4xx, 5xx)
            return response.json().then(errData => {
               throw new Error(errData.message || `サーバーエラー: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        // 成功レスポンス
        console.log('Server response:', data);
        if (data.status === 'success') {
            displayResult('success', data.message);
            // 成功したら指定時間後にGlideアプリに戻る
            redirectToGlide();
        } else {
            // GAS側で判定されたエラー (例: 重複スキャン、無効QR)
            displayResult('error', data.message || '不明なエラーが発生しました。');
            // エラーの場合も指定時間後にGlideアプリに戻る
            redirectToGlide();
        }
    })
    .catch((error) => {
        // 通信エラーやサーバーエラー
        console.error('Error sending data to server:', error);
        displayResult('error', `通信エラー: ${error.message}`);
        // エラーの場合も指定時間後にGlideアプリに戻る
        redirectToGlide();
    });
}

// --------------------------------------------------
// 結果表示の制御
// --------------------------------------------------
function displayResult(type, message) {
    const resultsDiv = document.getElementById('qr-reader-results');
    resultsDiv.style.display = 'block'; // 表示する
    resultsDiv.classList.remove('success', 'error', 'loading'); // 前のクラスを削除

    let iconHtml = '';
    if (type === 'success') {
        resultsDiv.classList.add('success');
        iconHtml = '<i class="fas fa-check-circle icon"></i>'; // Success icon
    } else if (type === 'error') {
        resultsDiv.classList.add('error');
        iconHtml = '<i class="fas fa-times-circle icon"></i>'; // Error icon
    } else if (type === 'loading') {
         resultsDiv.classList.add('loading'); // Use default styling for loading
         iconHtml = '<i class="fas fa-spinner fa-spin icon"></i>'; // Loading icon
    }
    
    // メッセージの前にアイコンを追加
    resultsDiv.innerHTML = iconHtml + message; 
}

// --------------------------------------------------
// Glideアプリへのリダイレクト
// --------------------------------------------------
function redirectToGlide() {
    if (glideAppUrl) {
        setTimeout(() => {
            console.log(`Redirecting to Glide app: ${glideAppUrl}`);
            window.location.href = glideAppUrl; 
        }, redirectTimeout);
    } else {
        console.warn("Glide App URL not provided, cannot redirect.");
        // glideAppUrlがない場合は、エラーメッセージを表示し続けるか、別の動作をする
        // displayResult('error', 'Glideアプリに戻れません。URLが設定されていません。'); 
    }
}

// --------------------------------------------------
// スキャン成功音 (任意)
// --------------------------------------------------
function playScanSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine'; // 音色
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // 周波数 (ラ)
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // 音量

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1); // 0.1秒鳴らす
  } catch (e) {
    console.warn("Could not play scan sound:", e);
  }
}
