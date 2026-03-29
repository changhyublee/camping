export function InfoTooltip(props: { text: string }) {
  return (
    <span aria-hidden="true" className="info-tooltip" title={props.text}>
      <span className="info-tooltip__icon">i</span>
    </span>
  );
}
