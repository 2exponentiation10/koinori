const { buildDashboard } = require("../src/reservationService");

const dashboard = buildDashboard("2026-03-29");

if (dashboard.schedule.rooms.length !== 9) {
  throw new Error("Expected 9 rooms in the schedule.");
}

if (!dashboard.slotOverview.some((slot) => slot.id === 1 && slot.remainingRooms === 9)) {
  throw new Error("Expected slot overview to expose open availability.");
}

if (dashboard.summary.totalCapacity !== 45) {
  throw new Error("Expected total reservable capacity to be 45.");
}

console.log("Verification passed.");
