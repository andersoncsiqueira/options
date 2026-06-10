interface Props {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}

export default function MetricCard({ label, value, tone = "neutral" }: Props) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}