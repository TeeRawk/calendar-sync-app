import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', fullWidth = false, ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-manipulation select-none',
          'active:scale-95 transition-transform duration-100', // Mobile press feedback
          {
            'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500 active:bg-primary-800': variant === 'primary',
            'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-500 active:bg-gray-300': variant === 'secondary',
            'border border-gray-300 bg-white hover:bg-gray-50 focus-visible:ring-gray-500 active:bg-gray-100': variant === 'outline',
            'hover:bg-gray-100 focus-visible:ring-gray-500 active:bg-gray-200': variant === 'ghost',
            // Mobile-first sizing with larger touch targets
            'h-12 px-4 text-sm min-w-[44px] sm:h-9 sm:px-3 sm:text-xs': size === 'sm',
            'h-12 px-6 text-base min-w-[44px] sm:h-10 sm:px-4 sm:text-sm': size === 'md',
            'h-14 px-8 text-lg min-w-[44px] sm:h-12 sm:px-6 sm:text-base': size === 'lg',
            'w-full': fullWidth,
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };