import { useCallback, useState, FC, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

const PasswordInput: FC<PasswordInputProps> = ({
  className = "",
  ...props
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = useCallback((): void => {
    setIsVisible((visible) => !visible);
  }, []);

  const visibilityLabel = isVisible ? "Hide password" : "Show password";

  return (
    <div className="relative w-full min-w-0">
      <input
        {...props}
        type={isVisible ? "text" : "password"}
        className={`${className} block pr-12`}
      />
      <button
        type="button"
        onClick={toggleVisibility}
        aria-label={visibilityLabel}
        aria-pressed={isVisible}
        title={visibilityLabel}
        className="absolute right-0 top-0 h-full w-12 grid place-items-center text-brand-muted hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-red rounded-r-xl"
      >
        {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};

export default PasswordInput;
