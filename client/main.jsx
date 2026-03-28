import React, { startTransition, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

const liveDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

const liveTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 2,
  hour12: false,
});

function readInitialState() {
  const element = document.getElementById("initial-public-state");

  if (!element) {
    return null;
  }

  try {
    return JSON.parse(element.textContent || "{}");
  } catch (_error) {
    return null;
  }
}

function getRoomMetrics(room) {
  const openSlots = room.slots.filter((slot) => slot.actionType === "reserve");
  const waitSlots = room.slots.filter((slot) => slot.actionType === "waitlist");
  const openCount = openSlots.length;
  const waitCount = waitSlots.length;
  const fixedCount = room.slots.filter((slot) => slot.status === "fixed").length;
  const closedCount = room.slots.filter((slot) => slot.status === "closed").length;
  const operationCount = room.slots.filter((slot) => slot.status !== "closed").length;
  let state = "closed";
  let badge = "예약 불가";
  let helperText = "오늘은 예약을 받지 않습니다.";

  if (openCount > 0) {
    state = "open";
    badge = "예약 가능";
    helperText = "";
  } else if (waitCount > 0) {
    state = "wait";
    badge = "대기 가능";
    helperText = "";
  } else if (fixedCount === room.slots.length) {
    state = "fixed";
    badge = "고정 사용";
    helperText = "오늘은 고정 사용으로 운영됩니다.";
  } else if (operationCount > 0) {
    helperText = "지금 선택할 수 있는 시간이 없습니다.";
  }

  return {
    openCount,
    waitCount,
    openSlotLabels: openSlots.map((slot) => slot.label),
    waitSlotLabels: waitSlots.map((slot) => slot.label),
    fixedCount,
    closedCount,
    operationCount,
    state,
    badge,
    helperText,
  };
}

function findRoom(rooms, roomId) {
  return rooms.find((room) => Number(room.id) === Number(roomId)) || null;
}

function findSlot(room, slotId) {
  if (!room) {
    return null;
  }

  return room.slots.find((slot) => Number(slot.slotId) === Number(slotId)) || null;
}

function pickSlotId(room, preferredSlotId, fallbackSlotId) {
  if (!room) {
    return fallbackSlotId;
  }

  const preferredInteractive = room.slots.find(
    (slot) => Number(slot.slotId) === Number(preferredSlotId) && Boolean(slot.interactive),
  );

  if (preferredInteractive) {
    return preferredInteractive.slotId;
  }

  const preferred = room.slots.find((slot) => Number(slot.slotId) === Number(preferredSlotId));

  if (preferred) {
    return preferred.slotId;
  }

  const firstInteractive = room.slots.find((slot) => Boolean(slot.interactive));

  if (firstInteractive) {
    return firstInteractive.slotId;
  }

  return room.slots[0] ? room.slots[0].slotId : fallbackSlotId;
}

function statusText(slot) {
  if (slot.status === "available") {
    return "예약 가능";
  }

  if (slot.status === "reserved") {
    return "예약 완료";
  }

  if (slot.status === "fixed") {
    return "고정 사용";
  }

  return "운영 안 함";
}

function buildWaitlistMessage(room, slot, waitlistPrompt) {
  if (waitlistPrompt && waitlistPrompt.message) {
    return waitlistPrompt.message;
  }

  if (!room || !slot) {
    return "대기 등록 여부를 먼저 확인해 주세요.";
  }

  const nextPosition = Number(slot.waitlistCount || 0) + 1;

  return `${room.name} ${slot.label}은 먼저 신청한 팀이 있습니다. 원하면 대기 ${nextPosition}번으로 등록할 수 있습니다.`;
}

function getVisibleNotices(noticeItems, screen, slotId) {
  return (noticeItems || []).filter((notice) => {
    if (Array.isArray(notice.screens) && !notice.screens.includes(screen)) {
      return false;
    }

    if (Array.isArray(notice.slotIds) && !notice.slotIds.includes(Number(slotId))) {
      return false;
    }

    return true;
  });
}

function groupSlotsByState(room) {
  if (!room) {
    return {
      reserve: [],
      waitlist: [],
      blocked: [],
    };
  }

  return room.slots.reduce(
    (groups, slot) => {
      if (slot.actionType === "reserve") {
        groups.reserve.push(slot);
        return groups;
      }

      if (slot.actionType === "waitlist") {
        groups.waitlist.push(slot);
        return groups;
      }

      groups.blocked.push(slot);
      return groups;
    },
    {
      reserve: [],
      waitlist: [],
      blocked: [],
    },
  );
}

function getBookingStep(screen) {
  if (screen === "room") {
    return 1;
  }

  if (screen === "slot") {
    return 2;
  }

  if (screen === "form") {
    return 3;
  }

  return 0;
}

function getPublicDockState(screen) {
  if (screen === "status") {
    return "status";
  }

  if (screen === "intro") {
    return "intro";
  }

  return "booking";
}

function getSlotActionTone(slot) {
  if (slot.actionType === "reserve") {
    return "open";
  }

  if (slot.actionType === "waitlist") {
    return "wait";
  }

  return "closed";
}

function getSlotActionCopy(slot) {
  if (slot.actionType === "reserve") {
    return "바로 예약";
  }

  if (slot.actionType === "waitlist") {
    return "대기 가능";
  }

  if (slot.status === "fixed") {
    return "고정 사용";
  }

  return "예약 불가";
}

function getRecentActionTitle(recentAction) {
  if (!recentAction) {
    return "";
  }

  if (recentAction.type === "confirmed") {
    return "예약이 완료되었습니다";
  }

  if (recentAction.type === "waitlisted") {
    return "대기 등록이 완료되었습니다";
  }

  if (recentAction.type === "cancelled") {
    return "예약이 취소되었습니다";
  }

  return "";
}

function formatSlotSummary(labels) {
  return labels.join(" · ");
}

function applyServerState(
  nextState,
  setAppState,
  setScreen,
  setSelectedRoomId,
  setSelectedSlotId,
  setFormValues,
  setCancelValues,
  setFlash,
  setWaitlistPrompt,
) {
  startTransition(() => {
    setAppState(nextState);
    setScreen(nextState.initialScreen || "intro");
    setSelectedRoomId(nextState.selectedRoomId);
    setSelectedSlotId(nextState.selectedSlotId);
    setFormValues({
      ...nextState.formValues,
      attendees: String(nextState.formValues.attendees ?? ""),
    });
    setCancelValues(nextState.cancelLookup || { reservationNumber: "", contactLastFour: "" });
    setFlash(
      nextState.flashMessage
        ? { message: nextState.flashMessage, level: nextState.flashLevel || "info" }
        : null,
    );
    setWaitlistPrompt(nextState.waitlistPrompt || null);
  });
}

function App({ initialState }) {
  const [appState, setAppState] = useState(initialState);
  const [screen, setScreen] = useState(initialState.initialScreen || "intro");
  const [selectedRoomId, setSelectedRoomId] = useState(initialState.selectedRoomId);
  const [selectedSlotId, setSelectedSlotId] = useState(initialState.selectedSlotId);
  const [formValues, setFormValues] = useState({
    ...initialState.formValues,
    attendees: String(initialState.formValues.attendees ?? ""),
  });
  const [cancelValues, setCancelValues] = useState(
    initialState.cancelLookup || { reservationNumber: "", contactLastFour: "" },
  );
  const [flash, setFlash] = useState(
    initialState.flashMessage
      ? { message: initialState.flashMessage, level: initialState.flashLevel || "info" }
      : null,
  );
  const [waitlistPrompt, setWaitlistPrompt] = useState(initialState.waitlistPrompt || null);
  const [waitlistModalOpen, setWaitlistModalOpen] = useState(Boolean(initialState.waitlistPrompt));
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [attendeesTouched, setAttendeesTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.parse(initialState.serverNowIso) || Date.now());
  const tapCountRef = useRef(0);
  const tapResetRef = useRef(null);
  const rooms = appState.rooms || [];
  const minAttendees = appState.minAttendees || 4;
  const selectedRoom =
    findRoom(rooms, selectedRoomId) ||
    rooms.find((room) => room.slots.some((slot) => slot.interactive)) ||
    rooms[0] ||
    null;
  const selectedSlot = findSlot(selectedRoom, selectedSlotId);
  const bookingOpenAtMs = Date.parse(appState.bookingOpenAtIso || "");
  const bookingCloseAtMs = Date.parse(appState.bookingCloseAtIso || "");
  const hasErrorState = appState.bookingStatus.kind === "error" && !appState.bookingStatus.open;
  const bookingWindowHasStarted = Number.isFinite(bookingOpenAtMs)
    ? nowMs >= bookingOpenAtMs
    : Boolean(appState.bookingStatus.open);
  const bookingWindowHasEnded = Number.isFinite(bookingCloseAtMs) ? nowMs >= bookingCloseAtMs : false;
  const bookingIsOpen = !hasErrorState && bookingWindowHasStarted && !bookingWindowHasEnded;
  const attendeesNumber = Number.parseInt(formValues.attendees, 10);
  const attendeesInvalid =
    formValues.attendees !== "" && (!Number.isInteger(attendeesNumber) || attendeesNumber < minAttendees);
  const showAttendeesError = attendeesTouched && attendeesInvalid;
  const canSubmit =
    bookingIsOpen &&
    Boolean(selectedRoom && selectedSlot && selectedSlot.interactive) &&
    !attendeesInvalid &&
    formValues.communityName.trim() &&
    formValues.requesterName.trim() &&
    formValues.contact.trim() &&
    !isSubmitting;
  const liveStatus = hasErrorState
    ? appState.bookingStatus
    : bookingWindowHasEnded
      ? { kind: "closed", message: "이번 주일 예약은 마감되었습니다. 현황만 확인할 수 있습니다." }
    : bookingIsOpen
      ? { kind: "open", message: "지금 예약할 수 있습니다. 아래 큰 버튼을 눌러 진행해 주세요." }
      : appState.bookingStatus;
  const introNotices = getVisibleNotices(appState.noticeItems, "intro", selectedSlot?.slotId);
  const formNotices = getVisibleNotices(appState.noticeItems, "form", selectedSlot?.slotId);
  const slotGroups = groupSlotsByState(selectedRoom);
  const currentBookingStep = getBookingStep(screen);
  const publicDockState = getPublicDockState(screen);
  const recentAction = appState.recentAction;

  useEffect(() => {
    const baseServerNowMs = Date.parse(appState.serverNowIso) || Date.now();
    const clientStartedAtMs = Date.now();
    const timerId = window.setInterval(() => {
      setNowMs(baseServerNowMs + (Date.now() - clientStartedAtMs));
    }, 10);

    return () => {
      window.clearInterval(timerId);
    };
  }, [appState.serverNowIso]);

  useEffect(() => {
    const room = findRoom(rooms, selectedRoomId) || rooms[0] || null;

    if (!room) {
      return;
    }

    if (!selectedRoom || selectedRoom.id !== room.id) {
      setSelectedRoomId(room.id);
      return;
    }

    const nextSlotId = pickSlotId(room, selectedSlotId, appState.selectedSlotId);

    if (Number(nextSlotId) !== Number(selectedSlotId)) {
      setSelectedSlotId(nextSlotId);
    }
  }, [rooms, selectedRoomId, selectedSlotId, selectedRoom, appState.selectedSlotId]);

  useEffect(() => {
    if (waitlistPrompt) {
      setWaitlistModalOpen(true);
    }
  }, [waitlistPrompt]);

  useEffect(() => {
    document.title = screen === "status" ? "KOINORI 예약 현황" : "KOINORI 주일 룸 예약";
  }, [screen]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [screen]);

  function handleBrandTap() {
    tapCountRef.current += 1;

    if (tapResetRef.current) {
      window.clearTimeout(tapResetRef.current);
    }

    tapResetRef.current = window.setTimeout(() => {
      tapCountRef.current = 0;
    }, 1600);

    if (tapCountRef.current < 10) {
      return;
    }

    tapCountRef.current = 0;
    setAdminModalOpen(true);
  }

  function clearFlash() {
    setFlash(null);
  }

  function openCancelModal() {
    if (!bookingIsOpen) {
      setFlash({ message: "예약과 취소는 목요일 10시부터 일요일 자정까지만 가능합니다.", level: "info" });
      return;
    }

    setCancelValues((current) => ({
      reservationNumber: recentAction?.reservationNumber || current.reservationNumber || "",
      contactLastFour: recentAction?.contactLastFour || current.contactLastFour || "",
    }));
    setCancelModalOpen(true);
  }

  function goToScreen(nextScreen) {
    if (nextScreen === "room" && !bookingIsOpen) {
      setScreen("intro");
      return;
    }

    if (nextScreen === "slot" && !selectedRoom) {
      setScreen("room");
      return;
    }

    if (nextScreen === "form" && (!selectedRoom || !selectedSlot)) {
      setScreen("room");
      return;
    }

    setScreen(nextScreen);
  }

  function changeFormValue(field, value) {
    let nextValue = value;

    if (field === "attendees") {
      nextValue = value.replace(/[^\d]/g, "").slice(0, 3);
    }

    if (field === "contact") {
      nextValue = value.replace(/[^\d-]/g, "").slice(0, 13);
    }

    setFormValues((current) => ({
      ...current,
      [field]: nextValue,
    }));
  }

  function changeCancelValue(field, value) {
    const nextValue = value.replace(/[^\d]/g, "").slice(0, field === "reservationNumber" ? 8 : 4);

    setCancelValues((current) => ({
      ...current,
      [field]: nextValue,
    }));
  }

  function clearWaitlistPrompt(nextRoomId, nextSlotId) {
    if (
      waitlistPrompt &&
      (Number(waitlistPrompt.roomId) !== Number(nextRoomId) ||
        Number(waitlistPrompt.slotId) !== Number(nextSlotId))
    ) {
      setWaitlistPrompt(null);
      setWaitlistModalOpen(false);
    }
  }

  function selectRoom(roomId) {
    const room = findRoom(rooms, roomId);

    if (!room) {
      return;
    }

    const nextSlotId = pickSlotId(room, selectedSlotId, appState.selectedSlotId);

    setSelectedRoomId(room.id);
    setSelectedSlotId(nextSlotId);
    clearWaitlistPrompt(room.id, nextSlotId);
    goToScreen("slot");
  }

  function selectSlot(slotId) {
    if (!selectedRoom) {
      return;
    }

    setSelectedSlotId(slotId);
    clearWaitlistPrompt(selectedRoom.id, slotId);
    goToScreen("form");
  }

  async function submitReservation(waitlistConsent = false) {
    if (!selectedRoom || !selectedSlot || !selectedSlot.interactive) {
      return;
    }

    setAttendeesTouched(true);

    if (attendeesInvalid) {
      setFlash({ message: `최소 ${minAttendees}명부터 신청할 수 있습니다.`, level: "error" });
      return;
    }

    if (!formValues.communityName.trim()) {
      setFlash({ message: "공동체 이름을 입력해 주세요.", level: "error" });
      return;
    }

    if (!formValues.requesterName.trim()) {
      setFlash({ message: "신청자 이름을 입력해 주세요.", level: "error" });
      return;
    }

    if (!formValues.contact.trim()) {
      setFlash({ message: "연락처를 입력해 주세요.", level: "error" });
      return;
    }

    setIsSubmitting(true);
    setFlash(null);

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          reservationDate: appState.selectedDate,
          slotId: selectedSlot.slotId,
          roomId: selectedRoom.id,
          communityName: formValues.communityName.trim(),
          requesterName: formValues.requesterName.trim(),
          attendees: formValues.attendees,
          contact: formValues.contact.trim(),
          note: formValues.note.trim(),
          waitlistConsent: waitlistConsent ? "1" : "0",
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        if (data.state) {
          applyServerState(
            data.state,
            setAppState,
            setScreen,
            setSelectedRoomId,
            setSelectedSlotId,
            setFormValues,
            setCancelValues,
            setFlash,
            setWaitlistPrompt,
          );
        } else if (data.message) {
          setFlash({ message: data.message, level: "error" });
        }

        if (data.code === "WAITLIST_CONFIRM_REQUIRED") {
          setWaitlistModalOpen(true);
        }

        return;
      }

      applyServerState(
        data.state,
        setAppState,
        setScreen,
        setSelectedRoomId,
        setSelectedSlotId,
        setFormValues,
        setCancelValues,
        setFlash,
        setWaitlistPrompt,
      );
      setWaitlistModalOpen(false);
    } catch (_error) {
      setFlash({ message: "예약 처리 중 오류가 발생했습니다.", level: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePrimarySubmit() {
    if (selectedSlot && (selectedSlot.actionType === "waitlist" || waitlistPrompt)) {
      setWaitlistModalOpen(true);
      return;
    }

    void submitReservation(false);
  }

  async function submitCancellation() {
    if (!cancelValues.reservationNumber.trim()) {
      setFlash({ message: "예약 번호를 입력해 주세요.", level: "error" });
      setCancelModalOpen(true);
      return;
    }

    if (cancelValues.contactLastFour.trim().length !== 4) {
      setFlash({ message: "연락처 뒤 4자리를 입력해 주세요.", level: "error" });
      setCancelModalOpen(true);
      return;
    }

    setCancelSubmitting(true);
    setFlash(null);

    try {
      const response = await fetch("/api/reservations/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(cancelValues),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        if (data.state) {
          applyServerState(
            data.state,
            setAppState,
            setScreen,
            setSelectedRoomId,
            setSelectedSlotId,
            setFormValues,
            setCancelValues,
            setFlash,
            setWaitlistPrompt,
          );
        } else if (data.message) {
          setFlash({ message: data.message, level: "error" });
        }

        setCancelModalOpen(true);
        return;
      }

      applyServerState(
        data.state,
        setAppState,
        setScreen,
        setSelectedRoomId,
        setSelectedSlotId,
        setFormValues,
        setCancelValues,
        setFlash,
        setWaitlistPrompt,
      );
      setCancelModalOpen(false);
      setCancelValues({ reservationNumber: "", contactLastFour: "" });
    } catch (_error) {
      setFlash({ message: "예약 취소 중 오류가 발생했습니다.", level: "error" });
      setCancelModalOpen(true);
    } finally {
      setCancelSubmitting(false);
    }
  }

  function renderRoomCard(room) {
    const metrics = getRoomMetrics(room);
    const disabled = !room.slots.some((slot) => slot.interactive);

    return (
      <button
        type="button"
        key={room.id}
        className={`room-pick-card room-pick-card-${metrics.state} ${
          Number(room.id) === Number(selectedRoom?.id) ? "is-selected" : ""
        }`}
        onClick={() => selectRoom(room.id)}
        disabled={disabled}
      >
        <span className="room-pick-head">
          <strong>{room.name}</strong>
          <small className={`room-pick-badge room-pick-badge-${metrics.state}`}>{metrics.badge}</small>
        </span>
        {metrics.openCount > 0 || metrics.waitCount > 0 ? (
          <span className="room-pick-summary" aria-label={`${room.name} 예약 요약`}>
            {metrics.openCount > 0 ? (
              <span className="room-pick-line room-pick-line-open">
                <span className="room-pick-line-label">예약 {metrics.openCount}타임</span>
                <span className="room-pick-line-slots">{formatSlotSummary(metrics.openSlotLabels)}</span>
              </span>
            ) : null}
            {metrics.waitCount > 0 ? (
              <span className="room-pick-line room-pick-line-wait">
                <span className="room-pick-line-label">대기 {metrics.waitCount}타임</span>
                <span className="room-pick-line-slots">{formatSlotSummary(metrics.waitSlotLabels)}</span>
              </span>
            ) : null}
          </span>
        ) : null}
        {metrics.helperText ? <span className="room-pick-detail">{metrics.helperText}</span> : null}
      </button>
    );
  }

  function renderSlotCard(slot) {
    return (
      <button
        type="button"
        key={slot.slotId}
        className={`slot-card slot-card-${slot.status} ${
          Number(slot.slotId) === Number(selectedSlot?.slotId) ? "is-selected" : ""
        }`}
        disabled={!slot.interactive}
        onClick={() => selectSlot(slot.slotId)}
      >
        <span className="slot-card-head">
          <strong>{slot.label}</strong>
          <small>{slot.timeRange}</small>
        </span>
        <span className={`slot-card-badge slot-card-badge-${getSlotActionTone(slot)}`}>
          {getSlotActionCopy(slot)}
        </span>
        <span className="slot-card-title">{slot.title}</span>
        <span className="slot-card-detail">{slot.detail}</span>
      </button>
    );
  }

  function renderNoticeCard(notice) {
    return (
      <article key={notice.id} className="notice-card">
        <strong>{notice.title}</strong>
        <span>{notice.detail}</span>
      </article>
    );
  }

  function renderProgressStep(step, label) {
    const stepState =
      currentBookingStep === step ? "is-current" : currentBookingStep > step ? "is-complete" : "";

    return (
      <div key={step} className={`progress-step ${stepState}`}>
        <span className="progress-step-number">{step}</span>
        <strong>{label}</strong>
      </div>
    );
  }

  function renderRecentActionCard() {
    if (!recentAction) {
      return null;
    }

    return (
      <article className={`activity-card activity-card-${recentAction.type}`}>
        <strong>{getRecentActionTitle(recentAction)}</strong>
        <span>
          {recentAction.roomName} {recentAction.slotLabel} {recentAction.timeRange}
        </span>
        <div className="activity-meta">
          <span>예약번호 {recentAction.reservationNumber}</span>
          {recentAction.contactLastFour ? <span>취소 확인 {recentAction.contactLastFour}</span> : null}
        </div>
      </article>
    );
  }

  function renderStatusSlot(slot) {
    return (
      <article key={slot.slotId} className={`board-slot-card board-slot-card-${slot.status}`}>
        <span className="room-card-head">
          <strong>{slot.label}</strong>
          <small>{slot.timeRange}</small>
        </span>
        <span className="slot-card-badge">{statusText(slot)}</span>
        <span className="room-card-title">{slot.title}</span>
        <span className="room-card-detail">{slot.detail}</span>

        {slot.waitlistItems.length > 0 ? (
          <div className="room-waitlist-block">
            <strong className="waitlist-title">대기 순서</strong>
            <ol className="inline-waitlist">
              {slot.waitlistItems.map((item, index) => (
                <li key={item.id ?? `${item.communityName}-${index}`}>
                  {index + 1}. {item.communityName} / {item.requesterName}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </article>
    );
  }

  function statusRoomButton(room) {
    const metrics = getRoomMetrics(room);

    return (
      <button
        type="button"
        key={room.id}
        className={`room-chip-button ${Number(room.id) === Number(selectedRoom?.id) ? "is-active" : ""}`}
        onClick={() => {
          setSelectedRoomId(room.id);
          setSelectedSlotId(pickSlotId(room, selectedSlotId, appState.selectedSlotId));
        }}
      >
        <strong>{room.name}</strong>
        <span>{metrics.openCount > 0 ? `바로 예약 ${metrics.openCount}타임` : metrics.badge}</span>
      </button>
    );
  }

  return (
    <main className="page-shell">
      <header className="top-bar">
        <button type="button" className="brand-button" onClick={handleBrandTap}>
          <span className="brand-wordmark">KOINORI</span>
        </button>
      </header>

      {flash ? (
        <div className={`flash flash-${flash.level}`} onClick={clearFlash} role="status">
          {flash.message}
        </div>
      ) : null}

      {screen === "intro" ? (
        <section className="page-card intro-page is-active">
          <article className="hero-card intro-hero-card">
            <h1>주일 룸 예약</h1>
            <p className="hero-text">큰 버튼만 순서대로 누르면 예약할 수 있습니다.</p>

            <div className="hero-meta">
              <div>
                <span>예약 날짜</span>
                <strong>{appState.selectedDateLabel}</strong>
              </div>
              <div>
                <span>예약 시작</span>
                <strong>{appState.bookingOpenAtLabel}</strong>
              </div>
              <div>
                <span>현재 시각</span>
                <strong className="split-time">
                  <span className="split-time-date">{liveDateFormatter.format(nowMs)}</span>
                  <span className="split-time-clock">{liveTimeFormatter.format(nowMs)}</span>
                </strong>
              </div>
            </div>

            <div className={`status-banner status-${liveStatus.kind}`}>{liveStatus.message}</div>

            {bookingIsOpen ? (
              <>
                <div className="page-actions intro-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!bookingIsOpen}
                    onClick={() => goToScreen("room")}
                  >
                    예약 시작
                  </button>
                  <button type="button" className="secondary-button" onClick={openCancelModal}>
                    예약 취소
                  </button>
                </div>

                <article className="overview-banner">
                  <strong>지금 바로 예약 가능한 시간 {appState.summary.remainingAssignments}개</strong>
                  <span>
                    예약 완료 {appState.summary.totalConfirmed}팀
                    {appState.summary.totalWaitlisted > 0
                      ? ` · 대기 ${appState.summary.totalWaitlisted}팀`
                      : " · 현재 대기 없음"}
                  </span>
                </article>
              </>
            ) : (
              <div className="page-actions intro-actions">
                <button type="button" className="primary-button" disabled>
                  목요일 10:00부터 예약과 취소 가능
                </button>
                <button type="button" className="secondary-button" onClick={() => goToScreen("status")}>
                  예약 현황 보기
                </button>
              </div>
            )}

            <div className="notice-stack" aria-label="필수 안내">
              {introNotices.map(renderNoticeCard)}
            </div>
          </article>
        </section>
      ) : null}

      {screen !== "intro" && screen !== "status" ? (
        <div className="progress-track" aria-label="예약 단계">
          {[
            [1, "방 선택"],
            [2, "시간 선택"],
            [3, "신청"],
          ].map(([step, label]) => renderProgressStep(step, label))}
        </div>
      ) : null}

      {screen === "room" ? (
        <section className="page-card is-active">
          <div className="section-heading compact-heading">
            <div>
              <h2>방을 고르세요</h2>
            </div>
            <p className="section-guide">바로 예약할 방을 한 번 누르세요.</p>
          </div>

          <div className="room-selector-grid">{rooms.map(renderRoomCard)}</div>

          <div className="page-actions compact-actions">
            <button type="button" className="secondary-button" onClick={() => goToScreen("intro")}>
              처음으로
            </button>
          </div>
        </section>
      ) : null}

      {screen === "slot" ? (
        <section className="page-card is-active">
          <div className="section-heading compact-heading">
            <div>
              <h2>시간을 고르세요</h2>
            </div>
            <p className="section-guide">먼저 바로 예약 가능한 시간을 보세요.</p>
          </div>

          <div className="selection-banner">
            <strong>{selectedRoom ? selectedRoom.name : "선택한 방 없음"}</strong>
            <span>
              {selectedRoom
                ? `${getRoomMetrics(selectedRoom).openCount}개 시간 바로 예약 가능`
                : "먼저 방을 선택해 주세요."}
            </span>
          </div>

          <section className="slot-section">
            <div className="slot-section-head">
              <strong>바로 예약 가능</strong>
              <span>{slotGroups.reserve.length}개</span>
            </div>
            {slotGroups.reserve.length ? (
              <div className="choice-grid">{slotGroups.reserve.map(renderSlotCard)}</div>
            ) : (
              <div className="empty-state">지금 바로 예약 가능한 시간은 없습니다.</div>
            )}
          </section>

          <section className="slot-section">
            <div className="slot-section-head">
              <strong>대기 가능</strong>
              <span>{slotGroups.waitlist.length}개</span>
            </div>
            {slotGroups.waitlist.length ? (
              <div className="choice-grid">{slotGroups.waitlist.map(renderSlotCard)}</div>
            ) : (
              <div className="empty-state">현재 대기 가능한 시간은 없습니다.</div>
            )}
          </section>

          <div className="page-actions compact-actions">
            <button type="button" className="secondary-button" onClick={() => goToScreen("room")}>
              방 다시 선택
            </button>
          </div>
        </section>
      ) : null}

      {screen === "form" ? (
        <section className="page-card is-active">
          <div className="section-heading compact-heading">
            <div>
              <h2>신청서 작성</h2>
            </div>
            <p className="section-guide">선택 내용을 확인하고 필수 항목만 입력하세요.</p>
          </div>

          <div className="selection-summary compact-summary-card">
            <div>
              <span>방</span>
              <strong>{selectedRoom ? selectedRoom.name : "선택 전"}</strong>
            </div>
            <div>
              <span>시간</span>
              <strong>{selectedSlot ? `${selectedSlot.label} ${selectedSlot.timeRange}` : "선택 전"}</strong>
            </div>
            <div>
              <span>접수</span>
              <strong>
                {waitlistPrompt
                  ? `대기 ${waitlistPrompt.waitlistPosition}번 가능`
                  : selectedSlot?.actionType === "waitlist"
                    ? "대기 가능"
                    : "즉시 예약"}
              </strong>
            </div>
          </div>

          {formNotices.length ? <div className="notice-stack notice-stack-compact">{formNotices.map(renderNoticeCard)}</div> : null}

          <form
            className="booking-form compact-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handlePrimarySubmit();
            }}
          >
            <label className="field">
              <span>공동체 이름</span>
              <input
                type="text"
                value={formValues.communityName}
                onChange={(event) => changeFormValue("communityName", event.target.value)}
                placeholder="예: 김선목속"
                required
              />
            </label>

            <label className="field">
              <span>신청자 이름</span>
              <input
                type="text"
                value={formValues.requesterName}
                onChange={(event) => changeFormValue("requesterName", event.target.value)}
                placeholder="예: 홍길동"
                required
              />
            </label>

            <label className="field">
              <span>인원 수</span>
              <input
                type="number"
                min={minAttendees}
                step="1"
                inputMode="numeric"
                value={formValues.attendees}
                onChange={(event) => {
                  changeFormValue("attendees", event.target.value);
                  setAttendeesTouched(true);
                }}
                required
              />
              <small className="field-error" hidden={!showAttendeesError}>
                최소 {minAttendees}명부터 신청할 수 있습니다.
              </small>
            </label>

            <label className="field">
              <span>연락처</span>
              <input
                type="tel"
                inputMode="tel"
                value={formValues.contact}
                onChange={(event) => changeFormValue("contact", event.target.value)}
                placeholder="문자나 전화 가능한 번호"
                required
              />
            </label>

            <label className="field field-wide">
              <span>메모 (선택)</span>
              <textarea
                rows="3"
                value={formValues.note}
                onChange={(event) => changeFormValue("note", event.target.value)}
                placeholder="필요한 메모만 적어 주세요."
              />
            </label>

            <div className="page-actions compact-actions">
              <button type="button" className="secondary-button" onClick={() => goToScreen("slot")}>
                시간 다시 선택
              </button>
              <button type="submit" className="primary-button" disabled={!canSubmit}>
                {isSubmitting
                  ? "처리 중입니다"
                  : waitlistPrompt || selectedSlot?.actionType === "waitlist"
                    ? "대기 여부 확인"
                    : "예약 신청"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {screen === "status" ? (
        <section className="page-card is-active compact-card">
          <div className="section-heading compact-heading">
            <div>
              <h2>현재 예약 현황</h2>
            </div>
            <p className="section-guide">방을 누르면 시간별 예약 상태를 볼 수 있습니다.</p>
          </div>

          {renderRecentActionCard()}

          {bookingIsOpen ? (
            <div className="page-actions compact-actions compact-actions-top">
              <button type="button" className="danger-button" onClick={openCancelModal}>
                예약 취소
              </button>
            </div>
          ) : null}

          <div className="room-tab-grid">{rooms.map(statusRoomButton)}</div>

          {selectedRoom ? (
            <section className="board-room-panel is-active">
              <div className="selection-banner compact-banner">
                <strong>{selectedRoom.name}</strong>
                <span>시간별 상태를 큰 카드로 확인할 수 있습니다.</span>
              </div>
              <div className="choice-grid">{selectedRoom.slots.map(renderStatusSlot)}</div>
            </section>
          ) : null}
        </section>
      ) : null}

      <nav className="public-dock" aria-label="빠른 이동">
        <button
          type="button"
          className={`public-dock-button ${publicDockState === "intro" ? "is-active" : ""}`}
          onClick={() => goToScreen("intro")}
        >
          안내
        </button>
        <button
          type="button"
          className={`public-dock-button ${publicDockState === "booking" ? "is-active" : ""}`}
          onClick={() => goToScreen("room")}
          disabled={!bookingIsOpen}
        >
          예약
        </button>
        <button
          type="button"
          className={`public-dock-button ${publicDockState === "status" ? "is-active" : ""}`}
          onClick={() => goToScreen("status")}
        >
          현황
        </button>
      </nav>

      {adminModalOpen ? (
        <div className="modal-shell" onClick={(event) => event.target === event.currentTarget && setAdminModalOpen(false)}>
          <div className="modal-card">
            <button type="button" className="modal-close" onClick={() => setAdminModalOpen(false)}>
              닫기
            </button>
            <div className="modal-brand">
              <span className="brand-wordmark modal-wordmark">KOINORI</span>
              <p className="eyebrow">관리자 전용</p>
            </div>
            <h2>운영 화면 로그인</h2>
            <p className="modal-text">운영 비밀번호를 입력하면 관리자 화면으로 이동합니다.</p>
            <form method="post" action="/admin/login" className="login-form">
              <input type="hidden" name="returnTo" value={appState.adminReturnTo} />
              <label className="field">
                <span>관리 비밀번호</span>
                <input type="password" name="adminKey" inputMode="numeric" autoComplete="current-password" required />
              </label>
              <button type="submit" className="primary-button">
                관리자 들어가기
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {waitlistModalOpen ? (
        <div className="modal-shell" onClick={(event) => event.target === event.currentTarget && setWaitlistModalOpen(false)}>
          <div className="modal-card">
            <button type="button" className="modal-close" onClick={() => setWaitlistModalOpen(false)}>
              닫기
            </button>
            <div className="modal-brand">
              <span className="brand-wordmark modal-wordmark">KOINORI</span>
              <p className="eyebrow">WAITLIST</p>
            </div>
            <h2>대기 명단에 올릴까요?</h2>
            <p className="modal-text">{buildWaitlistMessage(selectedRoom, selectedSlot, waitlistPrompt)}</p>
            <div className="page-actions compact-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setWaitlistModalOpen(false);
                  goToScreen("slot");
                }}
              >
                다른 시간 보기
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void submitReservation(true);
                }}
              >
                대기 신청하기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelModalOpen ? (
        <div className="modal-shell" onClick={(event) => event.target === event.currentTarget && setCancelModalOpen(false)}>
          <div className="modal-card">
            <button type="button" className="modal-close" onClick={() => setCancelModalOpen(false)}>
              닫기
            </button>
            <div className="modal-brand">
              <span className="brand-wordmark modal-wordmark">KOINORI</span>
            </div>
            <h2>예약 취소</h2>
            <p className="modal-text">예약번호와 연락처 뒤 4자리를 입력해 주세요.</p>
            <form
              className="login-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitCancellation();
              }}
            >
              <label className="field">
                <span>예약번호</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cancelValues.reservationNumber}
                  onChange={(event) => changeCancelValue("reservationNumber", event.target.value)}
                  placeholder="예: 0123"
                  required
                />
              </label>
              <label className="field">
                <span>연락처 뒤 4자리</span>
                <input
                  type="password"
                  inputMode="numeric"
                  value={cancelValues.contactLastFour}
                  onChange={(event) => changeCancelValue("contactLastFour", event.target.value)}
                  placeholder="예: 0191"
                  required
                />
              </label>
              <button type="submit" className="primary-button" disabled={cancelSubmitting}>
                {cancelSubmitting ? "처리 중입니다" : "예약 취소하기"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

const initialState = readInitialState();

if (initialState) {
  const rootElement = document.getElementById("root");

  if (rootElement) {
    createRoot(rootElement).render(<App initialState={initialState} />);
  }
}
