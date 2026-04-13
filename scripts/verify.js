const { Settings } = require("luxon");

const { db } = require("../src/db");
const { buildPublicAppState } = require("../src/publicAppState");
const {
  buildDashboard,
  cancelReservation,
  cancelReservationByLookup,
  createRoom,
  createReservation,
  deleteRoom,
  updateBookingPolicy,
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
  db.prepare("DELETE FROM app_settings WHERE key IN ('booking_open_time', 'booking_open_day', 'booking_restriction_enabled')").run();
  db.prepare("DELETE FROM room_metadata").run();
  db.prepare("DELETE FROM rooms WHERE name IN ('테스트 추가방', '삭제 테스트방')").run();
  db.prepare("DELETE FROM reservations WHERE reservation_date = ?").run(TEST_DATE);
  db.prepare("DELETE FROM room_slot_settings WHERE reservation_date = ?").run(TEST_DATE);
  db.prepare("DELETE FROM reservations WHERE reservation_date = ?").run(FUTURE_DATE);
  db.prepare("DELETE FROM room_slot_settings WHERE reservation_date = ?").run(FUTURE_DATE);
  db.prepare("DELETE FROM reservations WHERE reservation_date = ?").run(NEXT_FUTURE_DATE);
  db.prepare("DELETE FROM room_slot_settings WHERE reservation_date = ?").run(NEXT_FUTURE_DATE);
}

cleanup();

try {
  updateBookingPolicy({
    bookingRestrictionEnabled: "1",
    bookingOpenDay: "4",
    bookingOpenTime: "09:30",
  });

  updateRoomMetadata({
    rooms: [
      {
        roomId: 1,
        name: "1번 사랑방 리뉴얼",
        capacity: 6,
        description: "예배 전후 소그룹 모임에 적합한 방",
        imageUrl: "https://example.com/room-1.jpg",
      },
      { roomId: 2, name: "2번 희락방", capacity: 4, description: "조용한 대화용 방" },
      { roomId: 3, name: "3번 화평방", capacity: 8, description: "팀 미팅용 넓은 방" },
      { roomId: 4, name: "4번 오래참음방", capacity: "", description: "" },
      { roomId: 5, name: "5번 자비방", capacity: "", description: "" },
      { roomId: 6, name: "6번 양선방", capacity: "", description: "" },
      { roomId: 7, name: "7번 충성방", capacity: "", description: "" },
      { roomId: 8, name: "8번 온유방", capacity: "", description: "" },
      { roomId: 9, name: "9번 겨울방", capacity: "", description: "" },
    ],
  });

  const createdRoom = createRoom({
    name: "테스트 추가방",
    capacity: 5,
    description: "추가 방 검증용",
    imageUrl: "https://example.com/new-room.jpg",
  });

  let dashboard = buildDashboard(TEST_DATE);
  let slotTwo = dashboard.slotDetails.find((slot) => slot.id === 2);

  expect(
    dashboard.bookingOpenTime === "09:30",
    "Expected dashboard to expose custom booking open time.",
  );
  expect(
    dashboard.bookingOpenDay === 4,
    "Expected dashboard to expose custom booking open weekday.",
  );
  expect(
    dashboard.bookingOpenAtLabel.includes("09:30"),
    "Expected booking open label to reflect the custom open time.",
  );

  expect(dashboard.schedule.rooms.length === 10, "Expected 10 rooms in the schedule after room creation.");
  expect(
    dashboard.schedule.rooms.find((room) => room.id === 1)?.capacity === 6,
    "Expected room metadata to expose capacity.",
  );
  expect(
    dashboard.schedule.rooms.find((room) => room.id === 1)?.name === "1번 사랑방 리뉴얼",
    "Expected room metadata to expose updated room name.",
  );
  expect(
    dashboard.schedule.rooms.find((room) => room.id === 1)?.description === "예배 전후 소그룹 모임에 적합한 방",
    "Expected room metadata to expose description.",
  );
  expect(
    dashboard.schedule.rooms.find((room) => room.id === 1)?.imageUrl === "https://example.com/room-1.jpg",
    "Expected room metadata to expose image URL.",
  );
  expect(
    dashboard.schedule.rooms.find((room) => room.id === createdRoom.id)?.capacity === 5,
    "Expected created room metadata to be exposed in the dashboard.",
  );
  expect(slotTwo && slotTwo.remainingRooms === 10, "Expected 2타임 to start with 10 open rooms.");

  updateRoomSlotSettings({
    reservationDate: TEST_DATE,
    slotId: 2,
    settings: dashboard.schedule.rooms.map((room) => ({
      roomId: room.id,
      mode: room.id === 1 ? "fixed" : room.id === 2 ? "closed" : "available",
      label: room.id === 1 ? "비전연구소" : "",
    })),
  });

  dashboard = buildDashboard(TEST_DATE);
  slotTwo = dashboard.slotDetails.find((slot) => slot.id === 2);

  expect(slotTwo && slotTwo.reservableRoomCount === 8, "Expected 2타임 to expose 8 reservable rooms.");
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
    settings: futureDashboard.schedule.rooms.map((room) => ({
      roomId: room.id,
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
      error.message === "4월 2일 (목) 09:30부터 일요일 자정까지만 예약과 취소가 가능합니다.";
  }

  expect(
    futureCancelBlocked,
    "Expected public cancellation to stay blocked before the next booking window opens.",
  );

  updateBookingPolicy({
    bookingRestrictionEnabled: "0",
    bookingOpenDay: "2",
    bookingOpenTime: "08:15",
  });

  const unrestrictedState = buildPublicAppState({
    dateInput: FUTURE_DATE,
    initialScreen: "form",
  });

  expect(
    unrestrictedState.initialScreen === "form",
    "Expected booking form to stay open when restrictions are disabled.",
  );
  expect(
    unrestrictedState.bookingStatus.open === true,
    "Expected booking status to remain open when restrictions are disabled.",
  );

  const deletionResult = deleteRoom(createdRoom.id);

  expect(
    deletionResult.mode === "archived",
    "Expected configured room with historical settings to be archived instead of deleted.",
  );

  console.log("Verification passed.");
} finally {
  cleanup();
}
