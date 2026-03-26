function readState(id) {
  const element = document.getElementById(id);

  if (!element) {
    return null;
  }

  try {
    return JSON.parse(element.textContent || "{}");
  } catch (_error) {
    return null;
  }
}

function setActivePage(pageName, options = {}) {
  const pageCards = Array.from(document.querySelectorAll("[data-page]"));
  const pageButtons = Array.from(document.querySelectorAll("[data-go-page]"));
  const workflowNavs = Array.from(document.querySelectorAll("[data-workflow-nav]"));
  const shouldShowWorkflow = pageName !== "intro";

  pageCards.forEach((card) => {
    card.classList.toggle("is-active", card.dataset.page === pageName);
  });

  pageButtons.forEach((button) => {
    if (button.classList.contains("page-tab")) {
      button.classList.toggle("is-active", button.dataset.goPage === pageName);
    }
  });

  workflowNavs.forEach((nav) => {
    nav.hidden = !shouldShowWorkflow;
  });

  if (options.scroll !== false) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function initPublicPage(publicState) {
  const slotIdInput = document.getElementById("slot-id-input");
  const roomIdInput = document.getElementById("room-id-input");
  const waitlistConsentInput = document.getElementById("waitlist-consent-input");
  const dateInput = document.getElementById("reservation-date-input");
  const bookingForm = document.getElementById("booking-form");
  const submitButton = document.getElementById("booking-submit-button");
  const introConfirmButton = document.getElementById("intro-confirm-button");
  const liveCurrentTime = document.getElementById("live-current-time");
  const bookingStatusBanner = document.getElementById("booking-status-banner");
  const summaryRoomLabel = document.getElementById("summary-room-label");
  const summarySlotLabel = document.getElementById("summary-slot-label");
  const summaryModeLabel = document.getElementById("summary-mode-label");
  const guidanceBox = document.getElementById("form-guidance-box");
  const attendeesInput = document.getElementById("attendees-input");
  const attendeesError = document.getElementById("attendees-error");
  const contactInput = document.getElementById("contact-input");
  const selectedRoomBanner = document.getElementById("selected-room-banner");
  const roomPickButtons = Array.from(document.querySelectorAll("[data-select-room]"));
  const roomPanels = Array.from(document.querySelectorAll("[data-room-slots]"));
  const slotButtons = Array.from(document.querySelectorAll("[data-select-slot]"));
  const pageButtons = Array.from(document.querySelectorAll("[data-go-page]"));
  const modal = document.getElementById("admin-access-modal");
  const modalClose = document.getElementById("admin-modal-close");
  const adminTrigger = document.getElementById("admin-secret-trigger");
  const waitlistModal = document.getElementById("waitlist-modal");
  const waitlistModalClose = document.getElementById("waitlist-modal-close");
  const waitlistModalMessage = document.getElementById("waitlist-modal-message");
  const waitlistConfirmButton = document.getElementById("waitlist-confirm-button");
  const waitlistDeclineButton = document.getElementById("waitlist-decline-button");

  if (!slotIdInput || !roomIdInput || !submitButton || !bookingForm) {
    return;
  }

  const state = {
    currentPage: publicState.initialPage || "intro",
    selectedDate: publicState.selectedDate,
    selectedRoomId: Number(publicState.formValues.roomId || publicState.defaultRoomId || 0),
    selectedSlotId: Number(publicState.formValues.slotId || publicState.defaultSlotId || 0),
    waitlistPrompt: publicState.waitlistPrompt || null,
    tapCount: 0,
    tapResetTimer: null,
    waitlistModalOpenedFromPrompt: false,
  };
  const serverNowMs = Date.parse(publicState.serverNowIso || "");
  const bookingOpenAtMs = Date.parse(publicState.bookingOpenAtIso || "");
  const clientClockStartMs = Date.now();
  const liveClockFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 2,
    hour12: false,
  });

  function getEstimatedServerNow() {
    if (!Number.isFinite(serverNowMs)) {
      return new Date();
    }

    return new Date(serverNowMs + (Date.now() - clientClockStartMs));
  }

  function syncLiveBookingState() {
    const now = getEstimatedServerNow();
    const hasErrorState =
      publicState.bookingStatus.kind === "error" && !Boolean(publicState.bookingStatus.open);
    const isOpen = Number.isFinite(bookingOpenAtMs)
      ? !hasErrorState && now.getTime() >= bookingOpenAtMs
      : Boolean(publicState.bookingStatus.open);
    const wasOpen = Boolean(publicState.bookingStatus.open);

    if (liveCurrentTime) {
      liveCurrentTime.textContent = liveClockFormatter.format(now);
    }

    if (introConfirmButton) {
      introConfirmButton.disabled = !isOpen;
      introConfirmButton.textContent = hasErrorState
        ? "예약 가능 날짜가 아닙니다"
        : isOpen
          ? "확인하고 예약 보기"
          : "목요일 10:00부터 예약 보기";
    }

    if (bookingStatusBanner) {
      bookingStatusBanner.classList.remove("status-open", "status-pending", "status-error");
      bookingStatusBanner.classList.add(
        hasErrorState ? "status-error" : isOpen ? "status-open" : "status-pending",
      );
      bookingStatusBanner.textContent =
        hasErrorState && !isOpen
          ? publicState.bookingStatus.message
          : isOpen
            ? "예약이 열려 있습니다. 원하는 방을 먼저 선택해 주세요."
            : publicState.bookingStatus.message;
    }

    publicState.bookingStatus.open = isOpen;

    if (hasErrorState || !isOpen) {
      publicState.bookingStatus.kind = "pending";

      if (hasErrorState) {
        publicState.bookingStatus.kind = "error";
      }

      return wasOpen !== isOpen;
    }

    publicState.bookingStatus.kind = "open";
    publicState.bookingStatus.message = "예약이 열려 있습니다. 원하는 방을 먼저 선택해 주세요.";
    return wasOpen !== isOpen;
  }

  function getRoom(roomId) {
    return publicState.roomDetails.find((room) => room.id === Number(roomId)) || null;
  }

  function pickSlotForRoom(room, preferredSlotId) {
    if (!room) {
      return null;
    }

    return (
      room.slots.find(
        (slot) => Number(slot.slotId) === Number(preferredSlotId) && Boolean(slot.interactive),
      ) ||
      room.slots.find((slot) => Number(slot.slotId) === Number(preferredSlotId)) ||
      room.slots.find((slot) => Boolean(slot.interactive)) ||
      room.slots[0] ||
      null
    );
  }

  function getSelectedRoom() {
    return getRoom(state.selectedRoomId);
  }

  function getSelectedSlot() {
    const room = getSelectedRoom();

    if (!room) {
      return null;
    }

    return room.slots.find((slot) => Number(slot.slotId) === Number(state.selectedSlotId)) || null;
  }

  function matchesPrompt(roomId, slotId) {
    return Boolean(
      state.waitlistPrompt &&
        Number(state.waitlistPrompt.roomId) === Number(roomId) &&
        Number(state.waitlistPrompt.slotId) === Number(slotId),
    );
  }

  function getMinAttendees() {
    const rawMin = Number.parseInt(attendeesInput ? attendeesInput.min : "", 10);

    return Number.isInteger(rawMin) ? rawMin : 4;
  }

  function isAttendeesValid() {
    if (!attendeesInput || attendeesInput.value === "") {
      return false;
    }

    const numericValue = Number.parseInt(attendeesInput.value, 10);

    return Number.isInteger(numericValue) && numericValue >= getMinAttendees();
  }

  function updateAttendeesValidation() {
    if (!attendeesInput) {
      return true;
    }

    const isValid = isAttendeesValid();
    const shouldShowError = attendeesInput.value !== "" && !isValid;

    attendeesInput.setCustomValidity(
      shouldShowError ? `최소 ${getMinAttendees()}명부터 신청할 수 있습니다.` : "",
    );

    if (attendeesError) {
      attendeesError.hidden = !shouldShowError;
    }

    return isValid;
  }

  function closeWaitlistModal() {
    if (waitlistModal) {
      waitlistModal.hidden = true;
    }
  }

  function openWaitlistModal(message) {
    if (!waitlistModal || !waitlistModalMessage) {
      return;
    }

    waitlistModalMessage.textContent = message;
    waitlistModal.hidden = false;
  }

  function buildWaitlistMessage() {
    const room = getSelectedRoom();
    const slot = getSelectedSlot();

    if (!room || !slot) {
      return "이 시간은 먼저 접수된 팀이 있어 대기 여부를 먼저 확인합니다.";
    }

    if (matchesPrompt(room.id, slot.slotId)) {
      return (
        state.waitlistPrompt.message ||
        `${room.name} ${slot.label} 대기 등록 여부를 확인해 주세요.`
      );
    }

    const nextPosition = Number(slot.waitlistCount || 0) + 1;

    return `${room.name} ${slot.label} ${slot.timeRange}은 이미 사용 중입니다. 지금 신청하면 대기 ${nextPosition}번으로 등록됩니다.`;
  }

  function clearPromptIfSelectionChanged(roomId, slotId) {
    if (!state.waitlistPrompt) {
      return;
    }

    if (!matchesPrompt(roomId, slotId)) {
      state.waitlistPrompt = null;
      state.waitlistModalOpenedFromPrompt = false;
      waitlistConsentInput.value = "0";
      closeWaitlistModal();
    }
  }

  function ensureSelection() {
    let room = getSelectedRoom();

    if (!room) {
      room =
        getRoom(publicState.defaultRoomId) ||
        publicState.roomDetails.find((entry) => entry.slots.some((slot) => slot.interactive)) ||
        publicState.roomDetails[0] ||
        null;
      state.selectedRoomId = room ? room.id : null;
    }

    const selectedRoom = getSelectedRoom();
    const selectedSlot = pickSlotForRoom(selectedRoom, state.selectedSlotId || publicState.defaultSlotId);

    state.selectedSlotId = selectedSlot ? selectedSlot.slotId : null;
  }

  function setRoom(roomId, preferredSlotId) {
    const nextRoom = getRoom(roomId);

    if (!nextRoom) {
      return;
    }

    state.selectedRoomId = nextRoom.id;
    const nextSlot = pickSlotForRoom(nextRoom, preferredSlotId || publicState.defaultSlotId);

    state.selectedSlotId = nextSlot ? nextSlot.slotId : null;
    clearPromptIfSelectionChanged(state.selectedRoomId, state.selectedSlotId);
  }

  function setSlot(roomId, slotId) {
    const nextRoom = getRoom(roomId);

    if (!nextRoom) {
      return;
    }

    state.selectedRoomId = nextRoom.id;
    const nextSlot = pickSlotForRoom(nextRoom, slotId);

    state.selectedSlotId = nextSlot ? nextSlot.slotId : null;
    clearPromptIfSelectionChanged(state.selectedRoomId, state.selectedSlotId);
  }

  function updateRoomCards() {
    roomPickButtons.forEach((button) => {
      button.classList.toggle("is-selected", Number(button.dataset.selectRoom) === Number(state.selectedRoomId));
    });
  }

  function updateRoomPanels() {
    const room = getSelectedRoom();
    const bannerTitle = selectedRoomBanner ? selectedRoomBanner.querySelector("strong") : null;
    const bannerBody = selectedRoomBanner ? selectedRoomBanner.querySelector("span") : null;

    roomPanels.forEach((panel) => {
      panel.hidden = Number(panel.dataset.roomSlots) !== Number(state.selectedRoomId);
    });

    if (!room) {
      if (bannerTitle) {
        bannerTitle.textContent = "선택한 방 없음";
      }

      if (bannerBody) {
        bannerBody.textContent = "먼저 방을 선택해 주세요.";
      }

      return;
    }

    const openCount = room.slots.filter((slot) => slot.actionType === "reserve").length;
    const waitCount = room.slots.filter((slot) => slot.actionType === "waitlist").length;
    const fixedCount = room.slots.filter((slot) => slot.status === "fixed").length;
    const closedCount = room.slots.filter((slot) => slot.status === "closed").length;
    const summaryParts = [];

    if (openCount > 0) {
      summaryParts.push(`바로 예약 ${openCount}타임`);
    }

    if (waitCount > 0) {
      summaryParts.push(`대기 가능 ${waitCount}타임`);
    }

    if (fixedCount > 0) {
      summaryParts.push(`고정 ${fixedCount}타임`);
    }

    if (closedCount > 0) {
      summaryParts.push(`미운영 ${closedCount}타임`);
    }

    if (bannerTitle) {
      bannerTitle.textContent = room.name;
    }

    if (bannerBody) {
      bannerBody.textContent = summaryParts.join(" · ") || "예약 가능한 시간을 확인해 주세요.";
    }
  }

  function updateSlotCards() {
    slotButtons.forEach((button) => {
      const sameRoom = Number(button.dataset.roomId) === Number(state.selectedRoomId);
      const sameSlot = Number(button.dataset.selectSlot) === Number(state.selectedSlotId);

      button.classList.toggle("is-selected", sameRoom && sameSlot);
    });
  }

  function updateFormSummary() {
    const room = getSelectedRoom();
    const slot = getSelectedSlot();
    const hasPrompt = matchesPrompt(state.selectedRoomId, state.selectedSlotId);
    const attendeesValid = updateAttendeesValidation();

    summaryRoomLabel.textContent = room ? room.name : "선택 전";
    summarySlotLabel.textContent = slot ? `${slot.label} ${slot.timeRange}` : "선택 전";

    if (!room || !slot || !slot.interactive) {
      summaryModeLabel.textContent = "선택 전";
      submitButton.disabled = true;
      waitlistConsentInput.value = "0";
      guidanceBox.textContent = "먼저 방과 시간을 선택해 주세요.";
      return;
    }

    if (hasPrompt) {
      summaryModeLabel.textContent = `대기 ${state.waitlistPrompt.waitlistPosition}번 가능`;
      submitButton.textContent = "대기 여부 확인하기";
      submitButton.disabled = !publicState.bookingStatus.open || !attendeesValid;
      waitlistConsentInput.value = "0";
      guidanceBox.textContent = "같은 방과 시간에 먼저 예약된 팀이 있어 대기 등록 여부를 한 번 더 확인합니다.";
      return;
    }

    waitlistConsentInput.value = "0";
    submitButton.disabled = !publicState.bookingStatus.open || !attendeesValid;

    if (slot.actionType === "waitlist") {
      summaryModeLabel.textContent = "대기 가능";
      submitButton.textContent = "대기 여부 확인하기";
      guidanceBox.textContent = "이 시간은 이미 사용 중입니다. 신청하면 대기 명단 등록 여부를 먼저 묻습니다.";
      return;
    }

    summaryModeLabel.textContent = "즉시 예약";
    submitButton.textContent = "예약 신청하기";
    guidanceBox.textContent =
      "지금 비어 있는 시간입니다. 제출 순간 기준으로 가장 먼저 도착한 요청이 확정됩니다.";
  }

  function syncInputs() {
    if (dateInput) {
      dateInput.value = state.selectedDate;
    }

    slotIdInput.value = state.selectedSlotId ? String(state.selectedSlotId) : "";
    roomIdInput.value = state.selectedRoomId ? String(state.selectedRoomId) : "";
  }

  function render() {
    ensureSelection();
    updateRoomCards();
    updateRoomPanels();
    updateSlotCards();
    updateFormSummary();
    syncInputs();

    if (
      state.currentPage === "form" &&
      matchesPrompt(state.selectedRoomId, state.selectedSlotId) &&
      !state.waitlistModalOpenedFromPrompt
    ) {
      state.waitlistModalOpenedFromPrompt = true;
      openWaitlistModal(buildWaitlistMessage());
    }
  }

  function goToPage(pageName) {
    if (pageName !== "intro") {
      ensureSelection();
    }

    state.currentPage = pageName;
    setActivePage(pageName);
  }

  pageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      goToPage(button.dataset.goPage);
    });
  });

  roomPickButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setRoom(button.dataset.selectRoom);
      render();
      goToPage("slot");
    });
  });

  slotButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSlot(button.dataset.roomId, button.dataset.selectSlot);
      render();
      goToPage("form");
    });
  });

  if (attendeesInput) {
    attendeesInput.addEventListener("input", () => {
      updateAttendeesValidation();
      render();
    });
  }

  if (contactInput) {
    contactInput.addEventListener("input", () => {
      if (contactInput.value.trim()) {
        contactInput.setCustomValidity("");
      }
    });
  }

  bookingForm.addEventListener("submit", (event) => {
    const slot = getSelectedSlot();

    updateAttendeesValidation();

    if (attendeesInput && !isAttendeesValid()) {
      event.preventDefault();
      attendeesInput.reportValidity();
      return;
    }

    if (contactInput && !contactInput.value.trim()) {
      contactInput.setCustomValidity("연락처를 입력해 주세요.");
      event.preventDefault();
      contactInput.reportValidity();
      return;
    }

    if (contactInput) {
      contactInput.setCustomValidity("");
    }

    if (!slot || !slot.interactive) {
      event.preventDefault();
      return;
    }

    if (waitlistConsentInput.value === "1") {
      return;
    }

    if (slot.actionType === "waitlist" || matchesPrompt(state.selectedRoomId, state.selectedSlotId)) {
      event.preventDefault();
      openWaitlistModal(buildWaitlistMessage());
    }
  });

  if (adminTrigger && modal) {
    adminTrigger.addEventListener("click", () => {
      state.tapCount += 1;

      if (state.tapResetTimer) {
        window.clearTimeout(state.tapResetTimer);
      }

      state.tapResetTimer = window.setTimeout(() => {
        state.tapCount = 0;
      }, 1600);

      if (state.tapCount < 10) {
        return;
      }

      state.tapCount = 0;
      modal.hidden = false;
      const passwordField = modal.querySelector("input[name='adminKey']");

      if (passwordField) {
        passwordField.focus();
      }
    });
  }

  if (modalClose && modal) {
    modalClose.addEventListener("click", () => {
      modal.hidden = true;
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        modal.hidden = true;
      }
    });
  }

  if (waitlistModalClose && waitlistModal) {
    waitlistModalClose.addEventListener("click", closeWaitlistModal);

    waitlistModal.addEventListener("click", (event) => {
      if (event.target === waitlistModal) {
        closeWaitlistModal();
      }
    });
  }

  if (waitlistDeclineButton) {
    waitlistDeclineButton.addEventListener("click", () => {
      waitlistConsentInput.value = "0";
      closeWaitlistModal();
      goToPage("slot");
    });
  }

  if (waitlistConfirmButton) {
    waitlistConfirmButton.addEventListener("click", () => {
      waitlistConsentInput.value = "1";
      closeWaitlistModal();
      bookingForm.requestSubmit();
    });
  }

  if (syncLiveBookingState()) {
    render();
  }

  window.setInterval(() => {
    if (syncLiveBookingState()) {
      render();
    }
  }, 10);

  render();
  setActivePage(state.currentPage, { scroll: false });
}

function initAdminPage(adminState) {
  const pageButtons = Array.from(document.querySelectorAll("[data-go-page]"));
  const settingTabs = Array.from(document.querySelectorAll("[data-setting-slot-tab]"));
  const settingPanels = Array.from(document.querySelectorAll("[data-setting-slot]"));
  const presetButtons = Array.from(document.querySelectorAll("[data-apply-mode]"));
  const modeInputs = Array.from(document.querySelectorAll(".mode-group input[type='radio']"));

  if (!pageButtons.length) {
    return;
  }

  function activateSettingSlot(slotId) {
    settingTabs.forEach((tab) => {
      tab.classList.toggle("is-active", Number(tab.dataset.settingSlotTab) === Number(slotId));
    });

    settingPanels.forEach((panel) => {
      panel.classList.toggle("is-active", Number(panel.dataset.settingSlot) === Number(slotId));
    });
  }

  function updateModePill(input) {
    const group = input.closest(".mode-group");
    const fixedLabelField = input
      .closest(".settings-room-card")
      .querySelector("[data-fixed-label-input]");

    if (group) {
      Array.from(group.querySelectorAll(".mode-pill")).forEach((pill) => {
        const pillInput = pill.querySelector("input[type='radio']");

        pill.classList.toggle("is-selected", Boolean(pillInput && pillInput.checked));
      });
    }

    if (fixedLabelField) {
      const shouldEnable = input.value === "fixed" && input.checked && !input.disabled;

      fixedLabelField.disabled = !shouldEnable;

      if (!shouldEnable) {
        fixedLabelField.value = "";
      }
    }
  }

  pageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActivePage(button.dataset.goPage);
    });
  });

  settingTabs.forEach((button) => {
    button.addEventListener("click", () => {
      activateSettingSlot(button.dataset.settingSlotTab);
    });
  });

  modeInputs.forEach((input) => {
    updateModePill(input);

    input.addEventListener("change", () => {
      updateModePill(input);
    });
  });

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const slotId = button.dataset.targetSlot;
      const mode = button.dataset.applyMode;
      const panel = document.querySelector(`[data-setting-slot='${slotId}']`);

      if (!panel) {
        return;
      }

      Array.from(panel.querySelectorAll(".mode-group")).forEach((group) => {
        const targetInput = group.querySelector(`input[value='${mode}']`);

        if (!targetInput || targetInput.disabled) {
          return;
        }

        targetInput.checked = true;
        updateModePill(targetInput);
      });
    });
  });

  setActivePage(adminState.initialPage || "summary", { scroll: false });

  const initialSettingTab =
    settingTabs.find(
      (tab) => Number(tab.dataset.settingSlotTab) === Number(adminState.initialSettingSlotId),
    ) || settingTabs[0];

  if (initialSettingTab) {
    activateSettingSlot(initialSettingTab.dataset.settingSlotTab);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const publicState = readState("public-state");
  const adminState = readState("admin-state");

  if (publicState) {
    initPublicPage(publicState);
  }

  if (adminState) {
    initAdminPage(adminState);
  }
});
