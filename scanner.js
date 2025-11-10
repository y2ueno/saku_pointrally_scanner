// scanner.js (Fix: Use facingMode: "environment")

// Vercel API (GAS Proxy) Endpoint
const API_ENDPOINT = 'https://saku-pointrally-proxy.vercel.app/api';

// --- 1. Glideからデータを受け取るリスナー ---
let glideData = {};
window.addEventListener('message', (e) => {
    if (e.data && e.data.glideData) {
        try {
            const receivedData = JSON.parse(e.data.glideData);
            glideData.userEmail = receivedData.userEmail || 'unknown_email';
            glideData.storeId = receivedData.storeId || 'unknown_storeId';
            console.log('Glide data received:', glideData);
        } catch (error) {
            console.error('Error parsing glideData:', error);
            showResult('ERROR: アプリデータの解析に失敗', true);
        }
    }
});

// --- 2. スキャナーのセットアップ (DOM読み込み後) ---
document.addEventListener('DOMContentLoaded', () => {
    // Html5QrcodeScanner (UI付き) ではなく、Html5Qrcode (Core) を使う
    const html5QrCode = new Html5Qrcode("reader");
    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        // rememberLastUsedCamera: false, // 最後に使ったカメラを記憶しない
        // experimentalFeatures: {
        //     useNewScanner: true
        // }
    };

    // スキャン成功時のコールバック
    const onScanSuccess = (decodedText, decodedResult) => {
        console.log(`Scan successful: ${decodedText}`);
        // スキャンを停止（重複送信防止）
        html5QrCode.stop().then(() => {
            console.log('Scanner stopped.');
            // サーバーに送信
            sendQrData(decodedText);
        }).catch(err => {
            console.error('Failed to stop scanner:', err);
            sendQrData(decodedText); // ストップ失敗しても送信は試みる
        });
    };

    // スキャン失敗時（デコード失敗など、エラーではない）
    const onScanFailure = (error) => {
        // （ここでは何もしない。コンソールが埋まるため）
        // console.warn(`QR code scan failure: ${error}`);
    };

    // --- 3. スキャナの起動 ---
    console.log('Starting scanner...');
    showResult('QRコードを読み取ってください...', false);

    // ★★★★★【バグ修正】★★★★★
    // カメラID (cameraId) ではなく、
    // facingMode: "environment" (背面カメラ) を指定する
    html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        onScanSuccess,
        onScanFailure
    ).catch((err) => {
        console.error(`Failed to start scanner: ${err}`);
        // 背面カメラ(environment)が失敗した場合、 
        // どのカメラでも良い(user=インカメラも含む)設定でリトライ
        console.warn('Retrying with default facingMode (any)...');
        html5QrCode.start(
            {}, // カメラ指定なし (OS/ブラウザに任せる)
            config,
            onScanSuccess,
            onScanFailure
        ).catch((errRetry) => {
            console.error(`Failed to start scanner on retry: ${errRetry}`);
            showResult(`エラー: カメラの起動に失敗しました。 ${errRetry}`, true);
        });
    });
    // ★★★★★★★★★★★★★★★★★

}); // DOMContentLoaded end

// --- 4. サーバー（Vercel/GAS）へのデータ送信 ---
async function sendQrData(scannedQrData) {
    showResult('ポイント確認中...', false);

    if (!glideData.userEmail || !glideData.storeId) {
        console.error('Glide data missing.', glideData);
        showResult('ERROR: アプリデータがありません。', true);
        return;
    }

    const payload = {
        userEmail: glideData.userEmail,
        storeId: glideData.storeId,
        scannedQrData: scannedQrData
        // (action: 'point_scan' は Vercel/GAS側でデフォルトとして扱う)
    };

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        console.log('Server response:', result);

        if (result.status === 'success') {
            showResult(`OK: ${result.message}`, false);
            // 成功したらアプリ（Glide）に通知（任意）
            window.parent.postMessage({ status: 'success', message: result.message }, '*');
        } else {
            showResult(`NG: ${result.message}`, true);
        }

    } catch (error) {
        console.error('Fetch error:', error);
        showResult(`ERROR: サーバー通信に失敗しました。 ${error.message}`, true);
    }
}

// --- 5. 結果表示 ---
function showResult(message, isError = false) {
    const resultEl = document.getElementById('scan-result');
    if (resultEl) {
        resultEl.textContent = message;
        resultEl.style.color = isError ? 'red' : 'green';
    }
}
