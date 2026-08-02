export function classifyExpoReceipt(receipt) {
  if (!receipt) return { state: "pending", code: null, message: null };
  if (receipt.status === "ok") return { state: "delivered", code: "DELIVERED", message: null };
  const code = String(receipt.details?.error || "ERROR").slice(0, 100);
  return { state: code === "DeviceNotRegistered" ? "expired" : "failed", code, message: String(receipt.message || "Expo receipt failed").slice(0, 1000) };
}
