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
  const openCount = room.slots.filter((slot) => slot.actionType === "reserve").length;
  const waitCount = room.slots.filter((slot) => slot.actionType === "waitlist").length;
  const fixedCount = room.slots.filter((slot) => slot.status === "fixed").length;
  const closedCount = room.slots.filter((slot) => slot.status === "closed").length;
  const operationCount = room.slots.filter((slot) => slot.status !== "closed").length;
  let state = "closed";
  let badge = "예약 불가";
  let action = "선택 불가";

  if (openCount > 0) {
    state = "open";
    badge = `예약 가능 ${openCount}타임`;
    action = "이 방 선택";
  } else if (waitCount > 0) {
    state = "wait";
    badge = "대기 가능";
    action = "대기 확인";
  } else if (fixedCount === room.slots.length) {
    state = "fixed";
    badge = "고정 사용";
  }

  return {
    openCount,
    waitCount,
    fixedCount,
    closedCount,
    operationCount,
    state,
    badge,
    action,
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
    return "예약 중";
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

  return `${room.name} ${slot.label} ${slot.timeRange}은 이미 사용 중입니다. 지금 신청하면 대기 ${nextPosition}번으로 등록됩니다.`;
}

function applyServerState(nextState, setAppState, setScreen, setSelectedRoomId, setSelectedSlotId, setFormValues, setFlash, setWaitlistPrompt) {
  startTransition(() => {
    setAppState(nextState);
    setScreen(nextState.initialScreen || "intro");
    setSelectedRoomId(nextState.selectedRoomId);
    setSelectedSlotId(nextState.selectedSlotId);
    setFormValues({
      ...nextState.formValues,
      attendees: String(nextState.formValues.attendees ?? ""),
    });
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
  const [flash, setFlash] = useState(
    initialState.flashMessage
      ? { message: initialState.flashMessage, level: initialState.flashLevel || "info" }
      : null,
  );
  const [waitlistPrompt, setWaitlistPrompt] = useState(initialState.waitlistPrompt || null);
  const [waitlistModalOpen, setWaitlistModalOpen] = useState(Boolean(initialState.waitlistPrompt));
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [attendeesTouched, setAttendeesTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const hasErrorState = appState.bookingStatus.kind === "error" && !appState.bookingStatus.open;
  const bookingIsOpen =
    !hasErrorState && Number.isFinite(bookingOpenAtMs) ? nowMs >= bookingOpenAtMs : Boolean(appState.bookingStatus.open);
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
    : bookingIsOpen
      ? { kind: "open", message: "예약이 열려 있습니다. 큰 버튼을 눌러 진행해 주세요." }
      : appState.bookingStatus;

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
    setScreen("slot");
  }

  function selectSlot(slotId) {
    if (!selectedRoom) {
      return;
    }

    setSelectedSlotId(slotId);
    clearWaitlistPrompt(selectedRoom.id, slotId);
    setScreen("form");
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

  function renderRoomCard(room) {
    const metrics = getRoomMetrics(room);
    const roomDetailParts = [];

    if (metrics.waitCount > 0) {
      roomDetailParts.push(`대기 가능 ${metrics.waitCount}타임`);
    }

    if (metrics.fixedCount > 0) {
      roomDetailParts.push(`고정 ${metrics.fixedCount}타임`);
    }

    if (metrics.closedCount > 0) {
      roomDetailParts.push(`미운영 ${metrics.closedCount}타임`);
    }

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
          <small>{metrics.badge}</small>
        </span>
        <span className="room-pick-stats">
          <span className="room-pick-stat">
            <span>예약 가능한 타임</span>
            <strong>{metrics.openCount}</strong>
          </span>
          <span className="room-pick-stat">
            <span>운영 타임</span>
            <strong>{metrics.operationCount}</strong>
          </span>
        </span>
        <span className="room-pick-detail">
          {roomDetailParts.join(" · ") || "예약 가능한 시간을 확인해 주세요."}
        </span>
        <span className="room-pick-action">{metrics.action}</span>
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
        <span className="slot-card-badge">{slot.actionLabel}</span>
        <span className="slot-card-title">{slot.title}</span>
        <span className="slot-card-detail">{slot.detail}</span>
      </button>
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
          <ol className="inline-waitlist">
            {slot.waitlistItems.map((item, index) => (
              <li key={item.id ?? `${item.communityName}-${index}`}>
                {index + 1}. {item.communityName} / {item.requesterName}
              </li>
            ))}
          </ol>
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
        <span>예약 가능 {metrics.openCount}타임</span>
      </button>
    );
  }

  return (
    <main className="page-shell">
      <header className="top-bar">
        <button type="button" className="brand-button" onClick={handleBrandTap}>
          <span className="brand-wordmark">KOINORI</span>
          <span className="brand-copy">
            <strong>{screen === "status" ? "예약 현황" : "주일 룸 예약"}</strong>
            <small>{appState.selectedDateLabel} 자동 선택</small>
          </span>
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
            <p className="eyebrow">SUNDAY ROOM BOOKING</p>
            <h1>주일 룸 예약</h1>
            <p className="hero-text">같은 화면에서 천천히 따라오면 됩니다. 방을 고르고, 시간을 고르고, 신청하면 끝입니다.</p>

            <div className="hero-meta">
              <div>
                <span>예약 대상</span>
                <strong>{appState.selectedDateLabel}</strong>
              </div>
              <div>
                <span>예약 오픈</span>
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

            <div className="guide-steps" aria-label="예약 순서 안내">
              <article className="guide-step-card">
                <strong>1. 방 선택</strong>
                <span>사용할 방 하나를 먼저 고릅니다.</span>
              </article>
              <article className="guide-step-card">
                <strong>2. 시간 선택</strong>
                <span>원하는 타임을 누르면 바로 다음으로 넘어갑니다.</span>
              </article>
              <article className="guide-step-card">
                <strong>3. 신청 완료</strong>
                <span>이름, 인원, 연락처만 입력하면 됩니다.</span>
              </article>
            </div>

            <div className="summary-strip intro-summary">
              <article className="summary-card">
                <span>예약 완료</span>
                <strong>{appState.summary.totalConfirmed}</strong>
              </article>
              <article className="summary-card">
                <span>대기 팀</span>
                <strong>{appState.summary.totalWaitlisted}</strong>
              </article>
              <article className="summary-card">
                <span>남은 방</span>
                <strong>{appState.summary.remainingAssignments}</strong>
              </article>
              <article className="summary-card">
                <span>가동률</span>
                <strong>{appState.summary.occupancyPercent}%</strong>
              </article>
            </div>

            <div className="page-actions intro-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!bookingIsOpen}
                onClick={() => setScreen("room")}
              >
                {hasErrorState
                  ? "예약 가능 날짜가 아닙니다"
                  : bookingIsOpen
                    ? "방 선택하기"
                    : "목요일 10:00부터 예약 시작"}
              </button>
              <button type="button" className="secondary-button" onClick={() => setScreen("status")}>
                예약 현황 보기
              </button>
            </div>
          </article>
        </section>
      ) : null}

      {screen !== "intro" && screen !== "status" ? (
        <nav className="page-tabs workflow-tabs" aria-label="예약 단계">
          <button
            type="button"
            className={`page-tab ${screen === "room" ? "is-active" : ""}`}
            onClick={() => setScreen("room")}
          >
            1. 방
          </button>
          <button
            type="button"
            className={`page-tab ${screen === "slot" ? "is-active" : ""}`}
            onClick={() => setScreen("slot")}
          >
            2. 시간
          </button>
          <button
            type="button"
            className={`page-tab ${screen === "form" ? "is-active" : ""}`}
            onClick={() => setScreen("form")}
          >
            3. 신청
          </button>
        </nav>
      ) : null}

      {screen === "room" ? (
        <section className="page-card is-active">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">STEP 1</p>
              <h2>방을 먼저 고르세요</h2>
            </div>
            <p className="section-guide">카드를 한 번만 눌러 선택하면 다음 화면에서 그 방의 시간을 고를 수 있습니다.</p>
          </div>

          <div className="summary-strip compact-summary">
            <article className="summary-card">
              <span>예약 가능한 타임</span>
              <strong>{appState.summary.openSlotCount}</strong>
            </article>
            <article className="summary-card">
              <span>운영 타임</span>
              <strong>{appState.summary.reservableSlotCount}</strong>
            </article>
            <article className="summary-card">
              <span>확정 예약</span>
              <strong>{appState.summary.totalConfirmed}</strong>
            </article>
            <article className="summary-card">
              <span>대기 팀</span>
              <strong>{appState.summary.totalWaitlisted}</strong>
            </article>
          </div>

          <div className="room-selector-grid">{rooms.map(renderRoomCard)}</div>

          <div className="page-actions compact-actions">
            <button type="button" className="secondary-button" onClick={() => setScreen("intro")}>
              처음으로
            </button>
          </div>
        </section>
      ) : null}

      {screen === "slot" ? (
        <section className="page-card is-active">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">STEP 2</p>
              <h2>이제 시간을 고르세요</h2>
            </div>
            <p className="section-guide">비어 있는 시간은 바로 예약되고, 이미 찬 시간은 대기 등록 여부를 한 번 더 묻습니다.</p>
          </div>

          <div className="selection-banner">
            <strong>{selectedRoom ? selectedRoom.name : "선택한 방 없음"}</strong>
            <span>
              {selectedRoom
                ? `${getRoomMetrics(selectedRoom).openCount}개 시간 바로 예약 가능`
                : "먼저 방을 선택해 주세요."}
            </span>
          </div>

          <div className="choice-grid">{selectedRoom ? selectedRoom.slots.map(renderSlotCard) : null}</div>

          <div className="page-actions compact-actions">
            <button type="button" className="secondary-button" onClick={() => setScreen("room")}>
              방 다시 선택
            </button>
          </div>
        </section>
      ) : null}

      {screen === "form" ? (
        <section className="page-card is-active">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">STEP 3</p>
              <h2>신청서 작성</h2>
            </div>
            <p className="section-guide">필수 항목만 짧게 입력하면 됩니다.</p>
          </div>

          <div className="selection-summary compact-summary-card">
            <div>
              <span>예약 날짜</span>
              <strong>{appState.selectedDateLabel}</strong>
            </div>
            <div>
              <span>선택 방</span>
              <strong>{selectedRoom ? selectedRoom.name : "선택 전"}</strong>
            </div>
            <div>
              <span>선택 시간</span>
              <strong>{selectedSlot ? `${selectedSlot.label} ${selectedSlot.timeRange}` : "선택 전"}</strong>
            </div>
            <div>
              <span>접수 방식</span>
              <strong>
                {waitlistPrompt
                  ? `대기 ${waitlistPrompt.waitlistPosition}번 가능`
                  : selectedSlot?.actionType === "waitlist"
                    ? "대기 가능"
                    : "즉시 예약"}
              </strong>
            </div>
          </div>

          <div className="helper-box compact-helper">
            {waitlistPrompt
              ? "먼저 신청한 팀이 있어 대기 등록 여부를 팝업으로 한 번 더 확인합니다."
              : selectedSlot?.actionType === "waitlist"
                ? "이미 사용 중인 시간입니다. 신청하면 대기 여부를 팝업으로 묻습니다."
                : "지금 비어 있는 시간이면 신청 즉시 예약이 완료됩니다."}
          </div>

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
              <span>메모</span>
              <textarea
                rows="3"
                value={formValues.note}
                onChange={(event) => changeFormValue("note", event.target.value)}
                placeholder="필요한 메모만 적어 주세요."
              />
            </label>

            <div className="page-actions compact-actions">
              <button type="button" className="secondary-button" onClick={() => setScreen("slot")}>
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
              <p className="eyebrow">STATUS</p>
              <h2>현재 예약 현황</h2>
            </div>
            <p className="section-guide">방을 누르면 그 방의 시간별 상태와 대기 순서를 바로 볼 수 있습니다.</p>
          </div>

          <div className="summary-strip compact-summary">
            <article className="summary-card">
              <span>확정 예약</span>
              <strong>{appState.summary.totalConfirmed}</strong>
            </article>
            <article className="summary-card">
              <span>대기 팀</span>
              <strong>{appState.summary.totalWaitlisted}</strong>
            </article>
            <article className="summary-card">
              <span>남은 방</span>
              <strong>{appState.summary.remainingAssignments}</strong>
            </article>
            <article className="summary-card">
              <span>가동률</span>
              <strong>{appState.summary.occupancyPercent}%</strong>
            </article>
          </div>

          <div className="room-tab-grid">{rooms.map(statusRoomButton)}</div>

          {selectedRoom ? (
            <section className="board-room-panel is-active">
              <div className="selection-banner compact-banner">
                <strong>{selectedRoom.name}</strong>
                <span>큰 카드로 시간별 상태를 바로 확인할 수 있습니다.</span>
              </div>
              <div className="choice-grid">{selectedRoom.slots.map(renderStatusSlot)}</div>
            </section>
          ) : null}

          <div className="page-actions compact-actions">
            <button type="button" className="secondary-button" onClick={() => setScreen("intro")}>
              예약 화면으로 돌아가기
            </button>
          </div>
        </section>
      ) : null}

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
                  setScreen("slot");
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
