const { createServer } = require("node:http");
const next = require("next");
const {
  initWebSocketServer,
  shutdown: shutdownRealtime,
} = require("./servers/node/dist/index.js");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let httpServer;
let isShuttingDown = false;

app.prepare().then(() => {
  httpServer = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error("Error handling request:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  if (process.env.REALTIME_MODE === "embedded") {
    console.log("✓ Initializing embedded WebSocket server");
    initWebSocketServer(httpServer);
  }

  httpServer.once("error", (err) => {
    console.error("Server error:", err);
    process.exit(1);
  });

  httpServer.listen(port, hostname, () => {
    console.log(`✓ Ready on http://${hostname}:${port}`);
  });

  async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n✓ Received ${signal}, starting graceful shutdown...`);

    try {
      httpServer.close(() => {
        console.log("✓ HTTP server closed");
      });

      const activeConnections = new Set();
      httpServer.on("connection", (conn) => {
        activeConnections.add(conn);
        conn.on("close", () => {
          activeConnections.delete(conn);
        });
      });

      const connectionTimeout = setTimeout(() => {
        console.log(
          `⚠ Forcing close of ${activeConnections.size} remaining connections`,
        );
        activeConnections.forEach((conn) => conn.destroy());
      }, 30000);

      if (process.env.REALTIME_MODE === "embedded") {
        console.log("✓ Shutting down embedded WebSocket server");
        await shutdownRealtime();
      }

      clearTimeout(connectionTimeout);
      console.log("✓ Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
});
