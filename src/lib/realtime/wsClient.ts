type WSMessage = {
    type: string;
    data: any;
};

type MessageListener = (msg: WSMessage) => void;

let socket: WebSocket | null = null;
let listeners = new Set<MessageListener>();

let isConnecting = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
let reconnectTimeout: number | null = null;

let lastJoin: { roomId: string; name: string } | null = null;

function getSocketUrl(): string {
    let baseUrl = process.env.NEXT_PUBLIC_REALTIME_URL || window.location.origin;
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
        baseUrl = `http://${baseUrl}`;
    }
    const protocol = baseUrl.startsWith("https") ? "wss" : "ws";
    const wsUrl = baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `${protocol}://${wsUrl}/api/ws`;
}

function notifyListeners(message: WSMessage) {
    listeners.forEach((listener) => {
        try {
            listener(message);
        } catch (err) {
            console.error("Listener error:", err);
        }
    });
}

function doJoinIfNeeded() {
    if (socket && socket.readyState === WebSocket.OPEN && lastJoin) {
        const joinMessage = {
            type: "join-room",
            data: { roomId: lastJoin.roomId, name: lastJoin.name },
        };
        socket.send(JSON.stringify(joinMessage));
    }
}

export function connectIfNeeded() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
    }
    if (isConnecting) return;

    isConnecting = true;

    const url = getSocketUrl();
    const ws = new WebSocket(url);
    socket = ws;

    ws.onopen = () => {
        isConnecting = false;
        reconnectAttempts = 0;

        doJoinIfNeeded();
    };

    ws.onmessage = (event) => {
        try {
            const msg: WSMessage = JSON.parse(event.data);
            notifyListeners(msg);
        } catch (err) {
            console.error("❌ [wsClient] Failed to parse message:", err);
        }
    };

    ws.onerror = (err) => {
        console.error("❌ [wsClient] WebSocket error:", err);
    };

    ws.onclose = (event) => {
        console.log("🔌 [wsClient] WebSocket closed:", event.code, event.reason);
        isConnecting = false;
        socket = null;

        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 5000);
            console.log(
                `🔄 [wsClient] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`,
            );
            if (reconnectTimeout !== null) {
                window.clearTimeout(reconnectTimeout);
            }
            reconnectTimeout = window.setTimeout(() => {
                connectIfNeeded();
            }, delay);
        } else {
            console.error("❌ [wsClient] Max reconnection attempts reached");
        }
    };
}


export function joinRoom(roomId: string, name: string) {
    lastJoin = { roomId, name };
    connectIfNeeded();
    if (socket && socket.readyState === WebSocket.OPEN) {
        doJoinIfNeeded();
    }
}

export function sendMessage(type: string, data: any) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type, data }));
    } else {
        console.warn("⚠️ [wsClient] WebSocket not connected, cannot send:", type);
    }
}

export function subscribeToMessages(listener: MessageListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
