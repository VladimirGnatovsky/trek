import React from "react";

const BRAND_COLORS = {
  BTC: "#f7931a", ETH: "#627eea", SOL: "#111111", USDT: "#26a17b", USDC: "#2775ca",
  BNB: "#f3ba2f", XRP: "#23292f", ADA: "#0d1e30", DOGE: "#c2a633", AVAX: "#e84142",
};

export default function CryptoIcon({ symbol = "", size = 34, className = "" }) {
  const code = String(symbol).toUpperCase();
  const common = { width: size, height: size, viewBox: "0 0 32 32", role: "img", "aria-label": `${code || "Crypto"} logo`, className };
  const background = <circle cx="16" cy="16" r="16" fill={BRAND_COLORS[code] || "#26343a"} />;
  let mark;
  if (code === "BTC") mark = <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 8h7.2a4 4 0 0 1 0 8H11m0 0h8.1a4 4 0 0 1 0 8H11M14 6v20m4-20v2m0 16v2" /></g>;
  else if (code === "ETH") mark = <g fill="#fff"><path opacity=".72" d="M16 4 8.5 16 16 12.5 23.5 16z" /><path d="M16 12.5 8.5 16 16 20.4 23.5 16z" /><path opacity=".82" d="m8.5 17.5 7.5 10 7.5-10-7.5 4.3z" /></g>;
  else if (code === "SOL") mark = <g fill="none" strokeLinecap="round" strokeWidth="3"><path stroke="#9945ff" d="m9 8 15 0-3 3H6z" /><path stroke="#14f195" d="m8 14 15 0-3 3H5z" /><path stroke="#00d1ff" d="m9 20 15 0-3 3H6z" /></g>;
  else if (code === "USDT") mark = <g fill="#fff"><path d="M7 8h18v4.2h-6.4v2.1c4.2.2 7.4 1 7.4 2s-3.2 1.9-7.4 2v7.2h-5.2v-7.2C9.2 18.1 6 17.3 6 16.3s3.2-1.8 7.4-2v-2.1H7z" /><path fill="#26a17b" d="M8.4 16.3c1.3.6 4.2 1 7.6 1s6.3-.4 7.6-1c-1.3-.6-4.2-1-7.6-1s-6.3.4-7.6 1" /></g>;
  else if (code === "USDC") mark = <g fill="none" stroke="#fff" strokeLinecap="round"><circle cx="16" cy="16" r="8.5" strokeWidth="1.8" strokeDasharray="14 3" /><path strokeWidth="1.8" d="M18.8 12.2c-.8-.7-1.7-1-2.8-1-1.7 0-3 .9-3 2.2 0 3.6 6.2 1.2 6.2 4.7 0 1.5-1.4 2.6-3.3 2.6-1.2 0-2.3-.4-3.1-1.2M16 9v2m0 10v2" /></g>;
  else if (code === "BNB") mark = <g fill="#fff"><path d="m16 5 4 4-2.3 2.3-1.7-1.7-1.7 1.7L12 9zm-6 6 2.3 2.3-2.7 2.7 2.7 2.7L10 21l-5-5zm12 0 5 5-5 5-2.3-2.3 2.7-2.7-2.7-2.7zM16 12l4 4-4 4-4-4zm0 10.4 1.7-1.7L20 23l-4 4-4-4 2.3-2.3z" /></g>;
  else if (code === "XRP") mark = <g fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round"><path d="M8 9c1.5 0 2.2.4 3.3 1.6l3.2 3.3c.8.8 2.2.8 3 0l3.2-3.3C21.8 9.4 22.5 9 24 9M8 23c1.5 0 2.2-.4 3.3-1.6l3.2-3.3c.8-.8 2.2-.8 3 0l3.2 3.3c1.1 1.2 1.8 1.6 3.3 1.6" /></g>;
  else if (code === "ADA") mark = <g fill="#fff">{[[16,16,2],[16,8,1.5],[16,24,1.5],[8,16,1.5],[24,16,1.5],[10.4,10.4,1.2],[21.6,10.4,1.2],[10.4,21.6,1.2],[21.6,21.6,1.2],[5.5,10,1],[26.5,10,1],[5.5,22,1],[26.5,22,1]].map(([cx,cy,r], index) => <circle key={index} cx={cx} cy={cy} r={r} />)}</g>;
  else if (code === "DOGE") mark = <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 7h5.2c5.2 0 8 3.3 8 9s-2.8 9-8 9H11zM8 15h10" /></g>;
  else if (code === "AVAX") mark = <g fill="#fff"><path d="m15.3 6.5-8 14.2c-.9 1.6-.2 3 1.7 3h4.2c1.4 0 2.2-.7 2.9-1.9l3.5-6.2c.7-1.2.7-2.1 0-3.3l-2.2-3.9c-.7-1.3-1.4-2-2.1-1.9M22 19.1l-2.1 3.7c-.4.7 0 1 .7 1H25c.8 0 1.1-.4.7-1.1l-2.2-3.7c-.4-.7-1.1-.7-1.5.1" /></g>;
  else mark = <text x="16" y="20" textAnchor="middle" fill="#fff" fontFamily="Arial, sans-serif" fontSize="11" fontWeight="800">{code.slice(0, 3)}</text>;
  return <svg {...common}>{background}{mark}</svg>;
}
