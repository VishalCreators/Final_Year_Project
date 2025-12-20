import { useEffect, useState } from "react";

export default function Dashboard() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchData = () => {
      fetch("http://localhost:5000/api/sensor-data")
        .then(res => res.json())
        .then(setData)
        .catch(console.error);
    };

    fetchData();
    const timer = setInterval(fetchData, 5000); // every 5 sec

    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <h2>📡 Live Sensor Dashboard</h2>

      {data.map((d, i) => (
        <div key={i}>
          🕒 {d.time} | Node {d.node} |
          🌡 {d.temperature}°C |
          💧 {d.humidity}%
        </div>
      ))}
    </div>
  );
}
