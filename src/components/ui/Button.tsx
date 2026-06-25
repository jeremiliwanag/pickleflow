interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  fullWidth?: boolean;
  disabled?: boolean;
}

export default function Button({
  label,
  onClick,
  variant = "primary",
  fullWidth = false,
  disabled = false,
}: ButtonProps) {
  const base =
    "px-4 py-3 rounded-xl font-semibold text-base transition-all active:scale-95";
  const variants = {
    primary: "bg-green-600 text-white hover:bg-green-700",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300",
    danger: "bg-red-500 text-white hover:bg-red-600",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${
        fullWidth ? "w-full" : ""
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {label}
    </button>
  );
}