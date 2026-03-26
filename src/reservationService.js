const { DateTime } = require("luxon");

const db = require("./db");
const { APP_TIME_ZONE, MIN_ATTENDEES, ROOMS, TIME_SLOTS } = require("./config");

const slotById = new Map(TIME_SLOTS.map((slot) => [slot.id, slot]));
const roomById = new Map(ROOMS.map((room) => [room.id, room]));

function getNow() {
  return DateTime.now().setZone(APP_TIME_ZONE).setLocale("ko");
}

function normalizeDate(input, fallbackNow = getNow()) {
  if (typeof input !== "string" || !input.trim()) {
    return getDefaultSunday(fallbackNow);
  }

  const parsed = DateTime.fromISO(input, { zone: APP_TIME_ZONE }).startOf("day").setLocale("ko");

  if (!parsed.isValid) {
    return getDefaultSunday(fallbackNow);
  }

  return parsed;
}

function parseBookingDate(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("예약 날짜를 선택해 주세요.");
  }

  const parsed = DateTime.fromISO(input, { zone: APP_TIME_ZONE }).startOf("day").setLocale("ko");

  if (!parsed.isValid) {
    throw new Error("예약 날짜 형식이 올바르지 않습니다.");
  }

  return parsed;
}

function getDefaultSunday(reference = getNow()) {
  const localReference = reference.setZone(APP_TIME_ZONE).startOf("day").setLocale("ko");
  const daysUntilSunday = (7 - localReference.weekday + 7) % 7;

  return localReference.plus({ days: daysUntilSunday });
}

function getBookingOpenAt(sundayDate) {
  return sundayDate
    .minus({ days: 3 })
    .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
    .setLocale("ko");
}

function getBookingStatus(sundayDate, now = getNow()) {
  const today = now.startOf("day");

  if (sundayDate.weekday !== 7) {
    return {
      kind: "error",
      open: false,
      message: "예약 날짜는 주일만 선택할 수 있습니다.",
    };
  }

  if (sundayDate < today) {
    return {
      kind: "error",
      open: false,
      message: "지난 주일은 예약할 수 없습니다.",
    };
  }

  const openAt = getBookingOpenAt(sundayDate);

  if (now < openAt) {
    return {
      kind: "pending",
      open: false,
      message: `${openAt.toFormat("M월 d일 (ccc) HH:mm")}부터 예약이 열립니다.`,
    };
  }

  return {
    kind: "open",
    open: true,
    message: "예약이 열려 있습니다. 선착순으로 자동 배정됩니다.",
  };
}

function assertBookableDate(sundayDate, now = getNow()) {
  const bookingStatus = getBookingStatus(sundayDate, now);

  if (!bookingStatus.open) {
    throw new Error(bookingStatus.message);
  }
}

function formatSlot(slotId) {
  const slot = slotById.get(slotId);
  return slot ? `${slot.label} ${slot.startsAt}-${slot.endsAt}` : "";
}

function getSundayOptions(count = 6, now = getNow()) {
  const firstSunday = getDefaultSunday(now);

  return Array.from({ length: count }, (_, index) => {
    const sundayDate = firstSunday.plus({ weeks: index }).setLocale("ko");
    return {
      date: sundayDate.toISODate(),
      label: sundayDate.toFormat("M월 d일 (ccc)"),
      openAtLabel: getBookingOpenAt(sundayDate).toFormat("M월 d일 (ccc) HH:mm"),
    };
  });
}

function decorateReservation(reservation) {
  const room = reservation.room_id ? roomById.get(reservation.room_id) : null;
  const slot = slotById.get(reservation.slot_id);
  const createdAt = DateTime.fromISO(reservation.created_at, { zone: APP_TIME_ZONE }).setLocale("ko");

  return {
    id: reservation.id,
    reservationDate: reservation.reservation_date,
    slotId: reservation.slot_id,
    slot,
    roomId: reservation.room_id,
    room,
    roomName: room ? room.name : "대기",
    communityName: reservation.community_name,
    requesterName: reservation.requester_name,
    attendees: reservation.attendees,
    contact: reservation.contact,
    note: reservation.note,
    status: reservation.status,
    createdAtLabel: createdAt.isValid ? createdAt.toFormat("M월 d일 HH:mm") : "",
  };
}

function listReservationsByDate(dateIso) {
  return db
    .prepare(
      `
        SELECT *
        FROM reservations
        WHERE reservation_date = ?
          AND status IN ('confirmed', 'waitlisted')
        ORDER BY
          CASE status WHEN 'confirmed' THEN 0 ELSE 1 END,
          slot_id ASC,
          room_id ASC,
          created_at ASC,
          id ASC
      `,
    )
    .all(dateIso)
    .map(decorateReservation);
}

function buildSchedule(dateIso) {
  const activeReservations = listReservationsByDate(dateIso);
  const confirmedMap = new Map();
  const waitlists = TIME_SLOTS.filter((slot) => slot.reservable).map((slot) => ({
    slot,
    items: [],
  }));

  activeReservations.forEach((reservation) => {
    if (reservation.status === "confirmed" && reservation.roomId) {
      confirmedMap.set(`${reservation.roomId}:${reservation.slotId}`, reservation);
      return;
    }

    const waitlist = waitlists.find((entry) => entry.slot.id === reservation.slotId);

    if (waitlist) {
      waitlist.items.push(reservation);
    }
  });

  const rooms = ROOMS.map((room) => ({
    ...room,
    slots: TIME_SLOTS.map((slot) => {
      if (!slot.reservable) {
        return {
          slot: {
            ...slot,
            timeRange: `${slot.startsAt}-${slot.endsAt}`,
          },
          type: "fixed",
          label: slot.fixedLabel,
        };
      }

      const reservation = confirmedMap.get(`${room.id}:${slot.id}`);

      if (!reservation) {
        return {
          slot: {
            ...slot,
            timeRange: `${slot.startsAt}-${slot.endsAt}`,
          },
          type: "empty",
        };
      }

      return {
        slot: {
          ...slot,
          timeRange: `${slot.startsAt}-${slot.endsAt}`,
        },
        type: "reserved",
        reservation,
      };
    }),
  }));

  const slotOverview = TIME_SLOTS.map((slot) => {
    const timeRange = `${slot.startsAt}-${slot.endsAt}`;

    if (!slot.reservable) {
      return {
        ...slot,
        timeRange,
        confirmedCount: ROOMS.length,
        waitlistCount: 0,
        remainingRooms: 0,
        status: "fixed",
        availabilityLabel: "고정 사용",
        detailLabel: slot.fixedLabel,
        actionLabel: "예약 불가",
      };
    }

    const confirmedCount = activeReservations.filter(
      (reservation) => reservation.status === "confirmed" && reservation.slotId === slot.id,
    ).length;
    const waitlistCount = waitlists.find((entry) => entry.slot.id === slot.id)?.items.length || 0;
    const remainingRooms = Math.max(ROOMS.length - confirmedCount, 0);

    return {
      ...slot,
      timeRange,
      confirmedCount,
      waitlistCount,
      remainingRooms,
      status: remainingRooms > 0 ? "open" : "full",
      availabilityLabel: remainingRooms > 0 ? `예약 가능 ${remainingRooms}개` : "현재 만석",
      detailLabel:
        waitlistCount > 0
          ? `대기 ${waitlistCount}팀`
          : remainingRooms > 0
            ? `${confirmedCount}/${ROOMS.length}개 사용 중`
            : "신청 시 대기 등록",
      actionLabel: remainingRooms > 0 ? "이 타임 신청" : "대기 등록",
    };
  });

  const reservableSlots = slotOverview.filter((slot) => slot.reservable);
  const totalCapacity = reservableSlots.length * ROOMS.length;
  const totalConfirmed = reservableSlots.reduce((sum, slot) => sum + slot.confirmedCount, 0);
  const totalWaitlisted = reservableSlots.reduce((sum, slot) => sum + slot.waitlistCount, 0);
  const remainingAssignments = reservableSlots.reduce((sum, slot) => sum + slot.remainingRooms, 0);
  const occupancyPercent =
    totalCapacity > 0 ? Math.round((totalConfirmed / totalCapacity) * 100) : 0;

  return {
    rooms,
    waitlists,
    activeReservations,
    hasWaitlist: waitlists.some((entry) => entry.items.length > 0),
    slotOverview,
    summary: {
      totalCapacity,
      totalConfirmed,
      totalWaitlisted,
      remainingAssignments,
      occupancyPercent,
      reservableSlotCount: reservableSlots.length,
      openSlotCount: reservableSlots.filter((slot) => slot.remainingRooms > 0).length,
    },
  };
}

function sanitizeReservationInput(input, now = getNow()) {
  const reservationDate = parseBookingDate(input.reservationDate, now);
  const slotId = Number.parseInt(input.slotId, 10);
  const attendees = Number.parseInt(input.attendees, 10);
  const communityName = String(input.communityName || "").trim();
  const requesterName = String(input.requesterName || "").trim();
  const contact = String(input.contact || "").trim();
  const note = String(input.note || "").trim();
  const slot = slotById.get(slotId);

  if (!slot) {
    throw new Error("예약 타임을 선택해 주세요.");
  }

  if (!slot.reservable) {
    throw new Error("5타임은 고정 사용 타임이라 예약할 수 없습니다.");
  }

  if (!communityName) {
    throw new Error("공동체 이름을 입력해 주세요.");
  }

  if (!requesterName) {
    throw new Error("신청자 이름을 입력해 주세요.");
  }

  if (!Number.isInteger(attendees) || attendees < MIN_ATTENDEES) {
    throw new Error(`최소 ${MIN_ATTENDEES}명 이상만 예약할 수 있습니다.`);
  }

  assertBookableDate(reservationDate, now);

  return {
    reservationDate,
    slot,
    attendees,
    communityName,
    requesterName,
    contact,
    note,
  };
}

const createReservationTx = db.transaction((input) => {
  const now = getNow();
  const sanitized = sanitizeReservationInput(input, now);
  const reservationDate = sanitized.reservationDate.toISODate();

  const duplicateReservation = db
    .prepare(
      `
        SELECT id
        FROM reservations
        WHERE reservation_date = ?
          AND slot_id = ?
          AND community_name = ?
          AND status IN ('confirmed', 'waitlisted')
        LIMIT 1
      `,
    )
    .get(reservationDate, sanitized.slot.id, sanitized.communityName);

  if (duplicateReservation) {
    throw new Error("같은 공동체가 같은 날짜와 타임으로 이미 신청되어 있습니다.");
  }

  const occupiedRoomIds = new Set(
    db
      .prepare(
        `
          SELECT room_id
          FROM reservations
          WHERE reservation_date = ?
            AND slot_id = ?
            AND status = 'confirmed'
            AND room_id IS NOT NULL
          ORDER BY room_id ASC
        `,
      )
      .pluck()
      .all(reservationDate, sanitized.slot.id),
  );

  const assignedRoom = ROOMS.find((room) => !occupiedRoomIds.has(room.id)) || null;
  const status = assignedRoom ? "confirmed" : "waitlisted";
  const timestamp = now.toISO();

  const result = db
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      reservationDate,
      sanitized.slot.id,
      assignedRoom ? assignedRoom.id : null,
      sanitized.communityName,
      sanitized.requesterName,
      sanitized.attendees,
      sanitized.contact,
      sanitized.note,
      status,
      timestamp,
      timestamp,
    );

  const waitlistPosition =
    status === "waitlisted"
      ? db
          .prepare(
            `
              SELECT COUNT(*)
              FROM reservations
              WHERE reservation_date = ?
                AND slot_id = ?
                AND status = 'waitlisted'
            `,
          )
          .pluck()
          .get(reservationDate, sanitized.slot.id)
      : null;

  return {
    id: result.lastInsertRowid,
    reservationDate,
    slot: {
      ...sanitized.slot,
      timeRange: `${sanitized.slot.startsAt}-${sanitized.slot.endsAt}`,
    },
    room: assignedRoom,
    status,
    waitlistPosition,
  };
});

function createReservation(input) {
  return createReservationTx(input);
}

const cancelReservationTx = db.transaction((reservationId) => {
  const activeReservation = db
    .prepare(
      `
        SELECT *
        FROM reservations
        WHERE id = ?
          AND status IN ('confirmed', 'waitlisted')
        LIMIT 1
      `,
    )
    .get(reservationId);

  if (!activeReservation) {
    return null;
  }

  const now = getNow().toISO();

  db.prepare("UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE id = ?").run(
    now,
    reservationId,
  );

  let promoted = null;

  if (activeReservation.status === "confirmed" && activeReservation.room_id) {
    const nextWaitlisted = db
      .prepare(
        `
          SELECT *
          FROM reservations
          WHERE reservation_date = ?
            AND slot_id = ?
            AND status = 'waitlisted'
          ORDER BY created_at ASC, id ASC
          LIMIT 1
        `,
      )
      .get(activeReservation.reservation_date, activeReservation.slot_id);

    if (nextWaitlisted) {
      db.prepare(
        `
          UPDATE reservations
          SET status = 'confirmed',
              room_id = ?,
              updated_at = ?
          WHERE id = ?
        `,
      ).run(activeReservation.room_id, now, nextWaitlisted.id);

      promoted = decorateReservation({
        ...nextWaitlisted,
        status: "confirmed",
        room_id: activeReservation.room_id,
      });
    }
  }

  return {
    cancelled: decorateReservation(activeReservation),
    promoted,
  };
});

function cancelReservation(reservationId) {
  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    throw new Error("잘못된 예약 번호입니다.");
  }

  return cancelReservationTx(reservationId);
}

function buildDashboard(dateInput) {
  const now = getNow();
  const selectedDate = normalizeDate(dateInput, now);
  const bookingStatus = getBookingStatus(selectedDate, now);
  const schedule = buildSchedule(selectedDate.toISODate());

  return {
    currentTimeLabel: now.toFormat("M월 d일 (ccc) HH:mm"),
    selectedDate: selectedDate.toISODate(),
    selectedDateLabel: selectedDate.toFormat("M월 d일 (ccc)"),
    bookingOpenAtLabel: getBookingOpenAt(selectedDate).toFormat("M월 d일 (ccc) HH:mm"),
    bookingStatus,
    sundayOptions: getSundayOptions(8, now).map((option) => ({
      ...option,
      selected: option.date === selectedDate.toISODate(),
    })),
    timeSlots: TIME_SLOTS.map((slot) => ({
      ...slot,
      timeRange: `${slot.startsAt}-${slot.endsAt}`,
    })),
    schedule,
    slotOverview: schedule.slotOverview,
    summary: schedule.summary,
  };
}

module.exports = {
  buildDashboard,
  cancelReservation,
  createReservation,
  formatSlot,
};
