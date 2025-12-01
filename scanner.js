// --------------------------------------------------
// 設定項目
// --------------------------------------------------
const serverUrl = 'https://saku-pointrally-proxy.vercel.app/api'; // ★★★ 第5章で変更します ★★★ 

// スキャン成功/エラーメッセージ表示後の自動リダイレクト時間（ミリ秒）
const redirectTimeout = 5000; // 5秒

// --------------------------------------------------
// グローバル変数
// --------------------------------------------------
let userEmail = '';
// let glideAppUrl = ''; // ★ glide_app_urlパラメータは使わない
let isScanning = false; // ★ スキャン中フラグ (初期値はfalse)
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
    if (!userEmail || !validateEmail(userEmail)) { // ★ Email検証追加
        displayResult('error', 'ユーザー情報が取得できませんでした。');
        isScanning = false; // スキャンは開始しない
        return;
    }
    
    // QRコードリーダーのインスタンスを作成
    // Html5Qrcode クラスが読み込まれているか確認
    if (typeof Html5Qrcode === 'undefined') {
        console.error("Html5Qrcode library is not loaded!");
        displayResult('error', 'QRコードリーダーの読み込みに失敗しました。ページを再読み込みしてください。');
        return;
    }
    html5QrCode = new Html5Qrcode("qr-reader");

    // QRコードリーダーの初期化とスキャン開始
    startScanning();
});

/**
 * Email形式を簡易的に検証する関数
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/; 
  return re.test(String(email).trim());
}

// --------------------------------------------------
// QRコードリーダーのスキャン開始処理
// --------------------------------------------------
function startScanning() {
    // 既にスキャン中の場合は何もしない
    if (isScanning || !html5QrCode) {
         console.warn("Scanner already running or not initialized.");
         return;
    }
    isScanning = true; // スキャン開始フラグを立てる
    console.log("Attempting to start QR Code scanning...");
    displayResult('info', 'QRコードを読み取ってください...'); // 初期メッセージ

    // スキャン成功時のコールバック関数
    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
        // isScanningフラグをチェックして二重処理を確実に防ぐ
        if (isScanning) {
            isScanning = false; // ★重要: スキャン成功したらすぐにフラグをfalseに
            console.log(`QR Code Scanned Successfully! Data: ${decodedText}`);
            
            // スキャン成功音
            playScanSound(); 
            
            // ★重要: スキャナーを停止してからサーバー通信
            stopScanning().then(() => {
                sendScanData(decodedText); // サーバーに送信
            }).catch(err => {
                console.error("Error stopping scanner, but proceeding to send data:", err);
                sendScanData(decodedText); // 停止失敗でも送信試行
            });
        } else {
            console.log("Scan detected but isScanning flag is false. Ignoring.");
        }
    };

    // スキャナーの設定
    const config = { 
        fps: 10, // スキャン頻度
        qrbox: (viewfinderWidth, viewfinderHeight) => { // スキャン領域
            let qrboxSize = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7); // 70%
            return { width: qrboxSize, height: qrboxSize };
        },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA], // カメラのみ
        rememberLastUsedCamera: true // 最後に使用したカメラを記憶
    };

    // ★★★ 変更点: facingMode: "environment" を直接指定して起動 ★★★
    // 名前で検索せず、環境（背面）カメラを優先的に使用する設定
    const cameraConfig = { facingMode: "environment" };

    html5QrCode.start(
        cameraConfig, 
        config, 
        qrCodeSuccessCallback, 
        (errorMessage) => { /* スキャン中のエラーは無視 */ }
    )
    .then(() => {
        console.log("QR Code scanning started successfully.");
    })
    .catch((err) => {
        // カメラ起動失敗などの致命的なエラー
        console.error(`Unable to start scanning, error: ${err}`);
        displayResult('error', 'カメラの起動に失敗しました。カメラへのアクセスを許可し、ページを再読み込みしてください。');
        isScanning = false; // 開始失敗
    });
}

// --------------------------------------------------
// スキャナー停止処理
// --------------------------------------------------
function stopScanning() {
    console.log("Attempting to stop scanning...");
    return new Promise((resolve, reject) => {
        // ライブラリの状態を確認してから停止を試みる
        if (html5QrCode && typeof html5QrCode.getState === 'function' && html5QrCode.getState() === Html5QrcodeScannerState.SCANNING) {
             html5QrCode.stop()
                .then(() => { 
                    console.log("QR Code scanning stopped successfully via stop()."); 
                    resolve(); 
                })
                .catch((err) => { 
                    console.error("Failed to stop QR Code scanning via stop():", err); 
                    resolve(); // 停止エラーでも次に進む
                });
        } else {
            console.log("Scanner already stopped, not initialized, or state cannot be determined.");
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
    .then(async response => { // asyncを追加してawaitを使えるように
        console.log(`Server response status: ${response.status}`);
        const contentType = response.headers.get("content-type");
        
        // レスポンスボディを取得 (エラー時も取得試行)
        let responseBody;
        try {
             responseBody = await response.text();
             console.log('Raw server response body:', responseBody);
        } catch (textError) {
             console.error("Error reading response text:", textError);
             throw new Error(`サーバー応答の読み取りに失敗 (${response.status})`);
        }

        // エラーレスポンスの処理
        if (!response.ok) {
            let errorMessage = `サーバーエラー (${response.status})`; // デフォルト
            // JSON形式のエラーを試す
            if (contentType && contentType.includes("application/json") && responseBody) {
                 try {
                     const errData = JSON.parse(responseBody);
                     errorMessage = errData ? (errData.message || JSON.stringify(errData)) : errorMessage;
                 } catch (jsonParseError) {
                      console.warn("Failed to parse error response as JSON:", responseBody);
                      // JSONでなければテキストの一部を使う (セキュリティ考慮)
                      errorMessage = `サーバーエラー (${response.status}): 応答形式不正`;
                 }
            } else if (responseBody) {
                // JSON以外の場合、エラーメッセージの詳細は隠蔽したほうが安全な場合も
                errorMessage = `サーバーで問題が発生しました (${response.status})`; 
            }
            console.error("Server returned error:", errorMessage); 
            throw new Error(errorMessage); 
        }

        // 成功レスポンスの処理
        if (contentType && contentType.includes("application/json") && responseBody) {
            try {
                const data = JSON.parse(responseBody);
                return data; // パース成功
            } catch (jsonParseError) {
                 console.error("Failed to parse success response as JSON:", responseBody); 
                 throw new Error('サーバーから予期しない形式の応答がありました。'); 
            }
        } else { // 成功だがJSONでない場合
             console.error("Server returned non-JSON success response:", responseBody); 
             throw new Error('サーバーから予期しない形式の応答がありました。'); 
        }
    })
    .then(data => {
        // 成功レスポンス (JSON) を処理
        console.log('Server response data parsed:', data);
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
        console.error('Fetch error or Error thrown:', error);
        // ユーザーにわかりやすいエラーメッセージを表示
        let displayMessage = '通信エラーが発生しました。';
        // エラーオブジェクトのメッセージを見て内容を判断
        if (error instanceof TypeError && error.message.includes('fetch')) { 
            // CORSエラーやネットワークエラーの可能性
             displayMessage = 'サーバーに接続できませんでした。ネットワーク設定を確認するか、時間をおいて再試行してください。'; 
        } else {
            displayMessage = `${error.message || '不明なエラーが発生しました。'}`; // サーバーからのメッセージを優先
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
        console.error("Result display element '#qr-reader-results' not found.");
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
    
    // メッセージをHTMLとして設定 (innerHTMLはXSSに注意)
    // サーバーからのメッセージをそのまま表示する
    resultsDiv.innerHTML = iconHtml + (message || 'メッセージなし'); 
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
            if (window.history && window.history.length > 1) {
                 console.log("Using history.back()");
                 window.history.back();
            } else {
                // 履歴がない場合 (直接URLを開いた場合など)
                console.warn("No history stack available to go back to.");
                // ユーザーに手動で戻るよう促すメッセージを追加表示
                displayManualReturnMessage();
            }
        } catch (e) {
             console.error("Error attempting to use history.back():", e);
             // エラー発生時も手動で戻るよう促す
             displayManualReturnMessage();
        }
    }, redirectTimeout); // redirectTimeoutミリ秒後に実行
}

// 手動で戻るよう促すメッセージを表示するヘルパー関数
function displayManualReturnMessage() {
    const resultsDiv = document.getElementById('qr-reader-results');
    const manualReturnMessage = '<br><small>(自動でアプリに戻れません。手動で戻ってください)</small>';
    // 結果が表示されていて、かつメッセージがまだ追加されていない場合のみ追記
    if (resultsDiv && resultsDiv.style.display !== 'none' && !resultsDiv.innerHTML.includes('手動で戻ってください')) { 
       resultsDiv.innerHTML += manualReturnMessage;
    }
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
    // 念のため、一定時間後にも閉じる処理
    setTimeout(() => {
         if (audioContext && audioContext.state !== 'closed') {
            audioContext.close().catch(e => console.warn("Error closing AudioContext (timeout):", e));
         }
    }, 500);

  } catch (e) { 
    console.warn("Could not play scan sound:", e); 
    // エラー発生時もAudioContextが残らないように閉じる
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(closeError => console.warn("Error closing AudioContext after sound error:", closeError));
    }
  }
}
