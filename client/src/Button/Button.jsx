import cn from './Button.module.scss'

export function Button({
  children,
  onClick,
  variant = 'primary', // primary, secondary, danger
  size = 'medium', // small, medium, large
  disabled = false,
  className = '',
  ...props
}) {
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
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
