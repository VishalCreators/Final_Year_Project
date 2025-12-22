const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());

const LOG_FILE = "C:\\Users\\user\\Desktop\\Final_Year_Project\\Final_Year_Project\\server_log.txt";

/* ---------- PARSE LOG FILE ---------- */
function parseLogFile() {
  if (!fs.existsSync(LOG_FILE)) {
    return {
      sensorData: [],
      registrations: [],
      errors: [],
      nodeStatus: {}
    };
  }

  const lines = fs.readFileSync(LOG_FILE, "utf8")
    .trim()
    .split("\n");

  const sensorData = [];
  const registrations = [];
  const errors = [];
  const nodeStatus = {};
  let lastNode = null;

  lines.forEach(line => {

    /* ---------- NODE TRACK ---------- */
    const nodeMatch = line.match(/Node(\d+)/);
    if (nodeMatch) {
      lastNode = Number(nodeMatch[1]);
    }

    /* ---------- REGISTER ---------- */
    if (line.includes("REGISTER ->")) {
      const regMatch = line.match(/\[(.*?)\] (?:Node(\d+) )?REGISTER -> (.*)/);
      if (regMatch) {
        const node = regMatch[2] ? Number(regMatch[2]) : lastNode;
        if (node) {
          registrations.push({
            time: regMatch[1],
            node,
            message: regMatch[3],
            type: regMatch[3].includes("Auto-registered") ? "auto" : "manual"
          });
        }
      }
    }

    /* ---------- DATA (TEMP + HUM + SOIL + WATER) ---------- */
    if (line.includes("DATA ->")) {
      let dataMatch = line.match(
        /\[(.*?)\] Node(\d+) DATA -> TEMP=([\d.]+) HUM=([\d.]+) SOIL=([\d.]+) WATER=([\d.]+)/ 
      );

      if (!dataMatch) {
        dataMatch = line.match(
          /\[(.*?)\] DATA -> TEMP=([\d.]+) HUM=([\d.]+) SOIL=([\d.]+) WATER=([\d.]+)/
        );

        if (dataMatch && lastNode) {
          sensorData.push({
            time: dataMatch[1],
            node: lastNode,
            temperature: Number(dataMatch[2]),
            humidity: Number(dataMatch[3]),
            soil: Number(dataMatch[4]),
            water: Number(dataMatch[5])
          });

          nodeStatus[lastNode] = { status: "online", lastEvent: "DATA" };
        }

      } else {
        const node = Number(dataMatch[2]);

        sensorData.push({
          time: dataMatch[1],
          node,
          temperature: Number(dataMatch[3]),
          humidity: Number(dataMatch[4]),
          soil: Number(dataMatch[5]),
          water: Number(dataMatch[6])
        });

        nodeStatus[node] = { status: "online", lastEvent: "DATA" };
      }
    }

    /* ---------- RECONNECT ---------- */
    if (line.includes("RECONNECT ->") && lastNode) {
      nodeStatus[lastNode] = { status: "online", lastEvent: "RECONNECT" };
    }

    /* ---------- DISCONNECT ---------- */
    if (line.includes("DISCONNECT ->") && lastNode) {
      nodeStatus[lastNode] = { status: "offline", lastEvent: "DISCONNECT" };
    }

    /* ---------- UNKNOWN ---------- */
    if (line.includes("UNKNOWN ->")) {
      const errMatch = line.match(/\[(.*?)\] Node(\d+) UNKNOWN -> (.*)/);
      if (errMatch) {
        errors.push({
          time: errMatch[1],
          node: Number(errMatch[2]),
          message: errMatch[3]
        });
      }
    }
  });

  return { sensorData, registrations, errors, nodeStatus };
}

/* ---------- GET LATEST SENSOR DATA ---------- */
function getLatestSensorData(limit = 50) {
  const { sensorData } = parseLogFile();
  // 🔥 FIXED: remove reverse to preserve proper order
  return sensorData.slice(-limit);
}

/* ---------- GET NODE STATISTICS ---------- */
function getNodeStats() {
  const { sensorData, registrations, nodeStatus } = parseLogFile();
  const nodeMap = {};

  sensorData.forEach(d => {
    if (!nodeMap[d.node]) {
      nodeMap[d.node] = {
        id: d.node,
        totalReadings: 0,
        lastSeen: null,
        firstSeen: null,
        avgTemp: 0,
        avgHum: 0,
        avgSoil: 0,
        avgWater: 0,
        minTemp: Infinity,
        maxTemp: -Infinity,
        minHum: Infinity,
        maxHum: -Infinity,
        minSoil: Infinity,
        maxSoil: -Infinity,
        minWater: Infinity,
        maxWater: -Infinity,
        registrations: 0
      };
    }

    const node = nodeMap[d.node];
    node.totalReadings++;
    node.lastSeen = d.time;
    if (!node.firstSeen) node.firstSeen = d.time;

    node.avgTemp = ((node.avgTemp * (node.totalReadings - 1)) + d.temperature) / node.totalReadings;
    node.avgHum = ((node.avgHum * (node.totalReadings - 1)) + d.humidity) / node.totalReadings;
    node.avgSoil = ((node.avgSoil * (node.totalReadings - 1)) + d.soil) / node.totalReadings;
    node.avgWater = ((node.avgWater * (node.totalReadings - 1)) + d.water) / node.totalReadings;

    node.minTemp = Math.min(node.minTemp, d.temperature);
    node.maxTemp = Math.max(node.maxTemp, d.temperature);
    node.minHum = Math.min(node.minHum, d.humidity);
    node.maxHum = Math.max(node.maxHum, d.humidity);
    node.minSoil = Math.min(node.minSoil, d.soil);
    node.maxSoil = Math.max(node.maxSoil, d.soil);
    node.minWater = Math.min(node.minWater, d.water);
    node.maxWater = Math.max(node.maxWater, d.water);
  });

  registrations.forEach(r => {
    if (nodeMap[r.node]) nodeMap[r.node].registrations++;
  });

  Object.values(nodeMap).forEach(node => {
    node.avgTemp = Number(node.avgTemp.toFixed(2));
    node.avgHum = Number(node.avgHum.toFixed(2));
    node.avgSoil = Number(node.avgSoil.toFixed(2));
    node.avgWater = Number(node.avgWater.toFixed(2));

    node.status = nodeStatus[node.id]?.status || "offline";
    node.lastEvent = nodeStatus[node.id]?.lastEvent || "UNKNOWN";
  });

  return Object.values(nodeMap);
}

/* ---------- GET REGISTRATION HISTORY ---------- */
function getRegistrationHistory(limit = 20) {
  const { registrations } = parseLogFile();
  return registrations.slice(-limit).reverse();
}

/* ---------- GET ERROR LOG ---------- */
function getErrorLog(limit = 20) {
  const { errors } = parseLogFile();
  return errors.slice(-limit).reverse();
}

/* ---------- GET SYSTEM OVERVIEW ---------- */
function getSystemOverview() {
  const { sensorData, registrations, errors } = parseLogFile();
  const nodes = getNodeStats();

  return {
    totalNodes: nodes.length,
    totalReadings: sensorData.length,
    totalRegistrations: registrations.length,
    totalErrors: errors.length,
    activeNodes: nodes.filter(n => n.status === "online").length,
    avgTemperature: nodes.length > 0
      ? (nodes.reduce((sum, n) => sum + n.avgTemp, 0) / nodes.length).toFixed(2)
      : 0,
    avgHumidity: nodes.length > 0
      ? (nodes.reduce((sum, n) => sum + n.avgHum, 0) / nodes.length).toFixed(2)
      : 0
  };
}

/* ---------- API ENDPOINTS ---------- */
app.get("/api/sensor-data", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(getLatestSensorData(limit));
});

app.get("/api/nodes", (req, res) => {
  res.json(getNodeStats());
});

app.get("/api/nodes/:id", (req, res) => {
  const nodeId = parseInt(req.params.id);
  const node = getNodeStats().find(n => n.id === nodeId);
  node ? res.json(node) : res.status(404).json({ error: "Node not found" });
});

app.get("/api/registrations", (req, res) => {
  res.json(getRegistrationHistory());
});

app.get("/api/errors", (req, res) => {
  res.json(getErrorLog());
});

app.get("/api/overview", (req, res) => {
  res.json(getSystemOverview());
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    logFile: fs.existsSync(LOG_FILE) ? "found" : "missing"
  });
});

app.get("/api/download-log", (req, res) => {
  res.download(LOG_FILE, "sensor_activity.txt");
});

/* ---------- START SERVER ---------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("✅ Enhanced IoT Backend Server");
  console.log(`🌐 Server running at http://localhost:${PORT}`);
});