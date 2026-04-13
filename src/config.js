const APP_TIME_ZONE = "Asia/Seoul";
const MIN_ATTENDEES = 1;
const ROOM_MODES = {
  AVAILABLE: "available",
  FIXED: "fixed",
  CLOSED: "closed",
};

const NOTICE_ITEMS = [
  {
    id: "booking-open",
    title: "예약 오픈 안내",
    detail: "오픈 전에는 예약 버튼이 잠겨 있습니다. 정확한 요일과 시간은 상단 안내를 확인해 주세요.",
    screens: ["intro"],
  },
  {
    id: "slot-four-order",
    title: "4타임 주문 안내",
    detail: "4타임은 14:30 전에 주문을 완료해 주세요.",
    screens: ["form"],
    slotIds: [4],
  },
  {
    id: "outside-food",
    title: "외부 음식 반입 불가",
    detail: "타카페 음료와 외부 음식은 반입할 수 없습니다.",
    screens: ["intro", "form"],
  },
];

const DEFAULT_ROOMS = [
  {
    id: 1,
    name: "1번 사랑방",
    defaultCapacity: null,
    defaultDescription: "소그룹 나눔과 짧은 상담에 적합한 아늑한 방입니다.",
    defaultImageUrl: "https://picsum.photos/seed/koinori-room-1/1200/800",
  },
  {
    id: 2,
    name: "2번 희락방",
    defaultCapacity: null,
    defaultDescription: "교제와 간단한 모임을 운영하기 좋은 밝은 분위기의 방입니다.",
    defaultImageUrl: "https://picsum.photos/seed/koinori-room-2/1200/800",
  },
  {
    id: 3,
    name: "3번 화평방",
    defaultCapacity: null,
    defaultDescription: "팀 미팅이나 성경공부처럼 집중이 필요한 모임에 잘 맞습니다.",
    defaultImageUrl: "https://picsum.photos/seed/koinori-room-3/1200/800",
  },
  {
    id: 4,
    name: "4번 오래참음방",
    defaultCapacity: null,
    defaultDescription: "조용한 대화와 정돈된 모임 운영에 적합한 중형 방입니다.",
    defaultImageUrl: "https://picsum.photos/seed/koinori-room-4/1200/800",
  },
  {
    id: 5,
    name: "5번 자비방",
    defaultCapacity: null,
    defaultDescription: "상담, 기도 모임, 소규모 리더 모임에 어울리는 방입니다.",
    defaultImageUrl: "https://picsum.photos/seed/koinori-room-5/1200/800",
  },
  {
    id: 6,
    name: "6번 양선방",
    defaultCapacity: null,
    defaultDescription: "식사 후 교제나 짧은 회의를 진행하기 좋은 편안한 방입니다.",
    defaultImageUrl: "https://picsum.photos/seed/koinori-room-6/1200/800",
  },
  {
    id: 7,
    name: "7번 충성방",
    defaultCapacity: null,
    defaultDescription: "중간 규모 모임을 안정적으로 수용할 수 있는 방입니다.",
    defaultImageUrl: "https://picsum.photos/seed/koinori-room-7/1200/800",
  },
  {
    id: 8,
    name: "8번 온유방",
    defaultCapacity: null,
    defaultDescription: "조용하고 차분한 흐름이 필요한 모임에 적합한 방입니다.",
    defaultImageUrl: "https://picsum.photos/seed/koinori-room-8/1200/800",
  },
  {
    id: 9,
    name: "9번 겨울방",
    defaultCapacity: null,
    defaultDescription: "여유 있는 배치가 가능한 넓은 방으로 공동체 모임에 적합합니다.",
    defaultImageUrl: "https://picsum.photos/seed/koinori-room-9/1200/800",
  },
];

const TIME_SLOTS = [
  {
    id: 1,
    label: "1타임",
    startsAt: "09:00",
    endsAt: "10:30",
    defaultMode: ROOM_MODES.AVAILABLE,
  },
  {
    id: 2,
    label: "2타임",
    startsAt: "10:30",
    endsAt: "12:30",
    defaultMode: ROOM_MODES.AVAILABLE,
  },
  {
    id: 3,
    label: "3타임",
    startsAt: "12:30",
    endsAt: "14:30",
    defaultMode: ROOM_MODES.AVAILABLE,
  },
  {
    id: 4,
    label: "4타임",
    startsAt: "14:30",
    endsAt: "16:30",
    defaultMode: ROOM_MODES.AVAILABLE,
  },
  {
    id: 5,
    label: "5타임",
    startsAt: "16:30",
    endsAt: "18:00",
    defaultMode: ROOM_MODES.FIXED,
    defaultLabel: "젊은이교회 셀 고정 사용",
  },
  {
    id: 6,
    label: "6타임",
    startsAt: "18:00",
    endsAt: "19:30",
    defaultMode: ROOM_MODES.AVAILABLE,
  },
];

module.exports = {
  APP_TIME_ZONE,
  MIN_ATTENDEES,
  NOTICE_ITEMS,
  DEFAULT_ROOMS,
  ROOM_MODES,
  TIME_SLOTS,
};
