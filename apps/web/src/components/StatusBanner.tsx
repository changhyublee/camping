type StatusTone = "info" | "warning" | "error" | "success";

type StatusBannerProps = {
  tone: StatusTone;
  title: string;
  description?: string;
  items?: string[];
  variant?: "inline" | "floating";
  onDismiss?: () => void;
};

export function StatusBanner({
  tone,
  title,
  description,
  items,
  variant = "inline",
  onDismiss,
}: StatusBannerProps) {
  return (
    <section
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`status-banner status-banner--${tone} status-banner--${variant}`}
      role="status"
    >
      <div className="status-banner__header">
        <div className="status-banner__title">{title}</div>
        {onDismiss ? (
          <button
            aria-label="상태 메시지 닫기"
            className="status-banner__close"
            onClick={onDismiss}
            type="button"
          >
            닫기
          </button>
        ) : null}
      </div>
      {description ? (
        <p className="status-banner__description">{description}</p>
      ) : null}
      {items && items.length > 0 ? (
        <ul className="status-banner__list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
