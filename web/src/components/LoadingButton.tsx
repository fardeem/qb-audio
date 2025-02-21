import React from "react";

interface LoadingButtonProps {
  onClick: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
  isLoading?: boolean;
  disabled?: boolean;
}
export function LoadingButton({
  onClick,
  children,
  className = "",
  isLoading: isLoadingProp = false,
  disabled = false,
}: LoadingButtonProps) {
  const [isLoading, setIsLoading] = React.useState(isLoadingProp);

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
      disabled={isLoading || disabled}
      className={`${className} ${
        isLoading ? "cursor-wait opacity-75" : ""
      }`.trim()}
    >
      {isLoading ? "Loading..." : children}
    </button>
  );
}
