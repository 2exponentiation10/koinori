document.addEventListener("DOMContentLoaded", () => {
  const slotSelect = document.querySelector("#slot-select");
  const dateInput = document.querySelector("#reservation-date-input");
  const bookingPanel = document.querySelector("#booking-panel");
  const selectedSlotDisplay = document.querySelector("#selected-slot-display");
  const availabilityCards = Array.from(document.querySelectorAll(".availability-card[data-slot-id]"));

  if (!slotSelect || !selectedSlotDisplay || !availabilityCards.length) {
    return;
  }

  function updateSelectedSlotDisplay(slotId) {
    const matchingCard = availabilityCards.find((card) => Number(card.dataset.slotId) === Number(slotId));

    availabilityCards.forEach((card) => {
      card.classList.toggle("availability-card-selected", card === matchingCard);
    });

    if (!matchingCard) {
      return;
    }

    const label = matchingCard.dataset.slotLabel || "";
    const detail = matchingCard.dataset.slotDetail || "";

    selectedSlotDisplay.innerHTML = `현재 선택: <strong>${label}</strong><span>${detail}</span>`;
  }

  function selectSlot(slotId, shouldScroll) {
    slotSelect.value = String(slotId);
    updateSelectedSlotDisplay(slotId);

    if (shouldScroll && bookingPanel) {
      bookingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    slotSelect.focus();
  }

  availabilityCards.forEach((card) => {
    card.addEventListener("click", () => {
      const slotId = Number(card.dataset.slotId);

      if (!slotId) {
        return;
      }

      if (dateInput && !dateInput.value) {
        const url = new URL(window.location.href);
        dateInput.value = url.searchParams.get("date") || "";
      }

      selectSlot(slotId, true);
    });
  });

  slotSelect.addEventListener("change", () => {
    updateSelectedSlotDisplay(slotSelect.value);
  });

  updateSelectedSlotDisplay(slotSelect.value);
});
