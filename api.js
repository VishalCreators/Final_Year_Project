const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());

const LOG_FILE = "shared_data.txt";

/* ---------- READ LAST SENSOR DATA ---------- */
function readLatestData() {
    if (!fs.existsSync(LOG_FILE)) return [];

    const lines = fs.readFileSync(LOG_FILE, "utf8")
        .trim()
        .split("\n")
        .reverse();

    const result = [];

    for (let line of lines) {
        if (line.includes("DATA ->")) {
            const match = line.match(
                /\[(.*?)\] Node(\d+) DATA -> DATA:TEMP=([\d.]+) HUM=([\d.]+)/
            );

            if (match) {
                result.push({
                    time: match[1],
                    node: Number(match[2]),
                    temperature: Number(match[3]),
                    humidity: Number(match[4])
                });
            }
        }

        if (result.length >= 10) break; // last 10 records
    }

    return result.reverse();
}

/* ---------- API ENDPOINT ---------- */
app.get("/api/sensor-data", (req, res) => {
    const data = readLatestData();
    res.json(data);
});

/* ---------- START SERVER ---------- */
app.listen(5000, () => {
    console.log("✅ Node API running at http://localhost:5000");
});
