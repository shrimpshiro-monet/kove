export function JalebiLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/apple-touch-icon.png"
      alt="Jalebi logo"
      className={`w-8 h-8 ${className}`}
    />
  );
}
