import React, { useEffect, useState } from "react";

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [nodes, setNodes] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Sensor readings
        const sensorRes = await fetch("http://localhost:5000/api/sensor-data");
        const sensorData = await sensorRes.json();

        // Node status (online/offline from backend)
        const nodeRes = await fetch("http://localhost:5000/api/nodes");
        const nodeStats = await nodeRes.json();

        setData(sensorData);
        setLastUpdate(new Date());

        const nodeMap = {};

        // Build node data from sensor readings
        sensorData.forEach(d => {
          if (!nodeMap[d.node]) {
            nodeMap[d.node] = {
              id: d.node,
              readings: [],
              lastSeen: d.time,
              backendStatus: "online"
            };
          }
          nodeMap[d.node].readings.push(d);
          nodeMap[d.node].lastSeen = d.time;
        });

        // Merge backend node status (IMMEDIATE DISCONNECT)
        nodeStats.forEach(n => {
          if (!nodeMap[n.id]) {
            nodeMap[n.id] = {
              id: n.id,
              readings: [],
              lastSeen: n.lastSeen
            };
          }
          nodeMap[n.id].backendStatus = n.status;
          nodeMap[n.id].lastEvent = n.lastEvent;
        });

        setNodes(nodeMap);
      } catch (err) {
        console.error(err);
      }
    };

    fetchData();
    const timer = setInterval(fetchData, 5000);
    return () => clearInterval(timer);
  }, []);

  const getNodeStatus = (node) => {
    if (!node) return "offline";
    if (node.backendStatus === "offline") return "offline";
    if (!node.lastSeen) return "offline";

    const lastReading = new Date(node.lastSeen.replace(" ", "T"));
    const diffMin = (Date.now() - lastReading) / 1000 / 60;

    if (diffMin < 5) return "online";
    if (diffMin < 10) return "warning";
    return "offline";
  };

  const getLatestReading = (node) => {
    if (!node || node.readings.length === 0) return null;
    return node.readings[node.readings.length - 1];
  };

  const activeNodes = Object.values(nodes).filter(
    n => getNodeStatus(n) === "online"
  ).length;

  const totalNodes = Object.keys(nodes).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .pulse-dot {
          animation: pulse-dot 2s infinite;
        }
      `}</style>

      {/* Header */}
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between">
          <h1 className="text-2xl font-bold text-white">IoT Sensor Network</h1>
          <span className="text-slate-400">
            {lastUpdate && `Updated ${lastUpdate.toLocaleTimeString()}`}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Stat title="Total Nodes" value={totalNodes} icon="🖥️" />
          <Stat title="Active Nodes" value={activeNodes} icon="📶" />
          <Stat
            title="Avg Temp"
            value={
              data.length
                ? (data.reduce((s, d) => s + d.temperature, 0) / data.length).toFixed(1) + "°C"
                : "0°C"
            }
            icon="🌡️"
          />
          <Stat
            title="Avg Humidity"
            value={
              data.length
                ? (data.reduce((s, d) => s + d.humidity, 0) / data.length).toFixed(1) + "%"
                : "0%"
            }
            icon="💧"
          />
        </div>

        {/* Node Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {Object.values(nodes).map(node => {
            const status = getNodeStatus(node);
            const reading = getLatestReading(node);

            return (
              <div key={node.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                <div className="flex justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      status === "online" ? "bg-green-500 pulse-dot" :
                      status === "warning" ? "bg-yellow-500" : "bg-red-500"
                    }`} />
                    <h3 className="text-white font-semibold">Node {node.id}</h3>
                  </div>
                  <span>{status === "online" ? "📶" : "📵"}</span>
                </div>

                {reading ? (
                  <>
                    <p className="text-slate-300">🌡️ {reading.temperature}°C</p>
                    <p className="text-slate-300">💧 {reading.humidity}%</p>
                    <p className="text-xs text-slate-500 mt-2">
                      Last seen: {new Date(node.lastSeen.replace(" ", "T")).toLocaleTimeString()}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-500">No data</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Recent Activity */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="p-3 text-left text-slate-400">Time</th>
                <th className="p-3 text-left text-slate-400">Node</th>
                <th className="p-3 text-left text-slate-400">Temp</th>
                <th className="p-3 text-left text-slate-400">Hum</th>
                <th className="p-3 text-left text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(-10).reverse().map((d, i) => {
                const status = nodes[d.node]?.backendStatus === "offline" ? "Inactive" : "Active";
                return (
                  <tr key={i} className="border-t border-slate-700">
                    <td className="p-3 text-slate-300">{d.time}</td>
                    <td className="p-3 text-white">Node {d.node}</td>
                    <td className="p-3 text-orange-400">{d.temperature}°C</td>
                    <td className="p-3 text-cyan-400">{d.humidity}%</td>
                    <td className={`p-3 font-medium ${
                      status === "Active" ? "text-green-400" : "text-red-400"
                    }`}>
                      {status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

function Stat({ title, value, icon }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
      <div className="flex justify-between text-slate-400 mb-1">
        <span>{title}</span>
        <span>{icon}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}