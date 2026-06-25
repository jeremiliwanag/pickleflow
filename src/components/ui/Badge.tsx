interface BadgeProps {
  label: string;
  color?: "green" | "yellow" | "red" | "blue" | "gray";
}

export default function Badge({ label, color = "gray" }: BadgeProps) {
  const colors = {
    green: "bg-green-100 text-green-800",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
    gray: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-full ${colors[color]}`}
    >
      {label}
    </span>
  );
}