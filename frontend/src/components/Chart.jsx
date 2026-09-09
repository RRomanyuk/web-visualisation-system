import { useEffect, useRef } from "react";
import Plotly from "plotly.js-basic-dist-min";

const BASE_LAYOUT = {
  autosize: true,
  margin: { t: 30, r: 20, b: 70, l: 60 },
  font: { family: "system-ui, sans-serif", size: 12 },
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  colorway: ["#2b6cb0", "#dd6b20", "#38a169", "#805ad5", "#d53f8c", "#00a3c4"],
};

export default function Chart({ traces, layout, height = 380 }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    Plotly.react(el, traces, { ...BASE_LAYOUT, ...layout }, {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ["lasso2d", "select2d"],
    });
  }, [traces, layout]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) Plotly.purge(el);
    };
  }, []);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
