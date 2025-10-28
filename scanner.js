// --------------------------------------------------
// 設定項目
// --------------------------------------------------
// Vercel APIのエンドポイントURL (環境に合わせて変更)
const serverUrl = 'YOUR_VERCEL_API_URL_HERE'; // ★★★ 第5章で変更します ★★★ 

// スキャン成功/エラーメッセージ表示後の自動リダイレクト時間（ミリ秒）
const redirectTimeout = 5000; // 5秒

// --------------------------------------------------
// グローバル変数
// --------------------------------------------------
let userEmail = '';
// let glideAppUrl = ''; // ★ glide_app_urlパラメータは使わない
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
    // glideAppUrl = urlParams.get('glide_app_url'); // ★ 不要
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
// QRコードリーダーのスキャン開始処理
// --------------------------------------------------
function startScanning() {
    isScanning = true; // スキャン開始フラグを立てる
    console.log("Starting QR Code scanning...");

    // スキャン成功時のコールバック関数
    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
        if (isScanning) {
            isScanning = false; // ★重要: スキャン成功したらすぐにフラグをfalseにして重複処理を防ぐ
            console.log(`Code scanned = ${decodedText}`, decodedResult);

            // スキャン成功音を鳴らす (任意)
            playScanSound(); 

            // ★重要: スキャナーを明確に停止してからサーバー通信を行う
            stopScanning().then(() => {
                // サーバーにデータを送信
                sendScanData(decodedText);
            }).catch(err => {
                console.error("Error stopping scanner, but proceeding to send data:", err);
                // 停止に失敗しても送信は試みる
                sendScanData(decodedText);
            });
        } else {
            console.log("Scan detected but already processing another scan.");
        }
    };

    // スキャナーの設定
    const config = { 
        fps: 10, 
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            let qrboxSize = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.8);
            return { width: qrboxSize, height: qrboxSize };
        },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA] 
    };

    // 利用可能なカメラを取得し、背面カメラを優先してスキャンを開始
    Html5Qrcode.getCameras().then(devices => {
        console.log("Available cameras:", devices);
        if (devices && devices.length) {
            let cameraId;
            const backCamera = devices.find(device => device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('arrière') || device.label.toLowerCase().includes('environment'));
            if (backCamera) {
                cameraId = backCamera.id;
                console.log("Using back camera:", backCamera.label);
            } else {
                cameraId = devices[0].id; // 背面がなければ最初のカメラ
                console.log("Using default camera:", devices[0].label);
            }
            html5QrCode.start(
                cameraId, config, qrCodeSuccessCallback, (errorMessage) => {/* ignore errors during scanning */})
            .catch((err) => {
                console.error(`Unable to start scanning, error: ${err}`);
                displayResult('error', 'カメラの起動に失敗しました。カメラへのアクセスを許可してください。ページを再読み込みしてください。');
                isScanning = false; // スキャン不可
            });
        } else {
            console.error('No cameras found.');
            displayResult('error', '利用可能なカメラが見つかりませんでした。');
            isScanning = false; // スキャン不可
        }
    }).catch(err => {
        console.error("Error getting cameras", err);
        displayResult('error', 'カメラ情報の取得に失敗しました。');
        isScanning = false; // スキャン不可
    });
}

// --------------------------------------------------
// スキャナー停止処理
// --------------------------------------------------
function stopScanning() {
    return new Promise((resolve, reject) => {
        // html5QrCode.isScanning が存在しない or 正しく機能しない場合があるため、状態を確認してから停止
        if (html5QrCode && typeof html5QrCode.getState === 'function' && html5QrCode.getState() === Html5QrcodeScannerState.SCANNING) {
             html5QrCode.stop()
                .then(() => { 
                    console.log("QR Code scanning stopped successfully."); 
                    resolve(); 
                })
                .catch((err) => { 
                    console.error("Failed to stop QR Code scanning.", err); 
                    resolve(); // 停止エラーでも次に進む
                });
        } else {
            console.log("Scanner not scanning or not initialized.");
            resolve(); // スキャン中でなければ成功扱い
        }
    });
}


// --------------------------------------------------
// スキャンデータのサーバー送信
// --------------------------------------------------
function sendScanData(scannedData) {
    displayResult('loading', 'サーバーと通信中...'); // 通信中メッセージ
    console.log(`Sending data to server: ${serverUrl}, Email: ${userEmail}, QR: ${scannedData}`);

    fetch(serverUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            userEmail: userEmail,
            scannedQrData: scannedData
        }),
        mode: 'cors' // CORSリクエストを明示
    })
    .then(response => {
        console.log(`Server response status: ${response.status}`);
        const contentType = response.headers.get("content-type");
        // エラーレスポンスの処理
        if (!response.ok) {
            // JSON形式のエラーを期待
            if (contentType && contentType.indexOf("application/json") !== -1) {
                 return response.json().then(errData => {
                    // GASが返す {status: "error", message: "..."} を想定
                    const message = errData ? (errData.message || JSON.stringify(errData)) : `サーバーエラー (${response.status})`;
                    console.error("Server returned JSON error:", message); 
                    throw new Error(message); 
                });
            } else { // JSON以外 (HTMLエラーページ、GASの予期せぬエラーなど)
                 return response.text().then(text => {
                    console.error("Server returned non-JSON error:", text); 
                    // ユーザーには一般的なエラーを表示
                    throw new Error(`サーバーで問題が発生しました (${response.status})`); 
                });
            }
        }
        // 成功レスポンスの処理
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return response.json();
        } else { // 成功だがJSONでない場合 (GASの構成ミスなど)
             return response.text().then(text => {
                console.error("Server returned non-JSON success response:", text); 
                throw new Error('サーバーから予期しない形式の応答がありました。'); 
            });
        }
    })
    .then(data => {
        // 成功レスポンス (JSON) を処理
        console.log('Server response data:', data);
        if (data.status === 'success') {
            displayResult('success', data.message);
            redirectToOrigin(data.message); // ★ 戻る関数を呼ぶ
        } else { // status が 'error' (GASが判定したエラー)
            displayResult('error', data.message || '不明なエラーが発生しました。');
            redirectToOrigin(data.message || '不明なエラー'); // ★ 戻る関数を呼ぶ
        }
    })
    .catch((error) => {
        // 通信失敗 or fetch内でthrowされたエラー
        console.error('Fetch error:', error);
        // ユーザーにわかりやすいエラーメッセージを表示
        let displayMessage = '通信エラーが発生しました。';
        // エラーオブジェクトのメッセージを見て内容を判断
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) { 
            // CORSエラーやネットワークエラーの可能性
            displayMessage = 'サーバーに接続できませんでした。ネットワークを確認してください。'; 
        } else if (error.message.startsWith('サーバーで問題が発生しました') || error.message.startsWith('サーバーから予期しない形式')) {
            displayMessage = error.message; // サーバー側の問題の可能性
        } else {
            displayMessage = `エラーが発生しました: ${error.message}`; // その他のエラー
        }
        displayResult('error', displayMessage);
        redirectToOrigin(displayMessage); // ★ 戻る関数を呼ぶ
    });
}

// --------------------------------------------------
// 結果表示の制御
// --------------------------------------------------
function displayResult(type, message) {
    const resultsDiv = document.getElementById('qr-reader-results');
    if (!resultsDiv) {
        console.error("Result display element not found.");
        return; 
    }

    resultsDiv.style.display = 'block'; // 表示する
    resultsDiv.className = ''; // クラスをリセット
    resultsDiv.classList.add('qr-reader-results'); // 基本クラスを追加

    let iconHtml = '';
    if (type === 'success') { 
        resultsDiv.classList.add('success'); 
        iconHtml = '<i class="fas fa-check-circle icon"></i> '; // アイコンとスペース
    } else if (type === 'error') { 
        resultsDiv.classList.add('error'); 
        iconHtml = '<i class="fas fa-times-circle icon"></i> '; // アイコンとスペース
    } else if (type === 'loading') { 
        iconHtml = '<i class="fas fa-spinner fa-spin icon"></i> '; // アイコンとスペース
    }

    // メッセージをHTMLとして設定 (innerHTMLはXSSに注意が必要だが、今回はGASからのメッセージなので許容)
    // 安全性を高めるなら textContent を使うべきだが、アイコン表示のためにinnerHTMLを使用
    resultsDiv.innerHTML = iconHtml + (message || ''); 
    console.log(`Displayed Result: Type=${type}, Message=${message}`);
}

// --------------------------------------------------
// ★★★ 戻り先関数 (ブラウザ履歴で戻る) ★★★
// --------------------------------------------------
function redirectToOrigin(resultMessage = '') {
    // メッセージ表示が完了するのを待ってからリダイレクト
    setTimeout(() => {
        console.log("Attempting to go back in history...");
        // window.history.back() を試みる
        try {
            // Glideアプリ内のWebViewで開かれている場合、これで戻れることが多い
            if (window.history.length > 1) {
                window.history.back();
            } else {
                // 履歴がない場合 (直接URLを開いた場合など)
                console.warn("No history to go back to. Cannot return automatically.");
                // ユーザーに手動で戻るよう促すメッセージを追加表示
                const resultsDiv = document.getElementById('qr-reader-results');
                // 結果が表示されている場合のみ追記
                if (resultsDiv && resultsDiv.style.display !== 'none' && !resultsDiv.innerHTML.includes('手動で戻ってください')) { 
                   resultsDiv.innerHTML += '<br><small>(自動でアプリに戻れません。手動で戻ってください)</small>';
                }
            }
        } catch (e) {
             console.error("Error attempting to go back:", e);
             // エラー発生時も手動で戻るよう促す
             const resultsDiv = document.getElementById('qr-reader-results');
             if (resultsDiv && resultsDiv.style.display !== 'none' && !resultsDiv.innerHTML.includes('手動で戻ってください')){
                resultsDiv.innerHTML += '<br><small>(自動でアプリに戻れません。手動で戻ってください)</small>';
             }
        }
    }, redirectTimeout); // redirectTimeoutミリ秒後に実行
}

// --------------------------------------------------
// スキャン成功音 (任意) - 安定版
// --------------------------------------------------
function playScanSound() {
  // AudioContextのサポート状況を確認
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    console.warn("AudioContext not supported by this browser.");
    return;
  }
  try {
    const audioContext = new AudioContext();
    // 再生後すぐに閉じるようにする (特にモバイル向け)
    const oscillator = audioContext.createOscillator(); 
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine'; // 音色
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // 周波数 (A5)

    // 音量のエンベロープを設定してクリック音を減らす
    gainNode.gain.setValueAtTime(0, audioContext.currentTime); // 開始時は0
    gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.01); // 0.01秒で最大音量へ
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.1); // 0.1秒で減衰

    oscillator.connect(gainNode); 
    gainNode.connect(audioContext.destination);

    oscillator.start(audioContext.currentTime); 
    oscillator.stop(audioContext.currentTime + 0.1); // 0.1秒後に停止

    // 再生終了後にAudioContextを閉じる (リソース解放)
    oscillator.onended = () => {
      if (audioContext.state !== 'closed') {
        audioContext.close().catch(e => console.warn("Error closing AudioContext:", e));
      }
    };
  } catch (e) { 
    console.warn("Could not play scan sound:", e); 
  }
}
