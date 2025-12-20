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
            errors: []
        };
    }

    const lines = fs.readFileSync(LOG_FILE, "utf8")
        .trim()
        .split("\n");

    const sensorData = [];
    const registrations = [];
    const errors = [];
    let lastNode = null; // Track last seen node for entries without Node prefix

    lines.forEach(line => {
        // Extract node number from any line that has it
        const nodeMatch = line.match(/Node(\d+)/);
        if (nodeMatch) {
            lastNode = Number(nodeMatch[1]);
        }

        // Parse REGISTER events
        if (line.includes("REGISTER ->")) {
            const regMatch = line.match(/\[(.*?)\] (?:Node(\d+) )?REGISTER -> (.*)/);
            if (regMatch) {
                const node = regMatch[2] ? Number(regMatch[2]) : lastNode;
                if (node) {
                    registrations.push({
                        time: regMatch[1],
                        node: node,
                        message: regMatch[3],
                        type: regMatch[3].includes("Auto-registered") ? "auto" : "manual"
                    });
                }
            }
        }

        // Parse DATA events (with or without Node prefix)
        if (line.includes("DATA ->")) {
            // Try to match with Node prefix first
            let dataMatch = line.match(
                /\[(.*?)\] Node(\d+) DATA -> DATA:TEMP=([\d.]+) HUM=([\d.]+)/
            );
            
            // If no Node prefix, try without it and use lastNode
            if (!dataMatch) {
                dataMatch = line.match(
                    /\[(.*?)\] DATA -> DATA:TEMP=([\d.]+) HUM=([\d.]+)/
                );
                if (dataMatch && lastNode) {
                    sensorData.push({
                        time: dataMatch[1],
                        node: lastNode,
                        temperature: Number(dataMatch[2]),
                        humidity: Number(dataMatch[3])
                    });
                }
            } else {
                sensorData.push({
                    time: dataMatch[1],
                    node: Number(dataMatch[2]),
                    temperature: Number(dataMatch[3]),
                    humidity: Number(dataMatch[4])
                });
            }
        }

        // Parse UNKNOWN events (errors)
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

    return { sensorData, registrations, errors };
}

/* ---------- GET LATEST SENSOR DATA ---------- */
function getLatestSensorData(limit = 50) {
    const { sensorData } = parseLogFile();
    return sensorData.slice(-limit).reverse();
}

/* ---------- GET NODE STATISTICS ---------- */
function getNodeStats() {
    const { sensorData, registrations } = parseLogFile();
    const nodeMap = {};

    // Process sensor data
    sensorData.forEach(d => {
        if (!nodeMap[d.node]) {
            nodeMap[d.node] = {
                id: d.node,
                totalReadings: 0,
                lastSeen: null,
                firstSeen: null,
                avgTemp: 0,
                avgHum: 0,
                minTemp: Infinity,
                maxTemp: -Infinity,
                minHum: Infinity,
                maxHum: -Infinity,
                registrations: 0
            };
        }

        const node = nodeMap[d.node];
        node.totalReadings++;
        node.lastSeen = d.time;
        if (!node.firstSeen) node.firstSeen = d.time;
        
        // Update temperature stats
        node.avgTemp = ((node.avgTemp * (node.totalReadings - 1)) + d.temperature) / node.totalReadings;
        node.minTemp = Math.min(node.minTemp, d.temperature);
        node.maxTemp = Math.max(node.maxTemp, d.temperature);
        
        // Update humidity stats
        node.avgHum = ((node.avgHum * (node.totalReadings - 1)) + d.humidity) / node.totalReadings;
        node.minHum = Math.min(node.minHum, d.humidity);
        node.maxHum = Math.max(node.maxHum, d.humidity);
    });

    // Count registrations per node
    registrations.forEach(r => {
        if (nodeMap[r.node]) {
            nodeMap[r.node].registrations++;
        }
    });

    // Round averages
    Object.values(nodeMap).forEach(node => {
        node.avgTemp = Number(node.avgTemp.toFixed(2));
        node.avgHum = Number(node.avgHum.toFixed(2));
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
        activeNodes: nodes.filter(n => {
            if (!n.lastSeen) return false;
            const lastSeen = new Date(n.lastSeen);
            const now = new Date();
            const diffMinutes = (now - lastSeen) / 1000 / 60;
            return diffMinutes < 5; // Changed to 5 minutes for more realistic detection
        }).length,
        avgTemperature: nodes.length > 0 
            ? (nodes.reduce((sum, n) => sum + n.avgTemp, 0) / nodes.length).toFixed(2)
            : 0,
        avgHumidity: nodes.length > 0 
            ? (nodes.reduce((sum, n) => sum + n.avgHum, 0) / nodes.length).toFixed(2)
            : 0
    };
}

/* ---------- API ENDPOINTS ---------- */

// Get latest sensor readings
app.get("/api/sensor-data", (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const data = getLatestSensorData(limit);
    console.log(`📊 Fetched ${data.length} sensor readings`);
    res.json(data);
});

// Get node statistics
app.get("/api/nodes", (req, res) => {
    const stats = getNodeStats();
    console.log(`🖥️  Fetched stats for ${stats.length} nodes`);
    res.json(stats);
});

// Get specific node details
app.get("/api/nodes/:id", (req, res) => {
    const nodeId = parseInt(req.params.id);
    const stats = getNodeStats();
    const node = stats.find(n => n.id === nodeId);
    
    if (node) {
        res.json(node);
    } else {
        res.status(404).json({ error: "Node not found" });
    }
});

// Get registration history
app.get("/api/registrations", (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const history = getRegistrationHistory(limit);
    res.json(history);
});

// Get error log
app.get("/api/errors", (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const errors = getErrorLog(limit);
    res.json(errors);
});

// Get system overview
app.get("/api/overview", (req, res) => {
    const overview = getSystemOverview();
    res.json(overview);
});

// Health check endpoint
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        logFile: fs.existsSync(LOG_FILE) ? "found" : "missing"
    });
});

/* ---------- START SERVER ---------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log("✅ Enhanced IoT Backend Server");
    console.log(`🌐 Server running at http://localhost:${PORT}`);
    console.log(`📂 Log file: ${LOG_FILE}`);
    console.log(`📊 API Endpoints:`);
    console.log(`   - GET /api/sensor-data?limit=50`);
    console.log(`   - GET /api/nodes`);
    console.log(`   - GET /api/nodes/:id`);
    console.log(`   - GET /api/registrations`);
    console.log(`   - GET /api/errors`);
    console.log(`   - GET /api/overview`);
    console.log(`   - GET /api/health`);
    console.log(`\n⏰ Waiting for requests...`);
});