const { Settings } = require("luxon");

const db = require("../src/db");
const { buildPublicAppState } = require("../src/publicAppState");
const {
  buildDashboard,
  cancelReservation,
  cancelReservationByLookup,
  createReservation,
  updateRoomMetadata,
  updateRoomSlotSettings,
} = require("../src/reservationService");

const TEST_DATE = "2026-03-29";
const FUTURE_DATE = "2026-04-05";
const NEXT_FUTURE_DATE = "2026-04-12";

Settings.now = () => Date.parse("2026-03-26T03:00:00.000Z");

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cleanup() {
  db.prepare("DELETE FROM room_metadata").run();
  db.prepare("DELETE FROM reservations WHERE reservation_date = ?").run(TEST_DATE);
  db.prepare("DELETE FROM room_slot_settings WHERE reservation_date = ?").run(TEST_DATE);
  db.prepare("DELETE FROM reservations WHERE reservation_date = ?").run(FUTURE_DATE);
  db.prepare("DELETE FROM room_slot_settings WHERE reservation_date = ?").run(FUTURE_DATE);
  db.prepare("DELETE FROM reservations WHERE reservation_date = ?").run(NEXT_FUTURE_DATE);
  db.prepare("DELETE FROM room_slot_settings WHERE reservation_date = ?").run(NEXT_FUTURE_DATE);
}

cleanup();

try {
  updateRoomMetadata({
    rooms: [
      {
        roomId: 1,
        capacity: 6,
        description: "예배 전후 소그룹 모임에 적합한 방",
        imageUrl: "https://example.com/room-1.jpg",
      },
      { roomId: 2, capacity: 4, description: "조용한 대화용 방" },
      { roomId: 3, capacity: 8, description: "팀 미팅용 넓은 방" },
    ],
  });

  let dashboard = buildDashboard(TEST_DATE);
  let slotTwo = dashboard.slotDetails.find((slot) => slot.id === 2);

  expect(dashboard.schedule.rooms.length === 9, "Expected 9 rooms in the schedule.");
  expect(
    dashboard.schedule.rooms.find((room) => room.id === 1)?.capacity === 6,
    "Expected room metadata to expose capacity.",
  );
  expect(
    dashboard.schedule.rooms.find((room) => room.id === 1)?.description === "예배 전후 소그룹 모임에 적합한 방",
    "Expected room metadata to expose description.",
  );
  expect(
    dashboard.schedule.rooms.find((room) => room.id === 1)?.imageUrl === "https://example.com/room-1.jpg",
    "Expected room metadata to expose image URL.",
  );
  expect(slotTwo && slotTwo.remainingRooms === 9, "Expected 2타임 to start with 9 open rooms.");

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
    slotTwo && slotTwo.rooms.find((room) => room.roomId === 3 && room.actionType === "reserve"),
    "Expected room 3 in 2타임 to be reservable.",
  );

  let futureDashboard = buildDashboard(FUTURE_DATE);
  let futureSlotTwo = futureDashboard.slotDetails.find((slot) => slot.id === 2);

  expect(
    futureSlotTwo && futureSlotTwo.rooms.find((room) => room.roomId === 1 && room.mode === "fixed"),
    "Expected fixed room settings to carry forward to the next Sunday.",
  );
  expect(
    futureSlotTwo && futureSlotTwo.rooms.find((room) => room.roomId === 2 && room.mode === "closed"),
    "Expected closed room settings to carry forward to the next Sunday.",
  );

  updateRoomSlotSettings({
    reservationDate: FUTURE_DATE,
    slotId: 2,
    settings: Array.from({ length: 9 }, (_, index) => ({
      roomId: index + 1,
      mode: "available",
      label: "",
    })),
  });

  futureDashboard = buildDashboard(FUTURE_DATE);
  futureSlotTwo = futureDashboard.slotDetails.find((slot) => slot.id === 2);
  let nextFutureDashboard = buildDashboard(NEXT_FUTURE_DATE);
  let nextFutureSlotTwo = nextFutureDashboard.slotDetails.find((slot) => slot.id === 2);

  expect(
    futureSlotTwo && futureSlotTwo.rooms.every((room) => room.mode === "available"),
    "Expected an explicit available setting to release previously fixed rooms.",
  );
  expect(
    nextFutureSlotTwo && nextFutureSlotTwo.rooms.every((room) => room.mode === "available"),
    "Expected released room settings to carry forward after being changed back to available.",
  );

  const firstConfirmed = createReservation({
    reservationDate: TEST_DATE,
    slotId: 2,
    roomId: 3,
    communityName: "공동체-3",
    requesterName: "신청자-3",
    attendees: 6,
    contact: "010-0000-0000",
    note: "",
  });

  expect(firstConfirmed.status === "confirmed", "Expected room 3 to confirm immediately.");

  const roomSpecificWaitlist = createReservation({
    reservationDate: TEST_DATE,
    slotId: 2,
    roomId: 3,
    communityName: "대기공동체",
    requesterName: "대기신청",
    attendees: 8,
    contact: "010-2222-2222",
    note: "",
  });

  expect(
    roomSpecificWaitlist.status === "waitlist_confirm_required",
    "Expected a waitlist confirmation prompt for an already reserved room.",
  );
  expect(roomSpecificWaitlist.waitlistPosition === 1, "Expected first room waitlist position to be 1.");

  dashboard = buildDashboard(TEST_DATE);
  slotTwo = dashboard.slotDetails.find((slot) => slot.id === 2);
  const roomThree = slotTwo && slotTwo.rooms.find((room) => room.roomId === 3);

  expect(roomThree && roomThree.waitlistCount === 0, "Expected prompt stage not to create a waitlist yet.");

  const confirmedWaitlist = createReservation({
    reservationDate: TEST_DATE,
    slotId: 2,
    roomId: 3,
    communityName: "대기공동체",
    requesterName: "대기신청",
    attendees: 8,
    contact: "010-2222-2222",
    note: "",
    waitlistConsent: "1",
  });

  expect(confirmedWaitlist.status === "waitlisted", "Expected waitlist registration after confirmation.");
  expect(confirmedWaitlist.waitlistPosition === 1, "Expected confirmed waitlist position to be 1.");
  expect(confirmedWaitlist.reservationNumber, "Expected waitlisted reservation to expose a reservation number.");

  dashboard = buildDashboard(TEST_DATE);
  slotTwo = dashboard.slotDetails.find((slot) => slot.id === 2);
  const refreshedRoomThree = slotTwo && slotTwo.rooms.find((room) => room.roomId === 3);

  expect(
    refreshedRoomThree && refreshedRoomThree.waitlistCount === 1,
    "Expected room 3 waitlist count to be exposed after confirmation.",
  );
  expect(
    dashboard.schedule.waitlistedReservations.length === 1,
    "Expected dashboard to expose the waitlisted reservation list.",
  );

  const directLookupReservation = createReservation({
    reservationDate: TEST_DATE,
    slotId: 3,
    roomId: 4,
    communityName: "취소테스트",
    requesterName: "취소신청",
    attendees: 7,
    contact: "010-4444-1234",
    note: "",
  });

  expect(directLookupReservation.status === "confirmed", "Expected direct lookup reservation to confirm.");

  const lookupCancellation = cancelReservationByLookup({
    reservationNumber: directLookupReservation.reservationNumber,
    contactLastFour: "1234",
  });

  expect(Boolean(lookupCancellation), "Expected lookup cancellation to succeed.");
  expect(
    lookupCancellation.cancelled.communityName === "취소테스트",
    "Expected lookup cancellation to target the matching reservation.",
  );

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

  expect(Boolean(cancellation && cancellation.promoted), "Expected room-specific waitlist promotion.");
  expect(
    cancellation.promoted && cancellation.promoted.communityName === "대기공동체",
    "Expected the room-specific waitlist to be promoted after cancellation.",
  );

  const futureState = buildPublicAppState({
    dateInput: FUTURE_DATE,
    initialScreen: "form",
  });
  const futureStatusState = buildPublicAppState({
    dateInput: FUTURE_DATE,
    initialScreen: "status",
  });

  expect(
    futureState.initialScreen === "intro",
    "Expected future booking screens to stay blocked before the booking window opens.",
  );
  expect(
    futureStatusState.initialScreen === "status",
    "Expected future reservation status to remain accessible before the booking window opens.",
  );
  expect(futureState.bookingCloseAtIso, "Expected the public state to include a booking close time.");

  const futureInsert = db
    .prepare(
      `
        INSERT INTO reservations (
          reservation_date,
          slot_id,
          room_id,
          community_name,
          requester_name,
          attendees,
          contact,
          note,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
      `,
    )
    .run(
      FUTURE_DATE,
      2,
      3,
      "미래예약",
      "확인용",
      6,
      "010-7777-4321",
      "",
      "2026-03-28T12:00:00.000+09:00",
      "2026-03-28T12:00:00.000+09:00",
    );

  let futureCancelBlocked = false;

  try {
    cancelReservationByLookup({
      reservationNumber: String(futureInsert.lastInsertRowid).padStart(4, "0"),
      contactLastFour: "4321",
    });
  } catch (error) {
    futureCancelBlocked =
      error.message === "예약과 취소는 목요일 10시부터 일요일 자정까지만 가능합니다.";
  }

  expect(
    futureCancelBlocked,
    "Expected public cancellation to stay blocked before the next booking window opens.",
  );

  console.log("Verification passed.");
} finally {
  cleanup();
}
