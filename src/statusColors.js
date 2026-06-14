// Shared row-highlight logic used by BOTH the master sheet and the team sheet,
// so highlighting stays consistent. Master status wins over process status.
export function rowBg(masterStatus, processStatus, colors) {
  if (!colors) return "";
  if (masterStatus && colors[masterStatus]) return colors[masterStatus];   // priority: sheet tổng
  if (processStatus && colors[processStatus]) return colors[processStatus]; // fallback: trạng thái xử lý
  return "";
}
