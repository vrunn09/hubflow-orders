const TRAINS = [
  ["12951", "Mumbai Rajdhani"],
  ["12002", "Bhopal Shatabdi"],
  ["12627", "Karnataka Express"],
  ["22691", "KSR Bengaluru Rajdhani"],
  ["12305", "Howrah Rajdhani"],
  ["12259", "Sealdah Duronto"],
] as const;
const NAMES = ["Aarav Sharma", "Priya Nair", "Rohan Gupta", "Ananya Iyer", "Vikram Singh", "Meera Joshi", "Kabir Khan", "Sneha Reddy"];
const MENU = [
  ["Veg Thali", 220], ["Paneer Butter Masala", 260], ["Chicken Biryani", 290], ["Dal Makhani", 180],
  ["Butter Naan", 45], ["Jeera Rice", 140], ["Masala Dosa", 150], ["Gulab Jamun (2 pc)", 80], ["Masala Chai", 30],
] as const;
const DEFAULT_STATIONS = ["Bhopal Jn (BPL)", "Nagpur (NGP)", "Itarsi Jn (ET)", "Jhansi Jn (VGLJ)"];

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const rint = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export function mockRailOrder(stations: string[]) {
  const [num, name] = pick(TRAINS);
  const items = Array.from({ length: rint(1, 4) }, () => {
    const [n, p] = pick(MENU);
    return { name: n, qty: rint(1, 3), price: p };
  });
  const deliverBy = new Date(Date.now() + rint(35, 120) * 60_000);
  return {
    id: `${Date.now().toString(36)}${rint(100, 999)}`,
    passenger: { name: pick(NAMES), mobile: `9${rint(100000000, 999999999)}` },
    train: { number: num, name },
    journeyDate: new Date().toISOString().slice(0, 10),
    station: pick(stations.length ? stations : DEFAULT_STATIONS),
    coach: `${pick(["B", "S", "A", "H"])}${rint(1, 9)}`,
    berth: String(rint(1, 72)),
    items,
    payment: pick(["COD", "UPI", "PREPAID"]),
    eta: deliverBy.toISOString(),
  };
}
