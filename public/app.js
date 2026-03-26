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
  const submitButton = document.getElementById("booking-submit-button");
  const introConfirmButton = document.getElementById("intro-confirm-button");
  const liveCurrentTime = document.getElementById("live-current-time");
  const bookingStatusBanner = document.getElementById("booking-status-banner");
  const summaryRoomLabel = document.getElementById("summary-room-label");
  const summarySlotLabel = document.getElementById("summary-slot-label");
  const summaryModeLabel = document.getElementById("summary-mode-label");
  const guidanceBox = document.getElementById("form-guidance-box");
  const waitlistConfirmation = document.getElementById("waitlist-confirmation");
  const waitlistConfirmMessage = document.getElementById("waitlist-confirm-message");
  const selectedRoomBanner = document.getElementById("selected-room-banner");
  const roomPickButtons = Array.from(document.querySelectorAll("[data-select-room]"));
  const roomPanels = Array.from(document.querySelectorAll("[data-room-slots]"));
  const slotButtons = Array.from(document.querySelectorAll("[data-select-slot]"));
  const boardRoomTabs = Array.from(document.querySelectorAll("[data-board-room-tab]"));
  const boardPanels = Array.from(document.querySelectorAll("[data-board-room]"));
  const pageButtons = Array.from(document.querySelectorAll("[data-go-page]"));
  const modal = document.getElementById("admin-access-modal");
  const modalClose = document.getElementById("admin-modal-close");
  const adminTrigger = document.getElementById("admin-secret-trigger");

  if (!slotIdInput || !roomIdInput || !submitButton) {
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

  function clearPromptIfSelectionChanged(roomId, slotId) {
    if (!state.waitlistPrompt) {
      return;
    }

    if (!matchesPrompt(roomId, slotId)) {
      state.waitlistPrompt = null;
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

  function updateBoardPanels() {
    boardRoomTabs.forEach((button) => {
      button.classList.toggle(
        "is-active",
        Number(button.dataset.boardRoomTab) === Number(state.selectedRoomId),
      );
    });

    boardPanels.forEach((panel) => {
      panel.classList.toggle("is-active", Number(panel.dataset.boardRoom) === Number(state.selectedRoomId));
    });
  }

  function updateFormSummary() {
    const room = getSelectedRoom();
    const slot = getSelectedSlot();
    const hasPrompt = matchesPrompt(state.selectedRoomId, state.selectedSlotId);

    summaryRoomLabel.textContent = room ? room.name : "선택 전";
    summarySlotLabel.textContent = slot ? `${slot.label} ${slot.timeRange}` : "선택 전";

    if (!room || !slot || !slot.interactive) {
      summaryModeLabel.textContent = "선택 전";
      submitButton.disabled = true;
      waitlistConsentInput.value = "0";
      waitlistConfirmation.hidden = true;
      guidanceBox.textContent = "먼저 방과 시간을 선택해 주세요.";
      return;
    }

    if (hasPrompt) {
      summaryModeLabel.textContent = `대기 ${state.waitlistPrompt.waitlistPosition}번 확인`;
      submitButton.textContent = "이대로 대기 명단 올리기";
      submitButton.disabled = !publicState.bookingStatus.open;
      waitlistConsentInput.value = "1";
      waitlistConfirmation.hidden = false;
      waitlistConfirmMessage.textContent =
        state.waitlistPrompt.message ||
        "먼저 신청한 팀이 예약을 완료했습니다. 원하시면 대기 명단에 등록할 수 있습니다.";
      guidanceBox.textContent =
        "원하지 않으면 시간을 다시 고르시고, 그대로 진행하면 같은 방과 시간의 대기 명단에 등록됩니다.";
      return;
    }

    waitlistConfirmation.hidden = true;
    waitlistConsentInput.value = "0";
    submitButton.disabled = !publicState.bookingStatus.open;

    if (slot.actionType === "waitlist") {
      summaryModeLabel.textContent = "선착순 재확인 후 대기 안내";
      submitButton.textContent = "예약 가능 여부 확인하기";
      guidanceBox.textContent =
        "지금은 이미 사용 중인 시간입니다. 제출하면 서버가 선착순을 다시 확인하고 대기 등록 여부를 물어봅니다.";
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
    updateBoardPanels();
    updateFormSummary();
    syncInputs();
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

  boardRoomTabs.forEach((button) => {
    button.addEventListener("click", () => {
      const preferredSlot = state.selectedSlotId || publicState.defaultSlotId;

      setRoom(button.dataset.boardRoomTab, preferredSlot);
      render();
    });
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
