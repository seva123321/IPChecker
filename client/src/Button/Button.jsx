import { forwardRef } from 'react'
import cn from './Button.module.scss'

export const Button = forwardRef(
  (
    {
      children,
      onClick,
      variant = 'primary', // primary, secondary, danger
      size = 'medium', // small, medium, large
      disabled = false,
      className = '',
      ...props
    },
    ref
  ) => {
    const buttonClasses = [
      cn.button,
      cn[variant],
      cn[size],
      disabled && cn.disabled,
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button
        ref={ref}
        className={buttonClasses}
        onClick={onClick}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
