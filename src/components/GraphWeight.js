import React from "react";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function GraphWeight({ data }) {
  const chartData = {
    labels: data.map(d => d.date),
    datasets: [{
      label: "Poids (kg)",
      data: data.map(d => d.weight),
      borderColor: "#3b5d3b",
      backgroundColor: "rgba(59,93,59,0.2)",
      tension: 0.3
    }]
  };

  const options = {
    responsive: true,
    plugins: { legend: { position: "top" }, title: { display: true, text: "Suivi du poids" } }
  };

  return <Line data={chartData} options={options} />;
}