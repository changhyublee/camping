type StatusTone = "info" | "warning" | "error" | "success";

type StatusBannerProps = {
  tone: StatusTone;
  title: string;
  description?: string;
  items?: string[];
};

export function StatusBanner({
  tone,
  title,
  description,
  items,
}: StatusBannerProps) {
  return (
    <section className={`status-banner status-banner--${tone}`}>
      <div className="status-banner__title">{title}</div>
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
