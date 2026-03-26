const db = require("../src/db");
const {
  buildDashboard,
  cancelReservation,
  createReservation,
  updateRoomSlotSettings,
} = require("../src/reservationService");

const TEST_DATE = "2026-03-29";

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cleanup() {
  db.prepare("DELETE FROM reservations WHERE reservation_date = ?").run(TEST_DATE);
  db.prepare("DELETE FROM room_slot_settings WHERE reservation_date = ?").run(TEST_DATE);
}

cleanup();

try {
  let dashboard = buildDashboard(TEST_DATE);
  let slotTwo = dashboard.slotDetails.find((slot) => slot.id === 2);
  let slotFive = dashboard.slotDetails.find((slot) => slot.id === 5);

  expect(dashboard.schedule.rooms.length === 9, "Expected 9 rooms in the schedule.");
  expect(slotTwo && slotTwo.remainingRooms === 9, "Expected 2타임 to start with 9 open rooms.");
  expect(slotFive && slotFive.bookable === false, "Expected 5타임 to default to fixed use.");

  updateRoomSlotSettings({
    reservationDate: TEST_DATE,
    slotId: 2,
    settings: [
      { roomId: 1, mode: "fixed", label: "비전연구소" },
      { roomId: 2, mode: "closed", label: "" },
      { roomId: 3, mode: "available", label: "" },
      { roomId: 4, mode: "available", label: "" },
      { roomId: 5, mode: "available", label: "" },
      { roomId: 6, mode: "available", label: "" },
      { roomId: 7, mode: "available", label: "" },
      { roomId: 8, mode: "available", label: "" },
      { roomId: 9, mode: "available", label: "" },
    ],
  });

  dashboard = buildDashboard(TEST_DATE);
  slotTwo = dashboard.slotDetails.find((slot) => slot.id === 2);

  expect(slotTwo && slotTwo.reservableRoomCount === 7, "Expected 2타임 to expose 7 reservable rooms.");
  expect(
    slotTwo && slotTwo.rooms.find((room) => room.roomId === 1 && room.status === "fixed"),
    "Expected room 1 in 2타임 to become fixed.",
  );
  expect(
    slotTwo && slotTwo.rooms.find((room) => room.roomId === 2 && room.status === "closed"),
    "Expected room 2 in 2타임 to become closed.",
  );

  const confirmedReservations = [3, 4, 5, 6, 7, 8, 9].map((roomId) =>
    createReservation({
      reservationDate: TEST_DATE,
      slotId: 2,
      roomId,
      communityName: `공동체-${roomId}`,
      requesterName: `신청자-${roomId}`,
      attendees: 6,
      contact: "010-0000-0000",
      note: "",
      joinWaitlist: "",
    }),
  );

  expect(
    confirmedReservations.every((reservation) => reservation.status === "confirmed"),
    "Expected all selected rooms to confirm immediately.",
  );

  const waitlisted = createReservation({
    reservationDate: TEST_DATE,
    slotId: 2,
    roomId: "",
    communityName: "대기공동체",
    requesterName: "대기신청",
    attendees: 8,
    contact: "",
    note: "",
    joinWaitlist: "1",
  });

  expect(waitlisted.status === "waitlisted", "Expected a waitlist registration when 2타임 is full.");
  expect(waitlisted.waitlistPosition === 1, "Expected first waitlist position to be 1.");

  const reservationIdToCancel = db
    .prepare(
      `
        SELECT id
        FROM reservations
        WHERE reservation_date = ?
          AND slot_id = 2
          AND room_id = 3
          AND status = 'confirmed'
        LIMIT 1
      `,
    )
    .pluck()
    .get(TEST_DATE);
  const cancellation = cancelReservation(Number(reservationIdToCancel));

  expect(Boolean(cancellation && cancellation.promoted), "Expected waitlist promotion after cancellation.");
  expect(
    cancellation.promoted && cancellation.promoted.communityName === "대기공동체",
    "Expected the first waitlisted team to be promoted.",
  );

  console.log("Verification passed.");
} finally {
  cleanup();
}
