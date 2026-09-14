import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

type TarjetaPrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export function TarjetaPrimaryButton({
  children,
  loading = false,
  disabled,
  className = '',
  ...rest
}: TarjetaPrimaryButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-lg bg-[#3B6FBF] text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_20px_-10px_rgba(59,111,191,0.9)] transition-colors hover:bg-[#2E5AA3] disabled:cursor-wait disabled:opacity-70 ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 size={18} className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
