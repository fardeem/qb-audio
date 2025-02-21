import React from "react";

interface LoadingButtonProps {
  onClick: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}
export function LoadingButton({
  onClick,
  children,
  className = "",
}: LoadingButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      await onClick();
    } catch (err) {
      alert(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={`${className} ${
        isLoading ? "cursor-wait opacity-75" : ""
      }`.trim()}
    >
      {isLoading ? "Loading..." : children}
    </button>
  );
}
