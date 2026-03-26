const { DateTime } = require("luxon");

const db = require("./db");
const { APP_TIME_ZONE, MIN_ATTENDEES, ROOMS, ROOM_MODES, TIME_SLOTS } = require("./config");

const slotById = new Map(TIME_SLOTS.map((slot) => [slot.id, slot]));
const roomById = new Map(ROOMS.map((room) => [room.id, room]));

function getNow() {
  return DateTime.now().setZone(APP_TIME_ZONE).setLocale("ko");
}

function getDefaultSunday(reference = getNow()) {
  const localReference = reference.setZone(APP_TIME_ZONE).startOf("day").setLocale("ko");
  const daysUntilSunday = (7 - localReference.weekday + 7) % 7;

  return localReference.plus({ days: daysUntilSunday });
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

function parseSundayDate(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("예약 날짜를 선택해 주세요.");
  }

  const parsed = DateTime.fromISO(input, { zone: APP_TIME_ZONE }).startOf("day").setLocale("ko");

  if (!parsed.isValid) {
    throw new Error("예약 날짜 형식이 올바르지 않습니다.");
  }

  if (parsed.weekday !== 7) {
    throw new Error("운영 날짜는 주일만 선택할 수 있습니다.");
  }

  return parsed;
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
    message: "예약이 열려 있습니다. 원하는 방을 고른 뒤 신청해 주세요.",
  };
}

function assertBookableDate(sundayDate, now = getNow()) {
  const bookingStatus = getBookingStatus(sundayDate, now);

  if (!bookingStatus.open) {
    throw new Error(bookingStatus.message);
  }
}

function toSlotView(slot) {
  return {
    ...slot,
    timeRange: `${slot.startsAt}-${slot.endsAt}`,
  };
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

function makeCellKey(roomId, slotId) {
  return `${roomId}:${slotId}`;
}

function getDefaultCellState(slot) {
  const defaultMode = slot.defaultMode || ROOM_MODES.AVAILABLE;

  return {
    mode: defaultMode,
    label: defaultMode === ROOM_MODES.FIXED ? slot.defaultLabel || "고정 사용" : "",
  };
}

function normalizeSettingLabel(slot, mode, label) {
  const normalizedLabel = String(label || "").trim();

  if (mode === ROOM_MODES.FIXED) {
    return normalizedLabel || slot.defaultLabel || "고정 사용";
  }

  return "";
}

function listRoomSlotSettings(dateIso) {
  return db
    .prepare(
      `
        SELECT room_id, slot_id, mode, label
        FROM room_slot_settings
        WHERE reservation_date = ?
      `,
    )
    .all(dateIso);
}

function buildRoomSlotStateMap(dateIso) {
  const overrides = new Map(
    listRoomSlotSettings(dateIso).map((row) => [makeCellKey(row.room_id, row.slot_id), row]),
  );
  const stateMap = new Map();

  ROOMS.forEach((room) => {
    TIME_SLOTS.forEach((slot) => {
      const override = overrides.get(makeCellKey(room.id, slot.id));
      const defaultState = getDefaultCellState(slot);
      const mode = override ? override.mode : defaultState.mode;
      const label = normalizeSettingLabel(slot, mode, override ? override.label : defaultState.label);

      stateMap.set(makeCellKey(room.id, slot.id), {
        roomId: room.id,
        roomName: room.name,
        room,
        slotId: slot.id,
        slot: toSlotView(slot),
        mode,
        label,
      });
    });
  });

  return stateMap;
}

function decorateReservation(reservation) {
  const room = reservation.room_id ? roomById.get(reservation.room_id) : null;
  const slot = slotById.get(reservation.slot_id);
  const createdAt = DateTime.fromISO(reservation.created_at, { zone: APP_TIME_ZONE }).setLocale("ko");

  return {
    id: reservation.id,
    reservationDate: reservation.reservation_date,
    slotId: reservation.slot_id,
    slot: toSlotView(slot),
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

function getSlotAvailability(dateIso, slotId) {
  const slot = slotById.get(slotId);

  if (!slot) {
    throw new Error("예약 타임을 확인해 주세요.");
  }

  const stateMap = buildRoomSlotStateMap(dateIso);
  const reservableRoomIds = ROOMS.filter(
    (room) => stateMap.get(makeCellKey(room.id, slotId)).mode === ROOM_MODES.AVAILABLE,
  ).map((room) => room.id);
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
      .all(dateIso, slotId),
  );
  const availableRoomIds = reservableRoomIds.filter((roomId) => !occupiedRoomIds.has(roomId));

  return {
    slot: toSlotView(slot),
    stateMap,
    reservableRoomIds,
    availableRoomIds,
    occupiedRoomIds,
  };
}

function buildSchedule(dateIso) {
  const roomSlotStateMap = buildRoomSlotStateMap(dateIso);
  const activeReservations = listReservationsByDate(dateIso);
  const confirmedMap = new Map();
  const waitlistMap = new Map(TIME_SLOTS.map((slot) => [slot.id, []]));

  activeReservations.forEach((reservation) => {
    if (reservation.status === "confirmed" && reservation.roomId) {
      confirmedMap.set(makeCellKey(reservation.roomId, reservation.slotId), reservation);
      return;
    }

    const items = waitlistMap.get(reservation.slotId);

    if (items) {
      items.push(reservation);
    }
  });

  const slotDetails = TIME_SLOTS.map((slot) => {
    const slotView = toSlotView(slot);
    const rooms = ROOMS.map((room) => {
      const state = roomSlotStateMap.get(makeCellKey(room.id, slot.id));
      const reservation = confirmedMap.get(makeCellKey(room.id, slot.id)) || null;
      let status = "available";
      let title = "예약 가능";
      let detail = "이 방을 바로 신청할 수 있습니다.";

      if (reservation) {
        status = "reserved";
        title = reservation.communityName;
        detail = `${reservation.requesterName} · ${reservation.attendees}명`;
      } else if (state.mode === ROOM_MODES.FIXED) {
        status = "fixed";
        title = state.label;
        detail = "고정 사용으로 운영됩니다.";
      } else if (state.mode === ROOM_MODES.CLOSED) {
        status = "closed";
        title = "예약 미운영";
        detail = "이 타임에는 이 방을 열지 않습니다.";
      }

      return {
        roomId: room.id,
        roomName: room.name,
        status,
        mode: state.mode,
        label: state.label,
        selectable: status === "available",
        title,
        detail,
        reservation,
      };
    });
    const reservableRoomCount = rooms.filter((room) => room.mode === ROOM_MODES.AVAILABLE).length;
    const fixedRoomCount = rooms.filter((room) => room.mode === ROOM_MODES.FIXED).length;
    const closedRoomCount = rooms.filter((room) => room.mode === ROOM_MODES.CLOSED).length;
    const confirmedCount = rooms.filter((room) => room.status === "reserved").length;
    const remainingRooms = rooms.filter((room) => room.status === "available").length;
    const waitlistItems = waitlistMap.get(slot.id) || [];
    const waitlistCount = waitlistItems.length;
    const detailParts = [];

    if (reservableRoomCount > 0) {
      detailParts.push(`${confirmedCount}/${reservableRoomCount}실 사용 중`);
    }

    if (fixedRoomCount > 0) {
      detailParts.push(`고정 ${fixedRoomCount}실`);
    }

    if (closedRoomCount > 0) {
      detailParts.push(`미운영 ${closedRoomCount}실`);
    }

    if (waitlistCount > 0) {
      detailParts.push(`대기 ${waitlistCount}팀`);
    }

    let status = "open";
    let availabilityLabel = `남은 방 ${remainingRooms}실`;
    let actionLabel = "방 선택";

    if (reservableRoomCount === 0) {
      if (fixedRoomCount > 0) {
        status = "fixed";
        availabilityLabel = "고정 사용";
      } else {
        status = "closed";
        availabilityLabel = "예약 미운영";
      }

      actionLabel = "예약 불가";
    } else if (remainingRooms === 0) {
      status = "full";
      availabilityLabel = "현재 만석";
      actionLabel = "대기 신청";
    }

    return {
      ...slotView,
      reservableRoomCount,
      fixedRoomCount,
      closedRoomCount,
      confirmedCount,
      remainingRooms,
      waitlistCount,
      status,
      availabilityLabel,
      detailLabel: detailParts.join(" · ") || "운영 정보가 없습니다.",
      actionLabel,
      bookable: reservableRoomCount > 0,
      canWaitlist: reservableRoomCount > 0 && remainingRooms === 0,
      rooms,
      waitlistItems,
    };
  });

  const rooms = ROOMS.map((room) => ({
    ...room,
    slots: slotDetails.map((slotDetail) => ({
      slot: {
        id: slotDetail.id,
        label: slotDetail.label,
        timeRange: slotDetail.timeRange,
      },
      ...slotDetail.rooms.find((entry) => entry.roomId === room.id),
    })),
  }));
  const totalCapacity = slotDetails.reduce((sum, slot) => sum + slot.reservableRoomCount, 0);
  const totalConfirmed = slotDetails.reduce((sum, slot) => sum + slot.confirmedCount, 0);
  const totalWaitlisted = slotDetails.reduce((sum, slot) => sum + slot.waitlistCount, 0);
  const remainingAssignments = slotDetails.reduce((sum, slot) => sum + slot.remainingRooms, 0);
  const occupancyPercent =
    totalCapacity > 0 ? Math.round((totalConfirmed / totalCapacity) * 100) : 0;

  return {
    rooms,
    slotDetails,
    waitlists: slotDetails.map((slot) => ({
      slot: {
        id: slot.id,
        label: slot.label,
        timeRange: slot.timeRange,
      },
      items: slot.waitlistItems,
    })),
    activeReservations,
    hasWaitlist: slotDetails.some((slot) => slot.waitlistCount > 0),
    summary: {
      totalCapacity,
      totalConfirmed,
      totalWaitlisted,
      remainingAssignments,
      occupancyPercent,
      reservableSlotCount: slotDetails.filter((slot) => slot.reservableRoomCount > 0).length,
      openSlotCount: slotDetails.filter((slot) => slot.remainingRooms > 0).length,
    },
  };
}

function sanitizeReservationInput(input, now = getNow()) {
  const reservationDate = parseSundayDate(input.reservationDate);
  const slotId = Number.parseInt(input.slotId, 10);
  const roomId = String(input.roomId || "").trim()
    ? Number.parseInt(input.roomId, 10)
    : null;
  const attendees = Number.parseInt(input.attendees, 10);
  const communityName = String(input.communityName || "").trim();
  const requesterName = String(input.requesterName || "").trim();
  const contact = String(input.contact || "").trim();
  const note = String(input.note || "").trim();
  const joinWaitlist = String(input.joinWaitlist || "") === "1";
  const slot = slotById.get(slotId);

  if (!slot) {
    throw new Error("예약 타임을 선택해 주세요.");
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

  if (roomId !== null && !roomById.has(roomId)) {
    throw new Error("선택한 방을 다시 확인해 주세요.");
  }

  assertBookableDate(reservationDate, now);

  return {
    reservationDate,
    slot,
    roomId,
    attendees,
    communityName,
    requesterName,
    contact,
    note,
    joinWaitlist,
  };
}

function promoteWaitlistForSlot(reservationDate, slotId, updatedAt) {
  const promotions = [];

  while (true) {
    const availability = getSlotAvailability(reservationDate, slotId);

    if (!availability.availableRoomIds.length) {
      break;
    }

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
      .get(reservationDate, slotId);

    if (!nextWaitlisted) {
      break;
    }

    const assignedRoomId = availability.availableRoomIds[0];

    db.prepare(
      `
        UPDATE reservations
        SET status = 'confirmed',
            room_id = ?,
            updated_at = ?
        WHERE id = ?
      `,
    ).run(assignedRoomId, updatedAt, nextWaitlisted.id);

    promotions.push(
      decorateReservation({
        ...nextWaitlisted,
        status: "confirmed",
        room_id: assignedRoomId,
      }),
    );
  }

  return promotions;
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

  const availability = getSlotAvailability(reservationDate, sanitized.slot.id);

  if (!availability.reservableRoomIds.length) {
    throw new Error("선택한 타임은 현재 예약을 받지 않는 타임입니다.");
  }

  let status = "waitlisted";
  let assignedRoom = null;

  if (sanitized.joinWaitlist) {
    if (availability.availableRoomIds.length > 0) {
      throw new Error("남은 방이 있습니다. 원하는 방을 먼저 선택해 주세요.");
    }
  } else {
    if (!sanitized.roomId) {
      throw new Error("방을 선택해 주세요.");
    }

    const selectedState = availability.stateMap.get(makeCellKey(sanitized.roomId, sanitized.slot.id));

    if (!selectedState || selectedState.mode !== ROOM_MODES.AVAILABLE) {
      throw new Error("선택한 방은 예약 가능한 방이 아닙니다.");
    }

    if (!availability.availableRoomIds.includes(sanitized.roomId)) {
      if (availability.availableRoomIds.length === 0) {
        throw new Error("선택한 타임은 모두 마감되었습니다. 대기 신청으로 진행해 주세요.");
      }

      throw new Error("선택한 방은 방금 마감되었습니다. 다른 방을 선택해 주세요.");
    }

    status = "confirmed";
    assignedRoom = roomById.get(sanitized.roomId);
  }

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
    slot: sanitized.slot,
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

  const promotions =
    activeReservation.status === "confirmed"
      ? promoteWaitlistForSlot(activeReservation.reservation_date, activeReservation.slot_id, now)
      : [];

  return {
    cancelled: decorateReservation(activeReservation),
    promoted: promotions[0] || null,
    promotedCount: promotions.length,
  };
});

function cancelReservation(reservationId) {
  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    throw new Error("잘못된 예약 번호입니다.");
  }

  return cancelReservationTx(reservationId);
}

function sanitizeRoomSettingsInput(input) {
  const reservationDate = parseSundayDate(input.reservationDate);
  const slotId = Number.parseInt(input.slotId, 10);
  const slot = slotById.get(slotId);
  const settings = Array.isArray(input.settings) ? input.settings : [];

  if (!slot) {
    throw new Error("설정할 타임을 선택해 주세요.");
  }

  if (!settings.length) {
    throw new Error("저장할 방 설정이 없습니다.");
  }

  const normalizedSettings = settings.map((entry) => {
    const roomId = Number.parseInt(entry.roomId, 10);
    const room = roomById.get(roomId);
    const mode = String(entry.mode || "").trim();

    if (!room) {
      throw new Error("설정할 방 정보를 다시 확인해 주세요.");
    }

    if (!Object.values(ROOM_MODES).includes(mode)) {
      throw new Error(`${room.name} 상태가 올바르지 않습니다.`);
    }

    return {
      roomId,
      room,
      mode,
      label: normalizeSettingLabel(slot, mode, entry.label),
    };
  });

  return {
    reservationDate: reservationDate.toISODate(),
    slot: toSlotView(slot),
    settings: normalizedSettings,
  };
}

const updateRoomSlotSettingsTx = db.transaction((input) => {
  const sanitized = sanitizeRoomSettingsInput(input);
  const now = getNow().toISO();
  const confirmedReservations = db
    .prepare(
      `
        SELECT room_id, community_name
        FROM reservations
        WHERE reservation_date = ?
          AND slot_id = ?
          AND status = 'confirmed'
          AND room_id IS NOT NULL
      `,
    )
    .all(sanitized.reservationDate, sanitized.slot.id);
  const confirmedRoomMap = new Map(
    confirmedReservations.map((reservation) => [reservation.room_id, reservation]),
  );

  sanitized.settings.forEach((setting) => {
    if (setting.mode !== ROOM_MODES.AVAILABLE && confirmedRoomMap.has(setting.roomId)) {
      const reservation = confirmedRoomMap.get(setting.roomId);
      throw new Error(
        `${setting.room.name}에는 ${reservation.community_name} 예약이 확정되어 있어 상태를 바꿀 수 없습니다.`,
      );
    }
  });

  sanitized.settings.forEach((setting) => {
    const defaultState = getDefaultCellState(sanitized.slot);
    const defaultLabel = normalizeSettingLabel(sanitized.slot, defaultState.mode, defaultState.label);
    const isDefault = setting.mode === defaultState.mode && setting.label === defaultLabel;

    if (isDefault) {
      db.prepare(
        `
          DELETE FROM room_slot_settings
          WHERE reservation_date = ?
            AND room_id = ?
            AND slot_id = ?
        `,
      ).run(sanitized.reservationDate, setting.roomId, sanitized.slot.id);
      return;
    }

    db.prepare(
      `
        INSERT INTO room_slot_settings (
          reservation_date,
          room_id,
          slot_id,
          mode,
          label,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(reservation_date, room_id, slot_id)
        DO UPDATE SET
          mode = excluded.mode,
          label = excluded.label,
          updated_at = excluded.updated_at
      `,
    ).run(
      sanitized.reservationDate,
      setting.roomId,
      sanitized.slot.id,
      setting.mode,
      setting.label,
      now,
    );
  });

  const promotions = promoteWaitlistForSlot(sanitized.reservationDate, sanitized.slot.id, now);

  return {
    reservationDate: sanitized.reservationDate,
    slot: sanitized.slot,
    promotions,
  };
});

function updateRoomSlotSettings(input) {
  return updateRoomSlotSettingsTx(input);
}

function buildDashboard(dateInput) {
  const now = getNow();
  const selectedDate = normalizeDate(dateInput, now);
  const schedule = buildSchedule(selectedDate.toISODate());
  const defaultSlot =
    schedule.slotDetails.find((slot) => slot.remainingRooms > 0) ||
    schedule.slotDetails.find((slot) => slot.bookable) ||
    schedule.slotDetails[0];

  return {
    currentTimeLabel: now.toFormat("M월 d일 (ccc) HH:mm"),
    selectedDate: selectedDate.toISODate(),
    selectedDateLabel: selectedDate.toFormat("M월 d일 (ccc)"),
    bookingOpenAtLabel: getBookingOpenAt(selectedDate).toFormat("M월 d일 (ccc) HH:mm"),
    bookingStatus: getBookingStatus(selectedDate, now),
    sundayOptions: getSundayOptions(8, now).map((option) => ({
      ...option,
      selected: option.date === selectedDate.toISODate(),
    })),
    timeSlots: TIME_SLOTS.map(toSlotView),
    schedule,
    slotOverview: schedule.slotDetails,
    slotDetails: schedule.slotDetails,
    summary: schedule.summary,
    defaultSlotId: defaultSlot ? defaultSlot.id : TIME_SLOTS[0].id,
  };
}

module.exports = {
  buildDashboard,
  cancelReservation,
  createReservation,
  formatSlot,
  updateRoomSlotSettings,
};
