import type { TripSummary } from "@camping/shared";

type TripListProps = {
  items: TripSummary[];
  selectedTripId: string | null;
  onSelect: (tripId: string) => void;
  isLoading: boolean;
};

export function TripList({
  items,
  selectedTripId,
  onSelect,
  isLoading,
}: TripListProps) {
  return (
    <section className="panel">
      <div className="panel__eyebrow">Trips</div>
      <div className="panel__header">
        <h2>분석 대상 목록</h2>
        <span className="pill">{items.length}건</span>
      </div>
      <p className="panel__copy">
        실제 분석 단위는 <code>.camping-data/trips/&lt;trip-id&gt;.yaml</code>
        이다.
      </p>

      {isLoading ? (
        <div className="empty-state">trip 목록을 불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          등록된 trip이 없다. 먼저 시드 데이터를 만들거나 trip 파일을 추가해야
          한다.
        </div>
      ) : (
        <div className="trip-list">
          {items.map((item) => (
            <button
              key={item.trip_id}
              className={`trip-list__item${
                selectedTripId === item.trip_id ? " trip-list__item--active" : ""
              }`}
              onClick={() => onSelect(item.trip_id)}
              type="button"
            >
              <div className="trip-list__title">{item.title}</div>
              <div className="trip-list__meta">
                <span>{item.start_date ?? "날짜 미입력"}</span>
                <span>{item.region ?? "지역 미입력"}</span>
              </div>
              <code className="trip-list__id">{item.trip_id}</code>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
