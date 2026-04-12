const { MIN_ATTENDEES, NOTICE_ITEMS } = require("./config");
const { buildDashboard } = require("./reservationService");

function normalizePositiveInteger(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeFormValues(values = {}, fallbackDate, fallbackSlotId) {
  return {
    reservationDate: values.reservationDate || fallbackDate,
    communityName: values.communityName || "",
    requesterName: values.requesterName || "",
    attendees: 1,
    slotId: Number(values.slotId || fallbackSlotId || 1),
    roomId: values.roomId ? Number(values.roomId) : null,
    contact: values.contact || "",
    note: values.note || "",
  };
}

function normalizeCancelLookup(values = {}) {
  return {
    reservationNumber: values.reservationNumber || "",
    contactLastFour: values.contactLastFour || "",
  };
}

function serializeWaitlistItems(waitlistItems) {
  return waitlistItems.map((reservation) => ({
    id: reservation.id,
    communityName: reservation.communityName,
    requesterName: reservation.requesterName,
    attendees: reservation.attendees,
    createdAtLabel: reservation.createdAtLabel,
  }));
}

function buildPublicRooms(schedule) {
  return schedule.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    capacity: room.capacity ?? null,
    description: room.description || "",
    imageUrl: room.imageUrl || "",
    slots: room.slots.map((slot) => ({
      slotId: slot.slot.id,
      label: slot.slot.label,
      timeRange: slot.slot.timeRange,
      status: slot.status,
      mode: slot.mode,
      interactive: slot.interactive,
      actionType: slot.actionType,
      actionLabel: slot.actionLabel,
      title: slot.title,
      detail: slot.detail,
      waitlistCount: slot.waitlistCount,
      waitlistItems: serializeWaitlistItems(slot.waitlistItems),
    })),
  }));
}

function pickInitialSlotId(room, preferredSlotId, fallbackSlotId) {
  if (!room) {
    return fallbackSlotId;
  }

  const preferred = room.slots.find(
    (slot) => Number(slot.slotId) === Number(preferredSlotId) && Boolean(slot.interactive),
  );

  if (preferred) {
    return preferred.slotId;
  }

  const sameSlot = room.slots.find((slot) => Number(slot.slotId) === Number(preferredSlotId));

  if (sameSlot) {
    return sameSlot.slotId;
  }

  const firstInteractive = room.slots.find((slot) => Boolean(slot.interactive));

  if (firstInteractive) {
    return firstInteractive.slotId;
  }

  return room.slots[0] ? room.slots[0].slotId : fallbackSlotId;
}

function buildPublicAppState(options = {}) {
  const dashboard = buildDashboard(options.dateInput);
  const requestedScreen = options.initialScreen || "intro";
  const initialScreen =
    dashboard.bookingStatus.open || requestedScreen === "status" ? requestedScreen : "intro";
  const formValues = normalizeFormValues(
    options.formValues,
    dashboard.selectedDate,
    dashboard.defaultSlotId,
  );
  const rooms = buildPublicRooms(dashboard.schedule);
  const fallbackRoom =
    rooms.find((room) => room.slots.some((slot) => slot.interactive)) || rooms[0] || null;
  const selectedRoomId = normalizePositiveInteger(
    options.roomId || formValues.roomId,
    fallbackRoom ? fallbackRoom.id : 1,
  );
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || fallbackRoom || null;
  const selectedSlotId = pickInitialSlotId(
    selectedRoom,
    normalizePositiveInteger(options.slotId || formValues.slotId, dashboard.defaultSlotId),
    dashboard.defaultSlotId,
  );

  return {
    appTitle:
      initialScreen === "status" ? "KOINORI 예약 현황" : "KOINORI 주일 룸 예약",
    initialScreen,
    selectedDate: dashboard.selectedDate,
    selectedDateLabel: dashboard.selectedDateLabel,
    currentTimeLabel: dashboard.currentTimeLabel,
    bookingOpenAtLabel: dashboard.bookingOpenAtLabel,
    bookingStatus: dashboard.bookingStatus,
    serverNowIso: dashboard.currentTimeIso,
    bookingOpenAtIso: dashboard.bookingOpenAtIso,
    bookingCloseAtIso: dashboard.bookingCloseAtIso,
    minAttendees: MIN_ATTENDEES,
    noticeItems: NOTICE_ITEMS,
    summary: dashboard.summary,
    rooms,
    selectedRoomId,
    selectedSlotId,
    formValues: {
      ...formValues,
      roomId: selectedRoomId,
      slotId: selectedSlotId,
    },
    cancelLookup: normalizeCancelLookup(options.cancelLookup),
    waitlistPrompt: options.waitlistPrompt || null,
    recentAction: options.recentAction || null,
    flashMessage: options.message || "",
    flashLevel: options.level || "info",
    adminReturnTo: `/admin?date=${encodeURIComponent(dashboard.selectedDate)}`,
  };
}

module.exports = {
  buildPublicAppState,
};
