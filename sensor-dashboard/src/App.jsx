import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, ReferenceLine, Area, AreaChart } from "recharts";

export default function Dashboard() {
  const [allData, setAllData] = useState([]);
  const [recentData, setRecentData] = useState([]);
  const [nodes, setNodes] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [viewMode, setViewMode] = useState("overview");
  const [floodAlerts, setFloodAlerts] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const allRes = await fetch("http://localhost:5000/api/sensor-data");
        const allSensorData = await allRes.json();

        const recentRes = await fetch("http://localhost:5000/api/sensor-data?limit=10");
        const recentSensorData = await recentRes.json();

        const nodeRes = await fetch("http://localhost:5000/api/nodes");
        const nodeStats = await nodeRes.json();

        setAllData(allSensorData);
        setRecentData(recentSensorData);
        setLastUpdate(new Date());

        const nodeMap = {};
        allSensorData.forEach(d => {
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
        calculateFloodAlerts(nodeMap);
      } catch (err) {
        console.error(err);
      }
    };

    fetchData();
    const timer = setInterval(fetchData, 5000);
    return () => clearInterval(timer);
  }, []);

  const calculateFloodAlerts = (nodeMap) => {
    const alerts = {};
    Object.values(nodeMap).forEach(node => {
      const reading = getLatestReading(node);
      if (reading) {
        const floodRiskIndex = (reading.water * 0.5) + (reading.soil * 0.3) + (reading.humidity * 0.2);
        const changeRate = calculateWaterChangeRate(node);
        
        alerts[node.id] = {
          level: reading.water >= 70 ? 'critical' : reading.water >= 50 ? 'warning' : 'safe',
          riskIndex: floodRiskIndex,
          changeRate: changeRate,
          isFlashFlood: changeRate > 5
        };
      }
    });
    setFloodAlerts(alerts);
  };

  const calculateWaterChangeRate = (node) => {
    if (!node || node.readings.length < 2) return 0;
    const recent = node.readings.slice(-2);
    const timeDiff = (new Date(recent[1].time.replace(" ", "T")) - new Date(recent[0].time.replace(" ", "T"))) / 60000;
    return timeDiff > 0 ? ((recent[1].water - recent[0].water) / timeDiff) : 0;
  };

  const getNodeStatus = (node) => {
    if (!node) return "offline";
    if (node.backendStatus === "offline") return "offline";
    if (node.backendStatus === "online") return "online";
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

  const getChartData = (nodeId, hours = 24) => {
    const nodeData = nodes[nodeId]?.readings || [];
    const now = new Date();
    const hoursAgo = new Date(now.getTime() - hours * 60 * 60 * 1000);
    
    return nodeData
      .filter(d => {
        const readingTime = new Date(d.time.replace(" ", "T"));
        return readingTime >= hoursAgo;
      })
      .map(d => {
        const readingTime = new Date(d.time.replace(" ", "T"));
        return {
          timestamp: readingTime.getTime(),
          time: readingTime.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          water: d.water,
          humidity: d.humidity,
          soil: d.soil,
          temperature: d.temperature,
          floodRisk: (d.water * 0.5) + (d.soil * 0.3) + (d.humidity * 0.2)
        };
      });
  };

  const getWaterChangeRateData = (nodeId) => {
    const data = getChartData(nodeId);
    return data.slice(1).map((d, i) => {
      const prev = data[i];
      const timeDiff = (d.timestamp - prev.timestamp) / 60000;
      return {
        time: d.time,
        changeRate: timeDiff > 0 ? ((d.water - prev.water) / timeDiff) : 0
      };
    });
  };

  const getNodeComparisonData = () => {
    return Object.values(nodes).map(node => {
      const reading = getLatestReading(node);
      return {
        node: `Node ${node.id}`,
        nodeId: node.id,
        water: reading?.water || 0,
        status: floodAlerts[node.id]?.level || 'safe'
      };
    });
  };

  const activeNodes = Object.values(nodes).filter(n => getNodeStatus(n) === "online").length;
  const totalNodes = Object.keys(nodes).length;
  const criticalNodes = Object.values(floodAlerts).filter(a => a.level === 'critical').length;
  const warningNodes = Object.values(floodAlerts).filter(a => a.level === 'warning').length;

  useEffect(() => {
    if (!selectedNode && Object.keys(nodes).length > 0) {
      setSelectedNode(Object.keys(nodes)[0]);
    }
  }, [nodes, selectedNode]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
        .pulse-dot {
          animation: pulse-dot 2s infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .blink-alert {
          animation: blink 1s infinite;
        }
        @keyframes pulse-alert {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.02); }
        }
        .pulse-alert {
          animation: pulse-alert 1.5s infinite;
        }
      `}</style>

      {/* HEADER */}
      <div className="bg-slate-800/50 border-b border-slate-700 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-2xl">
                🌊
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Flood Detection & Monitoring System</h1>
                <p className="text-sm text-slate-400">Real-Time Water Level Analysis & Early Warning</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-400">Last Updated</p>
                <p className="text-sm font-semibold text-white">
                  {lastUpdate ? lastUpdate.toLocaleTimeString() : "Loading..."}
                </p>
              </div>
              <a
                href="http://localhost:5000/api/download-log"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                📥 Export Data
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* CRITICAL ALERTS */}
        {criticalNodes > 0 && (
          <div className="mb-6 bg-red-900/30 border-2 border-red-500 rounded-xl p-4 pulse-alert">
            <div className="flex items-center gap-3">
              <span className="text-3xl blink-alert">🚨</span>
              <div>
                <h3 className="text-xl font-bold text-red-400">FLOOD ALERT - CRITICAL</h3>
                <p className="text-red-300">{criticalNodes} node(s) have exceeded danger threshold (70%)</p>
              </div>
            </div>
          </div>
        )}

        {/* STATS GRID */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <StatCard title="Total Nodes" value={totalNodes} icon="🖥️" color="bg-slate-700" />
          <StatCard title="Active Nodes" value={activeNodes} icon="📶" color="bg-green-700" />
          <StatCard title="Critical Alerts" value={criticalNodes} icon="🚨" color="bg-red-700" />
          <StatCard title="Warnings" value={warningNodes} icon="⚠️" color="bg-yellow-700" />
          <StatCard title="Safe Nodes" value={totalNodes - criticalNodes - warningNodes} icon="✅" color="bg-blue-700" />
          <StatCard 
            title="Avg Water Level" 
            value={allData.length ? (allData.reduce((s, d) => s + d.water, 0) / allData.length).toFixed(1) + "%" : "0%"} 
            icon="💧" 
            color="bg-cyan-700" 
          />
        </div>

        {/* VIEW MODE TOGGLE */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setViewMode("overview")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              viewMode === "overview"
                ? "bg-blue-600 text-white shadow-lg"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            📊 Overview
          </button>
          <button
            onClick={() => setViewMode("analytics")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              viewMode === "analytics"
                ? "bg-blue-600 text-white shadow-lg"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            📈 Detailed Analytics
          </button>
        </div>

        {/* OVERVIEW MODE */}
        {viewMode === "overview" && (
          <>
            {/* NODE CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              {Object.values(nodes).map(node => {
                const status = getNodeStatus(node);
                const reading = getLatestReading(node);
                const alert = floodAlerts[node.id];

                return (
                  <div 
                    key={node.id} 
                    className={`bg-slate-800/50 border rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all cursor-pointer ${
                      alert?.level === 'critical' ? 'border-red-500 border-2 pulse-alert' :
                      alert?.level === 'warning' ? 'border-yellow-500' : 'border-slate-700'
                    }`}
                    onClick={() => {
                      setSelectedNode(node.id);
                      setViewMode("analytics");
                    }}
                  >
                    <div className="flex justify-between items-center mb-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          status === "online" ? "bg-green-400 pulse-dot shadow-lg shadow-green-400/50" :
                          status === "warning" ? "bg-yellow-400" : "bg-red-400"
                        }`} />
                        <h3 className="text-white font-bold text-xl">Node {node.id}</h3>
                      </div>
                      <span className="text-3xl">
                        {status === "online" ? "📶" : "📴"}
                      </span>
                    </div>

                    {/* Flood Risk Badge */}
                    {alert && (
                      <div className={`mb-4 px-3 py-2 rounded-lg text-center font-bold ${
                        alert.level === 'critical' ? 'bg-red-900/50 text-red-300 blink-alert' :
                        alert.level === 'warning' ? 'bg-yellow-900/50 text-yellow-300' :
                        'bg-green-900/50 text-green-300'
                      }`}>
                        {alert.level === 'critical' ? '🚨 CRITICAL FLOOD RISK' :
                         alert.level === 'warning' ? '⚠️ WARNING LEVEL' : '✅ SAFE LEVEL'}
                      </div>
                    )}

                    {reading ? (
                      <div className="space-y-3">
                        <ReadingRow 
                          icon="💧" 
                          label="Water Level" 
                          value={`${reading.water}%`} 
                          color={reading.water >= 70 ? 'text-red-400' : reading.water >= 50 ? 'text-yellow-400' : 'text-blue-400'}
                        />
                        <ReadingRow icon="🌧️" label="Humidity" value={`${reading.humidity}%`} color="text-cyan-300" />
                        <ReadingRow icon="🌱" label="Soil Moisture" value={`${reading.soil}%`} color="text-green-300" />
                        <ReadingRow icon="🌡️" label="Temperature" value={`${reading.temperature}°C`} color="text-orange-300" />
                        
                        {alert && (
                          <div className="mt-4 pt-3 border-t border-slate-700">
                            <ReadingRow 
                              icon="⚡" 
                              label="Flood Risk Index" 
                              value={`${alert.riskIndex.toFixed(1)}%`} 
                              color={alert.riskIndex >= 60 ? 'text-red-400' : alert.riskIndex >= 40 ? 'text-yellow-400' : 'text-green-400'}
                            />
                            {alert.isFlashFlood && (
                              <div className="mt-2 bg-red-900/30 border border-red-500 rounded px-2 py-1 text-center">
                                <span className="text-xs text-red-300 font-bold blink-alert">⚡ FLASH FLOOD RISK</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-400 text-center mt-4">No data available</p>
                    )}

                    <div className="mt-5 pt-4 border-t border-slate-700">
                      <p className="text-xs text-slate-500">
                        Last seen: {node.lastSeen ? new Date(node.lastSeen.replace(" ", "T")).toLocaleString() : "N/A"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* NODE COMPARISON CHART */}
            <div className="mb-8">
              <ChartCard
                title="📊 Node-Wise Water Level Comparison - CONTROL ROOM VIEW"
                description="Real-time comparison of all monitoring stations"
              >
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={getNodeComparisonData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="node" stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                    <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} label={{ value: 'Water Level (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }} />
                    <Legend />
                    <ReferenceLine y={70} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" label={{ value: 'DANGER', fill: '#ef4444' }} />
                    <ReferenceLine y={50} stroke="#eab308" strokeWidth={2} strokeDasharray="5 5" label={{ value: 'WARNING', fill: '#eab308' }} />
                    <Bar dataKey="water" name="Water Level (%)">
                      {getNodeComparisonData().map((entry, index) => (
                        <Bar key={`cell-${index}`} fill={
                          entry.status === 'critical' ? '#ef4444' :
                          entry.status === 'warning' ? '#eab308' : '#3b82f6'
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* RECENT ACTIVITY TABLE */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
              <div className="bg-slate-800 px-6 py-4 border-b border-slate-700">
                <h2 className="text-xl font-bold text-white">📋 Recent Activity Log</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800/80">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Timestamp</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Node</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Water Level</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Humidity</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Soil</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Temperature</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {recentData.map((d, i) => {
                      const alert = floodAlerts[d.node];
                      return (
                        <tr key={i} className="hover:bg-slate-700/50 transition-colors">
                          <td className="px-6 py-3 text-sm text-slate-300">{d.time}</td>
                          <td className="px-6 py-3 text-sm font-semibold text-white">Node {d.node}</td>
                          <td className={`px-6 py-3 text-sm font-bold ${
                            d.water >= 70 ? 'text-red-400' : d.water >= 50 ? 'text-yellow-400' : 'text-blue-400'
                          }`}>{d.water}%</td>
                          <td className="px-6 py-3 text-sm text-cyan-400">{d.humidity}%</td>
                          <td className="px-6 py-3 text-sm text-green-400">{d.soil}%</td>
                          <td className="px-6 py-3 text-sm text-orange-400">{d.temperature}°C</td>
                          <td className="px-6 py-3 text-sm">
                            <span className={`inline-flex px-2 py-1 text-xs font-bold rounded ${
                              alert?.level === 'critical' ? 'bg-red-900/50 text-red-300 blink-alert' :
                              alert?.level === 'warning' ? 'bg-yellow-900/50 text-yellow-300' :
                              'bg-green-900/50 text-green-300'
                            }`}>
                              {alert?.level === 'critical' ? '🚨 CRITICAL' :
                               alert?.level === 'warning' ? '⚠️ WARNING' : '✅ SAFE'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ANALYTICS MODE */}
        {viewMode === "analytics" && (
          <div className="space-y-6">
            
            {/* NODE SELECTOR */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-4">📍 Select Monitoring Node</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Object.values(nodes).map(node => {
                  const alert = floodAlerts[node.id];
                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNode(node.id)}
                      className={`px-4 py-3 rounded-lg font-medium transition-all relative ${
                        selectedNode === node.id
                          ? "bg-blue-600 text-white shadow-lg"
                          : "bg-slate-700 text-white hover:bg-slate-600"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>Node {node.id}</span>
                        {alert && (
                          <div className={`w-2 h-2 rounded-full ${
                            alert.level === 'critical' ? 'bg-red-500 blink-alert' :
                            alert.level === 'warning' ? 'bg-yellow-500' : 'bg-green-500'
                          }`} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CHARTS */}
            {selectedNode && nodes[selectedNode] && (
              <>
                {/* 1. WATER LEVEL VS TIME */}
                <ChartCard
                  title="🌊 Water Level Over Time (Last 24 Hours) - PRIMARY FLOOD INDICATOR"
                  description="Critical threshold at 70% - Red zone indicates flood danger"
                  alert={floodAlerts[selectedNode]}
                >
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={getChartData(selectedNode)}>
                      <defs>
                        <linearGradient id="waterGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                      <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} label={{ value: 'Water Level (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }} />
                      <Legend />
                      <ReferenceLine y={70} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" label={{ value: 'DANGER THRESHOLD', fill: '#ef4444', fontWeight: 'bold' }} />
                      <ReferenceLine y={50} stroke="#eab308" strokeWidth={2} strokeDasharray="5 5" label={{ value: 'WARNING', fill: '#eab308' }} />
                      <Area type="monotone" dataKey="water" stroke="#3b82f6" strokeWidth={3} fill="url(#waterGradient)" name="Water Level (%)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 2. COMBINED FLOOD RISK ANALYSIS */}
                <ChartCard
                  title="📊 Combined Flood Risk Analysis - MULTI-PARAMETER MONITORING"
                  description="Integrated view: Water Level + Soil Saturation + Humidity"
                >
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={getChartData(selectedNode)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                      <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} label={{ value: 'Level (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }} />
                      <Legend />
                      <ReferenceLine y={70} stroke="#ef4444" strokeWidth={2} strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="water" stroke="#3b82f6" strokeWidth={3} dot={false} name="Water Level" />
                      <Line type="monotone" dataKey="soil" stroke="#10b981" strokeWidth={2} dot={false} name="Soil Moisture" />
                      <Line type="monotone" dataKey="humidity" stroke="#06b6d4" strokeWidth={2} dot={false} name="Humidity" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 3. FLOOD RISK INDEX */}
                <ChartCard
                  title="⚡ Flood Risk Index - PREDICTIVE ANALYSIS"
                  description="Calculated: (Water × 0.5) + (Soil × 0.3) + (Humidity × 0.2)"
                >
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={getChartData(selectedNode)}>
                      <defs>
                        <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#eab308" stopOpacity={0.2}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                      <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} label={{ value: 'Risk Index', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }} />
                      <Legend />
                      <ReferenceLine y={60} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" label={{ value: 'HIGH RISK', fill: '#ef4444', fontWeight: 'bold' }} />
                      <ReferenceLine y={40} stroke="#eab308" strokeWidth={2} strokeDasharray="5 5" label={{ value: 'MODERATE', fill: '#eab308' }} />
                      <Area type="monotone" dataKey="floodRisk" stroke="#f59e0b" strokeWidth={3} fill="url(#riskGradient)" name="Flood Risk Index" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 4. HUMIDITY ANALYSIS */}
                <ChartCard
                  title="💧 Humidity Over Time - EARLY WARNING INDICATOR"
                  description="High humidity indicates potential rainfall and water level rise"
                >
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={getChartData(selectedNode)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                      <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} label={{ value: 'Humidity (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }} />
                      <Legend />
                      <Line type="monotone" dataKey="humidity" stroke="#06b6d4" strokeWidth={3} dot={{ fill: '#06b6d4', r: 3 }} name="Humidity (%)" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 5. SOIL MOISTURE */}
                <ChartCard
                  title="🌱 Soil Moisture Over Time - GROUND SATURATION LEVEL"
                  description="High soil moisture + rising water = increased flood risk"
                >
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={getChartData(selectedNode)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                      <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} label={{ value: 'Soil Moisture (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }} />
                      <Legend />
                      <Line type="monotone" dataKey="soil" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 3 }} name="Soil Moisture (%)" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 6. WATER LEVEL CHANGE RATE */}
                <ChartCard
                  title="⚡ Water Level Change Rate - FLASH FLOOD DETECTION"
                  description="Monitors rate of water rise - Sudden spikes indicate flash flood danger"
                  alert={floodAlerts[selectedNode]?.isFlashFlood ? { level: 'critical' } : null}
                >
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={getWaterChangeRateData(selectedNode)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                      <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} label={{ value: 'ΔWater/min (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }} />
                      <Legend />
                      <ReferenceLine y={5} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" label={{ value: 'FLASH FLOOD THRESHOLD', fill: '#ef4444', fontWeight: 'bold' }} />
                      <Line type="monotone" dataKey="changeRate" stroke="#f59e0b" strokeWidth={3} dot={{ fill: '#f59e0b', r: 4 }} name="Change Rate (%/min)" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <div className={`${color} border border-slate-600 rounded-lg p-4 shadow-lg`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-slate-300">{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function ReadingRow({ icon, label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
    </div>
  );
}

function ChartCard({ title, description, children, alert }) {
  return (
    <div className={`bg-slate-800/50 border rounded-xl p-6 shadow-xl ${
      alert?.level === 'critical' ? 'border-red-500 border-2' : 'border-slate-700'
    }`}>
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
        {description && <p className="text-sm text-slate-400">{description}</p>}
        {alert?.level === 'critical' && (
          <div className="mt-2 bg-red-900/30 border border-red-500 rounded px-3 py-2">
            <span className="text-red-300 font-semibold">⚠️ CRITICAL LEVEL DETECTED</span>
          </div>
        )}
        
      </div>
      {children}
    </div>
  );
}