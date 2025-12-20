import { useEffect, useState } from "react";
import React from "react";
export default function Dashboard() {
  const [data, setData] = useState([]);
  const [nodes, setNodes] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const fetchData = () => {
      fetch("http://localhost:5000/api/sensor-data")
        .then(res => res.json())
        .then(newData => {
          setData(newData);
          setLastUpdate(new Date());
          
          // Organize data by nodes
          const nodeMap = {};
          newData.forEach(d => {
            if (!nodeMap[d.node]) {
              nodeMap[d.node] = {
                id: d.node,
                lastSeen: d.time,
                readings: []
              };
            }
            nodeMap[d.node].readings.push(d);
            nodeMap[d.node].lastSeen = d.time;
          });
          setNodes(nodeMap);
        })
        .catch(console.error);
    };
    
    fetchData();
    const timer = setInterval(fetchData, 5000);
    return () => clearInterval(timer);
  }, []);

  const getNodeStatus = (nodeData) => {
    if (!nodeData || nodeData.readings.length === 0) return "offline";
    
    // Parse the timestamp format: "2025-12-20 13:48:50"
    const lastSeenStr = nodeData.lastSeen;
    const lastReading = new Date(lastSeenStr.replace(' ', 'T'));
    const now = new Date();
    const diffMinutes = (now - lastReading) / 1000 / 60;
    
    console.log(`Node ${nodeData.id}: Last seen ${lastSeenStr}, diff: ${diffMinutes.toFixed(2)} minutes`);
    
    return diffMinutes < 5 ? "online" : diffMinutes < 10 ? "warning" : "offline";
  };

  const getLatestReading = (nodeData) => {
    if (!nodeData || nodeData.readings.length === 0) return null;
    return nodeData.readings[nodeData.readings.length - 1];
  };

  const activeNodes = Object.values(nodes).filter(n => getNodeStatus(n) === "online").length;
  const totalNodes = Object.keys(nodes).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .pulse-dot {
          animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center text-2xl">
                📡
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">IoT Sensor Network</h1>
                <p className="text-sm text-slate-400">Real-time environmental monitoring</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className="text-lg">🕐</span>
              {lastUpdate && `Updated ${lastUpdate.toLocaleTimeString()}`}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Total Nodes</span>
              <span className="text-2xl">🖥️</span>
            </div>
            <div className="text-3xl font-bold text-white">{totalNodes}</div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Active Nodes</span>
              <span className="text-2xl">📶</span>
            </div>
            <div className="text-3xl font-bold text-white">{activeNodes}</div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Avg Temperature</span>
              <span className="text-2xl">🌡️</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {data.length > 0 
                ? (data.reduce((sum, d) => sum + d.temperature, 0) / data.length).toFixed(1)
                : "0"}°C
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Avg Humidity</span>
              <span className="text-2xl">💧</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {data.length > 0 
                ? (data.reduce((sum, d) => sum + d.humidity, 0) / data.length).toFixed(1)
                : "0"}%
            </div>
          </div>
        </div>

        {/* Node Cards */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">🖥️</span> Sensor Nodes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.values(nodes).map(node => {
              const status = getNodeStatus(node);
              const reading = getLatestReading(node);
              
              return (
                <div key={node.id} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        status === "online" ? "bg-green-500 pulse-dot" : 
                        status === "warning" ? "bg-yellow-500" : "bg-red-500"
                      }`}></div>
                      <h3 className="text-lg font-semibold text-white">Node {node.id}</h3>
                    </div>
                    <span className="text-xl">
                      {status === "online" ? "📶" : "📵"}
                    </span>
                  </div>

                  {reading ? (
                    <>
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-slate-400 text-sm">
                            <span className="text-base">🌡️</span>
                            Temperature
                          </div>
                          <span className="text-white font-semibold">{reading.temperature}°C</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-slate-400 text-sm">
                            <span className="text-base">💧</span>
                            Humidity
                          </div>
                          <span className="text-white font-semibold">{reading.humidity}%</span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 border-t border-slate-700 pt-3">
                        Last seen: {new Date(node.lastSeen.replace(' ', 'T')).toLocaleTimeString()}
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-500 text-sm">No data available</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity Log */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">📊</span> Recent Activity
          </h2>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-4 text-slate-400 font-medium text-sm">Timestamp</th>
                    <th className="text-left p-4 text-slate-400 font-medium text-sm">Node</th>
                    <th className="text-left p-4 text-slate-400 font-medium text-sm">Temperature</th>
                    <th className="text-left p-4 text-slate-400 font-medium text-sm">Humidity</th>
                    <th className="text-left p-4 text-slate-400 font-medium text-sm">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slice().reverse().slice(0, 10).map((d, i) => (
                    <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                      <td className="p-4 text-slate-300 text-sm">{d.time}</td>
                      <td className="p-4 text-white font-medium">Node {d.node}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 text-orange-400">
                          <span className="text-base">🌡️</span>
                          {d.temperature}°C
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 text-cyan-400">
                          <span className="text-base">💧</span>
                          {d.humidity}%
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}