const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

class GameWebSocketClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.isAuthenticated = false;
        this.sessionId = null;
        this.latestTxData = null;
        this.latestMd5Data = null;
        this.lastUpdateTime = { tx: null, md5: null };
        this.historyTx = [];          // Lịch sử bàn tài xỉu thường
        this.historyMd5 = [];         // Lịch sử bàn MD5
        this.maxHistorySize = 100;    // Số phiên tối đa lưu trữ
    }

    connect() {
        console.log('🔗 Connecting to WebSocket server...');
        this.ws = new WebSocket(this.url, {
            headers: {
                'Host': 'api.jiusyss.me',
                'Origin': 'https://play.son789.site',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
                'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
                'Sec-WebSocket-Version': '13'
            }
        });
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.ws.on('open', () => {
            console.log('✅ Connected to WebSocket server');
            this.reconnectAttempts = 0;
            this.sendAuthentication();
        });

        this.ws.on('message', (data) => {
            this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`🔌 Connection closed. Code: ${code}, Reason: ${String(reason)}`);
            this.isAuthenticated = false;
            this.sessionId = null;
            this.handleReconnect();
        });

        this.ws.on('pong', () => {
            console.log('❤️  Heartbeat received from server');
        });
    }

    sendAuthentication() {
        console.log('🔐 Sending authentication...');
        const authMessage = [
            1,
            "MiniGame",
            "son789apia",
            "WangLin1@",
            {
                "signature": "3B807F3D9780682F163184B42F8A3B30B26814FF23F1B7784F99DC842AC076F758E4718F533AF9405F1129E3830A236DAAA0127F1EECA73BC6EB057B5174E4509D57408CCF2C7E316136F98CE46843E6920130C60465D474CABAF6F911E7068DE9B20198CFF684DE6270C9E42922A46E46F5D60EC2BAA9B75F9BE8605E824CA0",
                "info": {
                    "cs": "9e05a39a8958d83119db6ab9a1d88548",
                    "phone": "",
                    "ipAddress": "113.185.46.68",
                    "isMerchant": false,
                    "userId": "bf5dc66b-2e77-4b48-ab73-09f2ffbe3443",
                    "deviceId": "050105373613900053736078036024",
                    "isMktAccount": false,
                    "username": "son789apia",
                    "timestamp": 1766557267829
                },
                "pid": 4
            }
        ];
        this.sendRaw(authMessage);
    }

    sendPluginMessages() {
        console.log('🚀 Sending plugin initialization messages...');
        const pluginMessages = [
            [6,"MiniGame","taixiuPlugin",{"cmd":1005}],
            [6,"MiniGame","taixiuMd5Plugin",{"cmd":1105}],
            [6,"MiniGame","lobbyPlugin",{"cmd":10001}],
            [6,"MiniGame","channelPlugin",{"cmd":310}]
        ];
        pluginMessages.forEach((message, index) => {
            setTimeout(() => {
                console.log(`📤 Sending plugin ${index + 1}/${pluginMessages.length}: ${message[2]}`);
                this.sendRaw(message);
            }, index * 1000);
        });
        setInterval(() => {
            this.refreshGameData();
        }, 30000);
    }

    refreshGameData() {
        if (this.isAuthenticated && this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('🔄 Refreshing game data...');
            const refreshTx = [6, "MiniGame", "taixiuPlugin", { "cmd": 1005 }];
            const refreshMd5 = [6, "MiniGame", "taixiuMd5Plugin", { "cmd": 1105 }];
            this.sendRaw(refreshTx);
            setTimeout(() => {
                this.sendRaw(refreshMd5);
            }, 1000);
        }
    }

    sendRaw(data) {
        if (this.ws.readyState === WebSocket.OPEN) {
            const jsonString = JSON.stringify(data);
            this.ws.send(jsonString);
            console.log('📤 Sent raw:', jsonString);
            return true;
        } else {
            console.log('⚠️ Cannot send, WebSocket not open');
            return false;
        }
    }

    // Cập nhật lịch sử
    updateHistory(historyArray, newSessions, type) {
        if (!newSessions || newSessions.length === 0) return;
        const existingSids = new Set(historyArray.map(s => s.sid));
        for (const session of newSessions) {
            if (!existingSids.has(session.sid)) {
                historyArray.push(session);
                existingSids.add(session.sid);
            }
        }
        historyArray.sort((a, b) => b.sid - a.sid);
        if (historyArray.length > this.maxHistorySize) {
            historyArray.length = this.maxHistorySize;
        }
        if (type === 'tx') {
            this.lastUpdateTime.tx = new Date();
        } else if (type === 'md5') {
            this.lastUpdateTime.md5 = new Date();
        }
    }

    // Phân tích thống kê
    analyzeHistory(history, recentCount = 10) {
        if (history.length === 0) return null;
        const total = history.length;
        let tai = 0, xiu = 0;
        history.forEach(s => {
            const tong = s.d1 + s.d2 + s.d3;
            if (tong >= 11) tai++; else xiu++;
        });
        const recent = history.slice(0, Math.min(recentCount, history.length));
        let recentTai = 0, recentXiu = 0;
        recent.forEach(s => {
            const tong = s.d1 + s.d2 + s.d3;
            if (tong >= 11) recentTai++; else recentXiu++;
        });
        return {
            total, tai, xiu,
            recentCount: recent.length,
            recentTai, recentXiu,
            taiRatio: tai / total,
            xiuRatio: xiu / total,
            recentTaiRatio: recentTai / recent.length,
            recentXiuRatio: recentXiu / recent.length
        };
    }

    // Dự đoán
    predict(method = 'simple', type = 'tx') {
        const history = type === 'tx' ? this.historyTx : this.historyMd5;
        if (history.length === 0) {
            return { error: 'Không có dữ liệu lịch sử để dự đoán' };
        }
        const stats = this.analyzeHistory(history);
        let prediction, confidence;
        if (method === 'simple') {
            if (stats.tai > stats.xiu) {
                prediction = 'tài';
                confidence = stats.tai / stats.total;
            } else if (stats.xiu > stats.tai) {
                prediction = 'xỉu';
                confidence = stats.xiu / stats.total;
            } else {
                prediction = 'tài';
                confidence = 0.5;
            }
        } else if (method === 'trend') {
            if (stats.recentTai > stats.recentXiu) {
                prediction = 'tài';
                confidence = stats.recentTai / stats.recentCount;
            } else if (stats.recentXiu > stats.recentTai) {
                prediction = 'xỉu';
                confidence = stats.recentXiu / stats.recentCount;
            } else {
                prediction = 'tài';
                confidence = 0.5;
            }
        } else if (method === 'combined') {
            const wRecent = 0.7, wOverall = 0.3;
            const overallTai = stats.tai / stats.total;
            const overallXiu = stats.xiu / stats.total;
            const recentTai = stats.recentTai / stats.recentCount;
            const recentXiu = stats.recentXiu / stats.recentCount;
            const combinedTai = overallTai * wOverall + recentTai * wRecent;
            const combinedXiu = overallXiu * wOverall + recentXiu * wRecent;
            if (combinedTai > combinedXiu) {
                prediction = 'tài';
                confidence = combinedTai;
            } else {
                prediction = 'xỉu';
                confidence = combinedXiu;
            }
        } else {
            return { error: 'Phương thức không hợp lệ' };
        }
        confidence = Math.round(confidence * 100) / 100;
        return {
            prediction,
            confidence,
            stats: {
                total: stats.total,
                tai: stats.tai,
                xiu: stats.xiu,
                recentCount: stats.recentCount,
                recentTai: stats.recentTai,
                recentXiu: stats.recentXiu
            },
            method,
            timestamp: new Date().toISOString()
        };
    }

    predictTx(method = 'simple') {
        return this.predict(method, 'tx');
    }

    predictMd5(method = 'simple') {
        return this.predict(method, 'md5');
    }

    handleMessage(data) {
        try {
            const parsed = JSON.parse(data);
            // XỬ LÝ CMD 1005 - BÀN TÀI XỈU THƯỜNG
            if (parsed[0] === 5 && parsed[1] && parsed[1].cmd === 1005) {
                console.log('🎯 Nhận được dữ liệu cmd 1005 (Bàn TX)');
                const gameData = parsed[1];
                if (gameData.htr && gameData.htr.length > 0) {
                    this.updateHistory(this.historyTx, gameData.htr, 'tx');
                    const latestSession = this.historyTx[0];
                    console.log(`🎲 Bàn TX - Phiên gần nhất: ${latestSession.sid} (${latestSession.d1},${latestSession.d2},${latestSession.d3})`);
                    this.latestTxData = gameData;
                    console.log(`💾 Đã cập nhật dữ liệu bàn TX. Tổng số phiên lưu: ${this.historyTx.length}`);
                }
            }
            // XỬ LÝ CMD 1105 - BÀN MD5
            else if (parsed[0] === 5 && parsed[1] && parsed[1].cmd === 1105) {
                console.log('🎯 Nhận được dữ liệu cmd 1105 (Bàn MD5)');
                const gameData = parsed[1];
                if (gameData.htr && gameData.htr.length > 0) {
                    this.updateHistory(this.historyMd5, gameData.htr, 'md5');
                    const latestSession = this.historyMd5[0];
                    console.log(`🎲 Bàn MD5 - Phiên gần nhất: ${latestSession.sid} (${latestSession.d1},${latestSession.d2},${latestSession.d3})`);
                    this.latestMd5Data = gameData;
                    console.log(`💾 Đã cập nhật dữ liệu bàn MD5. Tổng số phiên lưu: ${this.historyMd5.length}`);
                }
            }
            // Xử lý response authentication (type 5, có cmd 100)
            else if (parsed[0] === 5 && parsed[1] && parsed[1].cmd === 100) {
                console.log('🔑 Authentication successful!');
                const userData = parsed[1];
                console.log(`✅ User: ${userData.u}`);
                this.isAuthenticated = true;
                setTimeout(() => {
                    console.log('🔄 Starting to send plugin messages...');
                    this.sendPluginMessages();
                }, 2000);
            }
            // Xử lý response type 1 - Session initialization
            else if (parsed[0] === 1 && parsed.length >= 5 && parsed[4] === "MiniGame") {
                console.log('✅ Session initialized');
                this.sessionId = parsed[3];
                console.log(`📋 Session ID: ${this.sessionId}`);
            }
            // Xử lý response type 7 - Plugin response
            else if (parsed[0] === 7) {
                const pluginName = parsed[2];
                console.log(`🔄 Plugin ${pluginName} response received`);
            }
            // Xử lý heartbeat/ping response
            else if (parsed[0] === 0) {
                console.log('❤️  Heartbeat received');
            }
        } catch (e) {
            console.log('📥 Raw message:', data.toString());
            console.error('❌ Parse error:', e.message);
        }
    }

    getLatestTxSession() {
        if (!this.latestTxData || !this.latestTxData.htr || this.latestTxData.htr.length === 0) {
            return { error: "Không có dữ liệu bàn TX", message: "Chưa nhận được dữ liệu từ server hoặc dữ liệu trống" };
        }
        try {
            const latestSession = this.latestTxData.htr.reduce((prev, current) => (current.sid > prev.sid) ? current : prev);
            const tong = latestSession.d1 + latestSession.d2 + latestSession.d3;
            const ket_qua = (tong >= 11) ? "tài" : "xỉu";
            return {
                phien: latestSession.sid,
                xuc_xac_1: latestSession.d1,
                xuc_xac_2: latestSession.d2,
                xuc_xac_3: latestSession.d3,
                tong: tong,
                ket_qua: ket_qua,
                timestamp: new Date().toISOString(),
                ban: "tai_xiu",
                last_updated: this.lastUpdateTime.tx ? this.lastUpdateTime.tx.toISOString() : null
            };
        } catch (error) {
            return { error: "Lỗi xử lý dữ liệu TX", message: error.message };
        }
    }

    getLatestMd5Session() {
        if (!this.latestMd5Data || !this.latestMd5Data.htr || this.latestMd5Data.htr.length === 0) {
            return { error: "Không có dữ liệu bàn MD5", message: "Chưa nhận được dữ liệu từ server hoặc dữ liệu trống" };
        }
        try {
            const latestSession = this.latestMd5Data.htr.reduce((prev, current) => (current.sid > prev.sid) ? current : prev);
            const tong = latestSession.d1 + latestSession.d2 + latestSession.d3;
            const ket_qua = (tong >= 11) ? "tài" : "xỉu";
            return {
                phien: latestSession.sid,
                xuc_xac_1: latestSession.d1,
                xuc_xac_2: latestSession.d2,
                xuc_xac_3: latestSession.d3,
                tong: tong,
                ket_qua: ket_qua,
                timestamp: new Date().toISOString(),
                ban: "md5",
                last_updated: this.lastUpdateTime.md5 ? this.lastUpdateTime.md5.toISOString() : null
            };
        } catch (error) {
            return { error: "Lỗi xử lý dữ liệu MD5", message: error.message };
        }
    }

    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            console.log(`🔄 Attempting to reconnect in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => {
                console.log('🔄 Reconnecting...');
                this.connect();
            }, delay);
        } else {
            console.log('❌ Max reconnection attempts reached');
        }
    }

    startHeartbeat() {
        setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const heartbeatMsg = [0, this.sessionId || ""];
                this.sendRaw(heartbeatMsg);
                console.log('❤️  Sending heartbeat...');
            }
        }, 25000);
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// KHỞI TẠO EXPRESS SERVER
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

// Tạo WebSocket client với URL mới
const client = new GameWebSocketClient(
    'wss://api.jiusyss.me/websocket?d=YUd0aGIyNWliMmM9fDEyOTh8MTc2NjU1NzI2NzI2M3wzMmNlMmE1NGQzNmFhY2FhMWZmNjZmMzE5MzQ1ZmUyNXw5MjJjMjBhMTE4NTBiNzRiNmNjYzQxMTE3Nzk0NDQ5Zg=='
);
client.connect();

// Routes API
app.get('/api/tx', (req, res) => {
    const data = client.getLatestTxSession();
    if (data.error) return res.status(404).json(data);
    res.json(data);
});

app.get('/api/md5', (req, res) => {
    const data = client.getLatestMd5Session();
    if (data.error) return res.status(404).json(data);
    res.json(data);
});

app.get('/api/all', (req, res) => {
    const txSession = client.getLatestTxSession();
    const md5Session = client.getLatestMd5Session();
    res.json({
        tai_xiu: txSession.error ? { error: txSession.error } : txSession,
        md5: md5Session.error ? { error: md5Session.error } : md5Session,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/status', (req, res) => {
    const hasTxData = client.latestTxData && client.latestTxData.htr && client.latestTxData.htr.length > 0;
    const hasMd5Data = client.latestMd5Data && client.latestMd5Data.htr && client.latestMd5Data.htr.length > 0;
    res.json({
        status: "running",
        websocket_connected: client.ws ? client.ws.readyState === WebSocket.OPEN : false,
        authenticated: client.isAuthenticated,
        has_tx_data: hasTxData,
        has_md5_data: hasMd5Data,
        tx_last_updated: client.lastUpdateTime.tx ? client.lastUpdateTime.tx.toISOString() : null,
        md5_last_updated: client.lastUpdateTime.md5 ? client.lastUpdateTime.md5.toISOString() : null,
        tx_history_count: client.historyTx.length,
        md5_history_count: client.historyMd5.length,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/refresh', (req, res) => {
    if (client.isAuthenticated && client.ws && client.ws.readyState === WebSocket.OPEN) {
        client.refreshGameData();
        res.json({ message: "Đã gửi yêu cầu refresh dữ liệu", timestamp: new Date().toISOString() });
    } else {
        res.status(400).json({ error: "Không thể refresh", message: "WebSocket chưa kết nối hoặc chưa xác thực" });
    }
});

// API DỰ ĐOÁN
app.get('/api/predict/tx', (req, res) => {
    const method = req.query.method || 'simple';
    const result = client.predictTx(method);
    if (result.error) return res.status(404).json(result);
    res.json(result);
});

app.get('/api/predict/md5', (req, res) => {
    const method = req.query.method || 'simple';
    const result = client.predictMd5(method);
    if (result.error) return res.status(404).json(result);
    res.json(result);
});

// API LỊCH SỬ
app.get('/api/history/tx', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const history = client.historyTx.slice(0, limit);
    res.json({
        count: history.length,
        data: history.map(s => ({
            sid: s.sid,
            d1: s.d1,
            d2: s.d2,
            d3: s.d3,
            tong: s.d1 + s.d2 + s.d3,
            ket_qua: (s.d1 + s.d2 + s.d3) >= 11 ? 'tài' : 'xỉu'
        }))
    });
});

app.get('/api/history/md5', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const history = client.historyMd5.slice(0, limit);
    res.json({
        count: history.length,
        data: history.map(s => ({
            sid: s.sid,
            d1: s.d1,
            d2: s.d2,
            d3: s.d3,
            tong: s.d1 + s.d2 + s.d3,
            ket_qua: (s.d1 + s.d2 + s.d3) >= 11 ? 'tài' : 'xỉu'
        }))
    });
});

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>API Tài Xỉu</title></head>
            <body>
                <h1>🚀 API Tài Xỉu + Dự đoán</h1>
                <p>Các endpoint:</p>
                <ul>
                    <li><code>/api/tx</code> – Phiên tài xỉu thường gần nhất</li>
                    <li><code>/api/md5</code> – Phiên MD5 gần nhất</li>
                    <li><code>/api/all</code> – Cả hai bàn</li>
                    <li><code>/api/status</code> – Trạng thái kết nối</li>
                    <li><code>/api/refresh</code> – Refresh dữ liệu</li>
                    <li><code>/api/predict/tx?method=simple</code> – Dự đoán bàn thường</li>
                    <li><code>/api/predict/md5?method=trend</code> – Dự đoán bàn MD5</li>
                    <li><code>/api/history/tx?limit=10</code> – Lịch sử bàn thường</li>
                    <li><code>/api/history/md5?limit=10</code> – Lịch sử bàn MD5</li>
                </ul>
                <p>Phương thức dự đoán: <code>simple</code>, <code>trend</code>, <code>combined</code></p>
            </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});

setTimeout(() => {
    client.startHeartbeat();
}, 10000);

process.on('SIGINT', () => {
    console.log('\n👋 Closing WebSocket connection and server...');
    client.close();
    process.exit();
});

module.exports = { GameWebSocketClient, app };
